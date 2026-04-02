// ============================================
// SiteVibe ジョブランナーサーバー（Phase E: 強化版）
// Bun SQLite 永続化 + ジョブキュー + タイムアウト強化
// ============================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { Database } from "bun:sqlite";
import { join } from "path";

const app = new Hono();
app.use("*", cors());

// ─── 設定 ───
const API_TOKEN = process.env.AGENT_API_TOKEN || "dev-token";
const DEFAULT_REPO_PATH = process.env.DEFAULT_REPO_PATH || `${process.env.HOME}/01_開発/01_自社プロダクト/SiteVibe`;
const MAX_CONCURRENT = 3;
const JOB_TIMEOUT_MS = 180_000; // 180秒
const RUN_SCRIPT = import.meta.dir + "/run-claude.sh";

// ─── SQLite 初期化 ───
const DB_PATH = join(import.meta.dir, "data", "jobs.db");
const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    repo_path TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    result TEXT,
    diff TEXT,
    error TEXT,
    commit_hash TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    approved_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    message TEXT NOT NULL,
    commit_hash TEXT,
    diff TEXT,
    result TEXT,
    approved_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
  CREATE INDEX IF NOT EXISTS idx_history_client ON history(client_id);
`);

// 起動時: 前回クラッシュで running のまま残ったジョブを error に
db.exec(`UPDATE jobs SET status = 'error', error = 'サーバー再起動により中断', completed_at = ${Date.now()} WHERE status = 'running'`);

// Prepared statements
const stmts = {
  insertJob: db.prepare("INSERT INTO jobs (id, client_id, repo_path, message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)"),
  getJob: db.prepare("SELECT * FROM jobs WHERE id = ?"),
  updateJobStatus: db.prepare("UPDATE jobs SET status = ?, completed_at = ? WHERE id = ?"),
  updateJobResult: db.prepare("UPDATE jobs SET status = 'done', result = ?, diff = ?, completed_at = ? WHERE id = ?"),
  updateJobError: db.prepare("UPDATE jobs SET status = 'error', error = ?, completed_at = ? WHERE id = ?"),
  updateJobApproved: db.prepare("UPDATE jobs SET commit_hash = ?, approved_at = ? WHERE id = ?"),
  getRunningForClient: db.prepare("SELECT id FROM jobs WHERE client_id = ? AND status IN ('pending', 'running') LIMIT 1"),
  getPendingJobs: db.prepare("SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC"),
  countRunning: db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'running'"),
  deleteJob: db.prepare("DELETE FROM jobs WHERE id = ?"),
  insertHistory: db.prepare("INSERT INTO history (id, client_id, message, commit_hash, diff, result, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  getHistory: db.prepare("SELECT * FROM history WHERE client_id = ? ORDER BY approved_at DESC LIMIT 20"),
};

// ─── ジョブキュー ───
let runningCount = 0;
let shuttingDown = false;

function processQueue() {
  if (shuttingDown) return;

  const running = stmts.countRunning.get() as { count: number };
  runningCount = running.count;

  if (runningCount >= MAX_CONCURRENT) return;

  const pending = stmts.getPendingJobs.get() as any;
  if (!pending) return;

  runJob(pending);
}

// ─── 認証ミドルウェア ───
app.use("/jobs/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${API_TOKEN}`) {
    return c.json({ error: "認証が必要です" }, 401);
  }
  await next();
});

app.use("/history/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${API_TOKEN}`) {
    return c.json({ error: "認証が必要です" }, 401);
  }
  await next();
});

// ─── ジョブ投入 ───
app.post("/jobs", async (c) => {
  if (shuttingDown) {
    return c.json({ error: "サーバーがシャットダウン中です" }, 503);
  }

  const body = await c.req.json<{ message: string; clientId?: string; repoPath?: string }>();

  if (!body.message?.trim()) {
    return c.json({ error: "message は必須です" }, 400);
  }

  const clientId = body.clientId || "default";
  const repoPath = body.repoPath || DEFAULT_REPO_PATH;
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 同一クライアントで実行中/待機中のジョブがあるかチェック
  const existing = stmts.getRunningForClient.get(clientId) as any;
  if (existing) {
    return c.json({
      error: "実行中または待機中のジョブがあります。完了をお待ちください。",
      existingJobId: existing.id,
    }, 429);
  }

  stmts.insertJob.run(id, clientId, repoPath, body.message.trim(), Date.now());

  // キュー処理開始
  processQueue();

  return c.json({ id, status: "pending" });
});

// ─── ジョブ状態確認 ───
app.get("/jobs/:id", (c) => {
  const job = stmts.getJob.get(c.req.param("id")) as any;
  if (!job) return c.json({ error: "ジョブが見つかりません" }, 404);

  return c.json({
    id: job.id,
    status: job.status,
    result: job.result,
    diff: job.diff,
    error: job.error,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
});

// ─── ジョブ承認（git commit + push） ───
app.post("/jobs/:id/approve", async (c) => {
  const job = stmts.getJob.get(c.req.param("id")) as any;
  if (!job) return c.json({ error: "ジョブが見つかりません" }, 404);
  if (job.status !== "done") return c.json({ error: "ジョブが完了していません" }, 400);

  const repoPath = job.repo_path || DEFAULT_REPO_PATH;

  try {
    const commitMsg = `[Vibe] ${job.message}`;
    await Bun.$`cd ${repoPath} && git add -A && git commit -m ${commitMsg}`.text();
    await Bun.$`cd ${repoPath} && git push`.text();

    const hash = (await Bun.$`cd ${repoPath} && git rev-parse --short HEAD`.text()).trim();

    stmts.updateJobApproved.run(hash, Date.now(), job.id);
    stmts.insertHistory.run(job.id, job.client_id, job.message, hash, job.diff, job.result, Date.now());

    return c.json({ success: true, commit: commitMsg, hash });
  } catch (err: any) {
    return c.json({ error: "デプロイに失敗しました", detail: err.message }, 500);
  }
});

// ─── ジョブ却下（git reset） ───
app.post("/jobs/:id/reject", async (c) => {
  const job = stmts.getJob.get(c.req.param("id")) as any;
  if (!job) return c.json({ error: "ジョブが見つかりません" }, 404);
  if (job.status !== "done") return c.json({ error: "ジョブが完了していません" }, 400);

  const repoPath = job.repo_path || DEFAULT_REPO_PATH;

  try {
    await Bun.$`cd ${repoPath} && git checkout -- . && git clean -fd`.text();
    stmts.deleteJob.run(job.id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "リセットに失敗しました", detail: err.message }, 500);
  }
});

// ─── 変更履歴 ───
app.get("/history", (c) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${API_TOKEN}`) {
    return c.json({ error: "認証が必要です" }, 401);
  }
  const clientId = c.req.query("clientId") || "default";
  const entries = stmts.getHistory.all(clientId);
  return c.json({ history: entries });
});

// ─── ロールバック ───
app.post("/history/:hash/rollback", async (c) => {
  const hash = c.req.param("hash");
  const clientId = c.req.query("clientId") || "default";
  // repo_path は履歴から引けないので DEFAULT_REPO_PATH を使用
  const repoPath = DEFAULT_REPO_PATH;

  try {
    await Bun.$`cd ${repoPath} && git revert --no-edit ${hash}`.text();
    await Bun.$`cd ${repoPath} && git push`.text();

    const newHash = (await Bun.$`cd ${repoPath} && git rev-parse --short HEAD`.text()).trim();

    stmts.insertHistory.run(
      `rollback-${Date.now()}`,
      clientId,
      `ロールバック: ${hash} を取り消し`,
      newHash,
      null,
      null,
      Date.now()
    );

    return c.json({ success: true, revertedHash: hash, newHash });
  } catch (err: any) {
    return c.json({ error: "ロールバックに失敗しました", detail: err.message }, 500);
  }
});

// ─── プレビュー ───
app.get("/preview/*", async (c) => {
  const clientId = c.req.query("clientId") || "default";
  // プレビューは DEFAULT_REPO_PATH を使用（ジョブ実行中のリポ）
  const repoPath = DEFAULT_REPO_PATH;
  const filePath = c.req.path.replace("/preview", "") || "/index.html";
  const fullPath = `${repoPath}${filePath}`;

  try {
    const file = Bun.file(fullPath);
    if (!await file.exists()) {
      return new Response("Not Found", { status: 404 });
    }

    if (filePath.endsWith(".html") || filePath === "/") {
      const actualPath = filePath === "/" ? `${repoPath}/index.html` : fullPath;
      let html = await Bun.file(actualPath).text();
      html = html.replace(/href="css\//g, 'href="/preview/css/');
      html = html.replace(/href="\.\.\//g, 'href="/preview/');
      html = html.replace(/src="js\//g, 'src="/preview/js/');
      html = html.replace(/src="\.\.\//g, 'src="/preview/');
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(file, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
});

app.get("/preview", async (c) => {
  const repoPath = DEFAULT_REPO_PATH;
  const raw = c.req.query("raw") === "1";
  try {
    let html = await Bun.file(`${repoPath}/index.html`).text();
    if (!raw) {
      html = html.replace(/href="css\//g, 'href="/preview/css/');
      html = html.replace(/src="js\//g, 'src="/preview/js/');
    }
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return new Response("<h1>プレビューを読み込めませんでした</h1>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});

// ─── ヘルスチェック ───
app.get("/health", (c) => {
  const running = stmts.countRunning.get() as { count: number };
  const pending = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'").get() as { count: number };
  const total = db.prepare("SELECT COUNT(*) as count FROM jobs").get() as { count: number };
  const historyCount = db.prepare("SELECT COUNT(*) as count FROM history").get() as { count: number };

  return c.json({
    status: shuttingDown ? "shutting_down" : "ok",
    runningJobs: running.count,
    queuedJobs: pending.count,
    totalJobs: total.count,
    historyEntries: historyCount.count,
    maxConcurrent: MAX_CONCURRENT,
    uptime: process.uptime(),
  });
});

// ─── Claude Code CLI 実行 ───

async function runJob(job: any) {
  const repoPath = job.repo_path || DEFAULT_REPO_PATH;

  // running に更新
  db.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(job.id);
  runningCount++;

  try {
    // 未コミットの変更を退避
    try {
      await Bun.$`cd ${repoPath} && git stash`.quiet();
    } catch { /* stash 対象がない場合は無視 */ }

    // run-claude.sh 経由で CLI 実行
    const proc = Bun.spawn(["bash", RUN_SCRIPT, repoPath, job.message], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    // タイムアウト（180秒）: SIGTERM → 5秒待機 → SIGKILL
    let timedOut = false;
    const timeout = setTimeout(async () => {
      timedOut = true;
      proc.kill("SIGTERM");
      await Bun.sleep(5000);
      try { proc.kill("SIGKILL"); } catch { /* 既に終了 */ }
    }, JOB_TIMEOUT_MS);

    const result = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    if (timedOut) {
      // タイムアウト時のクリーンアップ
      try {
        await Bun.$`cd ${repoPath} && git checkout -- . && git clean -fd`.quiet();
      } catch { /* 無視 */ }
      stmts.updateJobError.run(`タイムアウト（${JOB_TIMEOUT_MS / 1000}秒）`, Date.now(), job.id);
      console.log(`[Job ${job.id}] タイムアウト: ${job.message}`);
    } else if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      stmts.updateJobError.run(`Claude Code 終了コード ${exitCode}: ${stderr.slice(0, 500)}`, Date.now(), job.id);
      console.error(`[Job ${job.id}] エラー: 終了コード ${exitCode}`);
      // エラー時はリポジトリを元に戻す
      try {
        await Bun.$`cd ${repoPath} && git checkout -- . && git clean -fd`.quiet();
      } catch { /* 無視 */ }
    } else {
      // 成功: git diff を取得
      const diffProc = Bun.spawn(["git", "diff"], { cwd: repoPath, stdout: "pipe" });
      const diff = await new Response(diffProc.stdout).text();

      stmts.updateJobResult.run(result, diff || "（変更なし）", Date.now(), job.id);
      console.log(`[Job ${job.id}] 完了: ${job.message}`);
    }
  } catch (err: any) {
    stmts.updateJobError.run(err.message || "不明なエラー", Date.now(), job.id);
    console.error(`[Job ${job.id}] エラー:`, err.message);

    // エラー時はリポジトリを元に戻す
    const repoPathFallback = job.repo_path || DEFAULT_REPO_PATH;
    try {
      await Bun.$`cd ${repoPathFallback} && git checkout -- . && git clean -fd`.quiet();
    } catch { /* 無視 */ }
  } finally {
    runningCount--;
    // 次のキューを処理
    processQueue();
  }
}

// ─── Graceful Shutdown ───
process.on("SIGTERM", () => {
  console.log("SIGTERM 受信: 新規ジョブ受付停止、実行中ジョブの完了を待機...");
  shuttingDown = true;

  const checkAndExit = () => {
    const running = stmts.countRunning.get() as { count: number };
    if (running.count === 0) {
      console.log("全ジョブ完了。シャットダウンします。");
      db.close();
      process.exit(0);
    }
    setTimeout(checkAndExit, 1000);
  };
  checkAndExit();

  // 最大60秒待って強制終了
  setTimeout(() => {
    console.log("タイムアウト: 強制シャットダウン");
    db.close();
    process.exit(1);
  }, 60_000);
});

// ─── サーバー起動 ───
const PORT = parseInt(process.env.PORT || "3100");

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`🎤 Vibe ジョブランナー起動: http://localhost:${PORT}`);
console.log(`   認証トークン: ${API_TOKEN.slice(0, 8)}...`);
console.log(`   デフォルトリポ: ${DEFAULT_REPO_PATH}`);
console.log(`   最大同時実行: ${MAX_CONCURRENT}`);
console.log(`   タイムアウト: ${JOB_TIMEOUT_MS / 1000}秒`);
console.log(`   DB: ${DB_PATH}`);
