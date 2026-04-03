// ============================================
// SiteVibe — ブログ画像配信 API（R2 から取得）
// GET /api/blog-images/blog/{client_id}/{uuid}.ext
// ============================================

export async function onRequestGet(context) {
  const { params, env } = context;
  const key = params.path.join('/');

  if (!key) {
    return new Response('Not Found', { status: 404 });
  }

  const object = await env.BLOG_IMAGES.get(key);

  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
