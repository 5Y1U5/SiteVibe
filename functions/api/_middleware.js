// ============================================
// SiteVibe — 認証ミドルウェア
// CF Access JWT 検証 + D1 ユーザー解決
// functions/api/ 配下の全エンドポイントに適用
// ============================================

// Stripe Webhook は署名検証が別途行われるためスキップ
const PUBLIC_PATHS = ['/api/stripe-webhook'];

// CF Access の JWKS キャッシュ（Worker インスタンス内で再利用）
let jwksCache = null;
let jwksCacheExpiry = 0;

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // 公開パスはスキップ
  if (PUBLIC_PATHS.some(p => url.pathname.startsWith(p))) {
    return next();
  }

  // OPTIONS（CORS プリフライト）はスキップ
  if (request.method === 'OPTIONS') {
    return next();
  }

  // CF Access JWT を取得（ヘッダー or Cookie）
  let jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) {
    // ブラウザからのリクエストは Cookie で送られる
    const cookies = request.headers.get('Cookie') || '';
    const match = cookies.match(/CF_Authorization=([^;]+)/);
    if (match) jwt = match[1];
  }
  if (!jwt) {
    const hasHeader = !!request.headers.get('Cf-Access-Jwt-Assertion');
    const hasCookie = (request.headers.get('Cookie') || '').includes('CF_Authorization');
    return jsonResponse({
      error: '認証が必要です',
      debug: { hasHeader, hasCookie, cookieKeys: (request.headers.get('Cookie') || '').split(';').map(c => c.trim().split('=')[0]).filter(Boolean) }
    }, 401);
  }

  try {
    // JWT 署名検証（CRITICAL: Architect 指摘対応）
    const payload = await verifyAccessJWT(jwt, env);

    if (!payload) {
      return jsonResponse({ error: 'JWT署名検証に失敗しました', debug: { jwtLength: jwt.length, hasDB: !!env.DB } }, 401);
    }

    if (!payload.email) {
      return jsonResponse({ error: 'JWTにemailクレームがありません', debug: { claims: Object.keys(payload) } }, 401);
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
      return jsonResponse({ error: '未登録のユーザーです' }, 403);
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

// ─── JWT 署名検証 ───

async function verifyAccessJWT(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  // ヘッダーをデコードして kid を取得
  const header = JSON.parse(decodeBase64Url(headerB64));
  if (header.alg !== 'RS256') return null;

  // JWKS から公開鍵を取得
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN || 'istyle';
  const publicKey = await getAccessPublicKey(teamDomain, header.kid);
  if (!publicKey) return null;

  // 署名を検証
  const signatureData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToArrayBuffer(signatureB64);

  const isValid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    publicKey,
    signature,
    signatureData
  );

  if (!isValid) return null;

  // ペイロードをデコード
  const payload = JSON.parse(decodeBase64Url(payloadB64));

  // 有効期限チェック
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now) return null;

  return payload;
}

async function getAccessPublicKey(teamDomain, kid) {
  // キャッシュチェック（5分間有効）
  if (jwksCache && Date.now() < jwksCacheExpiry) {
    return findKeyByKid(jwksCache, kid);
  }

  // CF Access の JWKS エンドポイントから公開鍵を取得
  const jwksUrl = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  const res = await fetch(jwksUrl);
  if (!res.ok) return null;

  const jwks = await res.json();
  jwksCache = jwks;
  jwksCacheExpiry = Date.now() + 5 * 60 * 1000;

  return findKeyByKid(jwks, kid);
}

async function findKeyByKid(jwks, kid) {
  const keys = jwks.keys || [];
  const jwk = kid ? keys.find(k => k.kid === kid) : keys[0];
  if (!jwk) return null;

  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

// ─── Base64URL ユーティリティ ───

function decodeBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - padded.length % 4) % 4);
  return atob(padded + padding);
}

function base64UrlToArrayBuffer(str) {
  const binary = decodeBase64Url(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
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
