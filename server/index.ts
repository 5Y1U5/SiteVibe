// ============================================
// SiteVibe ジョブランナーサーバー
// Claude Code CLI を呼び出してサイトを改修する
// ============================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS
app.use('*', cors());

// 認証ミドルウェア
const API_TOKEN = process.env.AGENT_API_TOKEN || 'dev-token';

app.use('/jobs/*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (auth !== `Bearer ${API_TOKEN}`) {
    return c.json({ error: '認証が必要です' }, 401);
  }
  await next();
});

// ─── ジョブ管理 ───

interface Job {
  id: string;
  clientId: string;
  message: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
  diff?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const jobs = new Map<string, Job>();
let jobCounter = 0;

// ジョブ投入
app.post('/jobs', async (c) => {
  const body = await c.req.json<{ message: string; clientId?: string }>();

  if (!body.message?.trim()) {
    return c.json({ error: 'message は必須です' }, 400);
  }

  // 同一クライアントで実行中のジョブがあるかチェック
  const clientId = body.clientId || 'default';
  for (const job of jobs.values()) {
    if (job.clientId === clientId && (job.status === 'pending' || job.status === 'running')) {
      return c.json({ error: '実行中のジョブがあります。完了をお待ちください。' }, 429);
    }
  }

  const id = `job-${++jobCounter}-${Date.now()}`;
  const job: Job = {
    id,
    clientId,
    message: body.message.trim(),
    status: 'pending',
    createdAt: Date.now(),
  };

  jobs.set(id, job);

  // バックグラウンドで実行開始
  runJob(job);

  return c.json({ id: job.id, status: job.status });
});

// ジョブ状態確認
app.get('/jobs/:id', (c) => {
  const job = jobs.get(c.req.param('id'));
  if (!job) return c.json({ error: 'ジョブが見つかりません' }, 404);

  return c.json({
    id: job.id,
    status: job.status,
    result: job.result,
    diff: job.diff,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
});

// ジョブ承認（git commit + push）
app.post('/jobs/:id/approve', async (c) => {
  const job = jobs.get(c.req.param('id'));
  if (!job) return c.json({ error: 'ジョブが見つかりません' }, 404);
  if (job.status !== 'done') return c.json({ error: 'ジョブが完了していません' }, 400);

  try {
    const repoPath = getRepoPath(job.clientId);
    const commitMsg = `[Vibe] ${job.message}`;

    await Bun.$`cd ${repoPath} && git add -A && git commit -m ${commitMsg}`.text();
    const pushResult = await Bun.$`cd ${repoPath} && git push`.text();

    // コミットハッシュを取得して履歴に記録
    const hash = (await Bun.$`cd ${repoPath} && git rev-parse --short HEAD`.text()).trim();
    job.commitHash = hash;
    job.approvedAt = Date.now();

    // 履歴に追加
    history.unshift({
      id: job.id,
      message: job.message,
      commitHash: hash,
      diff: job.diff,
      result: job.result,
      approvedAt: Date.now(),
      clientId: job.clientId,
    });
    if (history.length > 50) history.pop();

    return c.json({ success: true, commit: commitMsg, hash });
  } catch (err: any) {
    return c.json({ error: 'デプロイに失敗しました', detail: err.message }, 500);
  }
});

// ジョブ却下（git reset）
app.post('/jobs/:id/reject', async (c) => {
  const job = jobs.get(c.req.param('id'));
  if (!job) return c.json({ error: 'ジョブが見つかりません' }, 404);
  if (job.status !== 'done') return c.json({ error: 'ジョブが完了していません' }, 400);

  try {
    const repoPath = getRepoPath(job.clientId);
    await Bun.$`cd ${repoPath} && git checkout -- .`.text();
    jobs.delete(job.id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'リセットに失敗しました', detail: err.message }, 500);
  }
});

// ─── 変更履歴 ───

interface HistoryEntry {
  id: string;
  message: string;
  commitHash: string;
  diff?: string;
  result?: string;
  approvedAt: number;
  clientId: string;
}

const history: HistoryEntry[] = [];

// 履歴一覧
app.get('/history', (c) => {
  const clientId = c.req.query('clientId') || 'default';
  const entries = history.filter(h => h.clientId === clientId).slice(0, 20);
  return c.json({ history: entries });
});

// ロールバック（指定コミットの変更を取り消し）
app.post('/history/:hash/rollback', async (c) => {
  const hash = c.req.param('hash');
  const clientId = c.req.query('clientId') || 'default';
  const repoPath = getRepoPath(clientId);

  try {
    // git revert で安全に取り消し
    await Bun.$`cd ${repoPath} && git revert --no-edit ${hash}`.text();
    await Bun.$`cd ${repoPath} && git push`.text();

    const newHash = (await Bun.$`cd ${repoPath} && git rev-parse --short HEAD`.text()).trim();

    history.unshift({
      id: `rollback-${Date.now()}`,
      message: `ロールバック: ${hash} を取り消し`,
      commitHash: newHash,
      approvedAt: Date.now(),
      clientId,
    });

    return c.json({ success: true, revertedHash: hash, newHash });
  } catch (err: any) {
    return c.json({ error: 'ロールバックに失敗しました', detail: err.message }, 500);
  }
});

// ヘルスチェック
app.get('/health', (c) => {
  return c.json({ status: 'ok', jobs: jobs.size, history: history.length, uptime: process.uptime() });
});

// ─── Claude Code CLI 実行 ───

// run-claude.sh がパス解決を担当
const RUN_SCRIPT = import.meta.dir + '/run-claude.sh';

function getRepoPath(clientId: string): string {
  const repos: Record<string, string> = {
    'default': process.env.DEFAULT_REPO_PATH || `${process.env.HOME}/01_開発/01_自社プロダクト/SiteVibe`,
    'demo': process.env.DEMO_REPO_PATH || `${process.env.HOME}/repos/sitevibe-demo`,
  };
  return repos[clientId] || repos['default'];
}

async function runJob(job: Job) {
  job.status = 'running';
  const repoPath = getRepoPath(job.clientId);

  try {
    // 未コミットの変更を退避
    try {
      await Bun.$`cd ${repoPath} && git stash`.quiet();
    } catch { /* stash 対象がない場合は無視 */ }

    // run-claude.sh 経由でCLI実行
    const proc = Bun.spawn(["bash", RUN_SCRIPT, repoPath, job.message], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    // タイムアウト（120秒）
    const timeout = setTimeout(() => {
      proc.kill();
      job.status = 'error';
      job.error = 'タイムアウト（120秒）';
      job.completedAt = Date.now();
    }, 120_000);

    const result = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Claude Code 終了コード ${exitCode}: ${stderr}`);
    }

    // git diff を取得
    const diffProc = Bun.spawn(['git', 'diff'], { cwd: repoPath, stdout: 'pipe' });
    const diff = await new Response(diffProc.stdout).text();

    job.result = result;
    job.diff = diff || '（変更なし）';
    job.status = 'done';
    job.completedAt = Date.now();

    console.log(`[Job ${job.id}] 完了: ${job.message}`);

  } catch (err: any) {
    job.status = 'error';
    job.error = err.message || '不明なエラー';
    job.completedAt = Date.now();
    console.error(`[Job ${job.id}] エラー:`, err.message);

    // エラー時はリポジトリを元に戻す
    try {
      await Bun.$`cd ${repoPath} && git checkout -- .`.quiet();
    } catch { /* 無視 */ }
  }
}

// ─── サーバー起動 ───

const PORT = parseInt(process.env.PORT || '3100');

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`🎤 Vibe ジョブランナー起動: http://localhost:${PORT}`);
console.log(`   認証トークン: ${API_TOKEN.slice(0, 8)}...`);
console.log(`   デフォルトリポ: ${getRepoPath('default')}`);
