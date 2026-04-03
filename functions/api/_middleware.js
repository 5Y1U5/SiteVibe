// ============================================
// SiteVibe — 認証ミドルウェア
// CF Access JWT デコード + D1 ユーザー解決
// functions/api/ 配下の全エンドポイントに適用
// ============================================

// Stripe Webhook は署名検証が別途行われるためスキップ
const PUBLIC_PATHS = ['/api/stripe-webhook', '/api/apply', '/api/blog-cron', '/api/cancel-cron'];
const PUBLIC_GET_PATHS = ['/api/blog-posts'];

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // 公開パスはスキップ
  if (PUBLIC_PATHS.some(p => url.pathname.startsWith(p))) {
    return next();
  }

  // GET のみ公開のパス（ブログ公開記事等）
  if (request.method === 'GET' && PUBLIC_GET_PATHS.some(p => url.pathname.startsWith(p))) {
    return next();
  }

  // OPTIONS（CORS プリフライト）はスキップ
  if (request.method === 'OPTIONS') {
    return next();
  }

  // CF Access JWT を取得（ヘッダー or Cookie）
  let jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) {
    const cookies = request.headers.get('Cookie') || '';
    const match = cookies.match(/CF_Authorization=([^;]+)/);
    if (match) jwt = match[1];
  }
  if (!jwt) {
    return jsonResponse({ error: '認証が必要です' }, 401);
  }

  try {
    // CF Access JWT ペイロードをデコード
    // 署名検証は CF Access ゲートウェイが実施済み
    // 有効期限のみアプリ側でチェック
    let payload;
    try {
      const payloadB64 = jwt.split('.')[1];
      const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - padded.length % 4) % 4);
      payload = JSON.parse(atob(padded + padding));
    } catch {
      return jsonResponse({ error: '無効なJWTフォーマットです' }, 401);
    }

    if (!payload.email) {
      return jsonResponse({ error: 'JWTにemailクレームがありません' }, 401);
    }

    // 有効期限チェック
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return jsonResponse({ error: 'トークンの有効期限が切れています' }, 401);
    }

    // D1 でユーザー情報を取得
    if (!env.DB) {
      return jsonResponse({ error: 'D1バインディングが設定されていません' }, 500);
    }

    const user = await env.DB.prepare(
      `SELECT u.email, u.client_id, u.role, u.display_name,
              c.name as client_name, c.plan, c.monthly_limit, c.repo_path, c.active
       FROM users u
       JOIN clients c ON u.client_id = c.id
       WHERE u.email = ?`
    ).bind(payload.email).first();

    if (!user) {
      return jsonResponse({ error: `未登録のユーザーです (${payload.email})` }, 403);
    }

    if (!user.active) {
      return jsonResponse({ error: 'アカウントが無効です' }, 403);
    }

    // context.data にユーザー情報を注入（下流の API で参照）
    data.user = {
      email: user.email,
      clientId: user.client_id,
      role: user.role,
      displayName: user.display_name,
      clientName: user.client_name,
      plan: user.plan,
      monthlyLimit: user.monthly_limit,
      repoPath: user.repo_path,
    };

    return next();
  } catch (err) {
    console.error('認証エラー:', err.message);
    return jsonResponse({ error: '認証処理でエラーが発生しました' }, 500);
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
