// ============================================
// SiteVibe — ブログ記事 CRUD API
// GET: 公開記事は認証不要、管理系は認証必須
// PUT/DELETE: 認証必須
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const url = new URL(request.url);

  const id = url.searchParams.get('id');
  const clientId = url.searchParams.get('client_id');
  const status = url.searchParams.get('status') || 'published';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // 記事詳細
  if (id) {
    const post = await env.DB.prepare(
      `SELECT id, client_id, title, content, slug, status, meta_description, published_at, created_at, updated_at
       FROM blog_posts WHERE id = ?`
    ).bind(id).first();

    if (!post) {
      return jsonResponse({ error: '記事が見つかりません' }, 404);
    }

    // 非公開記事は認証必須 + オーナーチェック
    if (post.status !== 'published') {
      if (!user || (user.role !== 'admin' && user.clientId !== post.client_id)) {
        return jsonResponse({ error: 'アクセス権限がありません' }, 403);
      }
    }

    return jsonResponse(post);
  }

  // 記事一覧
  const targetClientId = clientId || (user?.clientId);

  if (!targetClientId) {
    return jsonResponse({ error: 'client_id パラメータは必須です' }, 400);
  }

  // 非公開記事の一覧は認証必須
  if (status !== 'published') {
    if (!user || (user.role !== 'admin' && user.clientId !== targetClientId)) {
      return jsonResponse({ error: 'アクセス権限がありません' }, 403);
    }
  }

  const posts = await env.DB.prepare(
    `SELECT id, title, slug, status, meta_description, published_at, created_at, updated_at
     FROM blog_posts
     WHERE client_id = ? AND status = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(targetClientId, status, limit, offset).all();

  const total = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM blog_posts
     WHERE client_id = ? AND status = ?`
  ).bind(targetClientId, status).first();

  return jsonResponse({
    posts: posts.results,
    total: total.count,
    limit,
    offset,
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!user) {
    return jsonResponse({ error: '認証が必要です' }, 401);
  }

  const body = await request.json();
  const { id, title, content, slug, status } = body;

  if (!id) {
    return jsonResponse({ error: 'id は必須です' }, 400);
  }

  // オーナーチェック
  const post = await env.DB.prepare(
    `SELECT client_id FROM blog_posts WHERE id = ?`
  ).bind(id).first();

  if (!post) {
    return jsonResponse({ error: '記事が見つかりません' }, 404);
  }

  if (user.role !== 'admin' && user.clientId !== post.client_id) {
    return jsonResponse({ error: 'アクセス権限がありません' }, 403);
  }

  // 更新フィールドを構築
  const updates = [];
  const values = [];

  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (content !== undefined) { updates.push('content = ?'); values.push(content); }
  if (slug !== undefined) { updates.push('slug = ?'); values.push(slug); }
  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
    if (status === 'published') {
      updates.push('published_at = unixepoch()');
    }
  }

  if (updates.length === 0) {
    return jsonResponse({ error: '更新するフィールドがありません' }, 400);
  }

  updates.push('updated_at = unixepoch()');
  values.push(id);

  await env.DB.prepare(
    `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return jsonResponse({ success: true, id });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!user) {
    return jsonResponse({ error: '認証が必要です' }, 401);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return jsonResponse({ error: 'id は必須です' }, 400);
  }

  // オーナーチェック
  const post = await env.DB.prepare(
    `SELECT client_id FROM blog_posts WHERE id = ?`
  ).bind(id).first();

  if (!post) {
    return jsonResponse({ error: '記事が見つかりません' }, 404);
  }

  if (user.role !== 'admin' && user.clientId !== post.client_id) {
    return jsonResponse({ error: 'アクセス権限がありません' }, 403);
  }

  await env.DB.prepare(
    `DELETE FROM blog_posts WHERE id = ?`
  ).bind(id).run();

  return jsonResponse({ success: true, id });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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
