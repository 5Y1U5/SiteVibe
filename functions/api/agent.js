// ============================================
// SiteVibe — エージェントプロキシ
// ジョブランナーサーバーへの転送
// Cloudflare Pages Functions
// ============================================

const ACTIONS = ['approve', 'reject'];

// ジョブ投入: POST /api/agent
export async function onRequestPost(context) {
  const { request, env } = context;

  const jobRunnerUrl = env.JOB_RUNNER_URL;
  const jobRunnerToken = env.JOB_RUNNER_TOKEN;

  if (!jobRunnerUrl || !jobRunnerToken) {
    return jsonResponse({ error: 'ジョブランナーが設定されていません' }, 500);
  }

  try {
    const body = await request.json();

    // ロールバック
    if (body.action === 'rollback' && body.hash) {
      const res = await fetch(`${jobRunnerUrl}/history/${body.hash}/rollback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jobRunnerToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    }

    // アクション（承認/却下）の場合
    if (body.action && body.jobId) {
      if (!ACTIONS.includes(body.action)) {
        return jsonResponse({ error: '無効なアクションです' }, 400);
      }

      const res = await fetch(`${jobRunnerUrl}/jobs/${body.jobId}/${body.action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jobRunnerToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      return jsonResponse(data, res.status);
    }

    // 新規ジョブ投入
    if (!body.message?.trim()) {
      return jsonResponse({ error: 'message は必須です' }, 400);
    }

    const res = await fetch(`${jobRunnerUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jobRunnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: body.message,
        clientId: body.clientId || 'default',
      }),
    });

    const data = await res.json();
    return jsonResponse(data, res.status);

  } catch (err) {
    console.error('agent proxy エラー:', err);
    return jsonResponse({ error: 'ジョブランナーに接続できません' }, 502);
  }
}

// ジョブ状態確認: GET /api/agent?jobId=xxx
export async function onRequestGet(context) {
  const { request, env } = context;

  const jobRunnerUrl = env.JOB_RUNNER_URL;
  const jobRunnerToken = env.JOB_RUNNER_TOKEN;

  if (!jobRunnerUrl || !jobRunnerToken) {
    return jsonResponse({ error: 'ジョブランナーが設定されていません' }, 500);
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  const action = url.searchParams.get('action');

  try {
    // 履歴取得
    if (action === 'history') {
      const res = await fetch(`${jobRunnerUrl}/history`, {
        headers: { 'Authorization': `Bearer ${jobRunnerToken}` },
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    }

    // ジョブ状態確認
    if (!jobId) {
      return jsonResponse({ error: 'jobId パラメータは必須です' }, 400);
    }

    const res = await fetch(`${jobRunnerUrl}/jobs/${jobId}`, {
      headers: { 'Authorization': `Bearer ${jobRunnerToken}` },
    });
    const data = await res.json();
    return jsonResponse(data, res.status);

  } catch (err) {
    console.error('agent proxy エラー:', err);
    return jsonResponse({ error: 'ジョブランナーに接続できません' }, 502);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
