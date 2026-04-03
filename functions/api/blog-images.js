// ============================================
// SiteVibe — ブログ画像アップロード API
// POST: 画像を R2 に保存（認証必須）
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!user) {
    return jsonResponse({ error: '認証が必要です' }, 401);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return jsonResponse({ error: 'multipart/form-data で送信してください' }, 400);
  }

  const formData = await request.formData();
  const file = formData.get('image');

  if (!file || !(file instanceof File)) {
    return jsonResponse({ error: '画像ファイルが必要です' }, 400);
  }

  // 5MB 上限
  if (file.size > 5 * 1024 * 1024) {
    return jsonResponse({ error: '画像サイズは5MB以下にしてください' }, 400);
  }

  // MIME チェック
  const allowed = ['image/webp', 'image/jpeg', 'image/png', 'image/gif'];
  if (!allowed.includes(file.type)) {
    return jsonResponse({ error: '対応形式: WebP, JPEG, PNG, GIF' }, 400);
  }

  // 拡張子決定
  const ext = file.type === 'image/webp' ? 'webp'
    : file.type === 'image/jpeg' ? 'jpg'
    : file.type === 'image/png' ? 'png' : 'gif';

  const id = crypto.randomUUID();
  const key = `blog/${user.clientId}/${id}.${ext}`;

  await env.BLOG_IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const url = `/api/blog-images/${key}`;

  return jsonResponse({ url, key });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
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
