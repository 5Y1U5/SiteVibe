// ============================================
// SiteVibe — 解約自動処理 Cron API
// 猶予期間（14日）経過後にサイトを非公開化
// メンテナンスページをクライアントリポに差し替え
// ============================================

const GRACE_PERIOD_DAYS = 14;

export async function onRequestGet(context) {
  const { env, request } = context;

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (token !== env.JOB_RUNNER_TOKEN) {
    return jsonResponse({ error: '認証が必要です' }, 401);
  }

  const db = env.DB;
  const now = Math.floor(Date.now() / 1000);
  const graceLimit = now - (GRACE_PERIOD_DAYS * 24 * 60 * 60);

  // 猶予期間を過ぎた suspended クライアントを取得
  const expired = await db.prepare(
    `SELECT id, name, repo_path, suspended_at FROM clients
     WHERE active = 1 AND suspended_at IS NOT NULL AND suspended_at <= ?`
  ).bind(graceLimit).all();

  const clients = expired.results || [];
  if (clients.length === 0) {
    return jsonResponse({ processed: 0, message: '非公開化対象のクライアントはありません' });
  }

  const results = [];

  for (const client of clients) {
    try {
      // D1で非公開化
      await db.prepare(
        'UPDATE clients SET active = 0 WHERE id = ?'
      ).bind(client.id).run();

      // ジョブランナーにメンテナンスページ差し替えを依頼
      if (client.repo_path && env.JOB_RUNNER_URL && env.JOB_RUNNER_TOKEN) {
        await fetch(`${env.JOB_RUNNER_URL}/site-suspend`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.JOB_RUNNER_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ repoPath: client.repo_path, clientName: client.name }),
        });
      }

      results.push({ id: client.id, name: client.name, status: 'deactivated' });
      console.log(`非公開化完了: ${client.id} (${client.name})`);
    } catch (err) {
      console.error(`非公開化エラー: ${client.id}`, err.message);
      results.push({ id: client.id, status: 'error', error: err.message });
    }
  }

  return jsonResponse({ processed: results.filter(r => r.status === 'deactivated').length, results });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
