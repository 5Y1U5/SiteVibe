// ============================================
// SiteVibe — ブログシリーズ CRUD API
// ============================================

// GET: シリーズ一覧
export async function onRequestGet(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!user) return jsonResponse({ error: '認証が必要です' }, 401);

  const series = await env.DB.prepare(
    `SELECT s.*, COUNT(bp.id) as post_count
     FROM blog_series s
     LEFT JOIN blog_posts bp ON bp.series_id = s.id
     WHERE s.client_id = ?
     GROUP BY s.id
     ORDER BY s.created_at DESC`
  ).bind(user.clientId).all();

  return jsonResponse({ series: series.results || [] });
}

// POST: シリーズ作成
export async function onRequestPost(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!user) return jsonResponse({ error: '認証が必要です' }, 401);

  const body = await request.json();
  const { name, description } = body;

  if (!name?.trim()) {
    return jsonResponse({ error: 'シリーズ名は必須です' }, 400);
  }

  const id = crypto.randomUUID();
  const slug = name.trim()
    .toLowerCase()
    .replace(/[ぁ-ん]/g, '') // ひらがな除去
    .replace(/[ァ-ヶ]/g, '') // カタカナ除去
    .replace(/[一-龥]/g, '') // 漢字除去
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30) || `series-${Date.now().toString(36)}`;

  // slug 重複チェック
  const existing = await env.DB.prepare(
    'SELECT id FROM blog_series WHERE client_id = ? AND slug = ?'
  ).bind(user.clientId, slug).first();

  const finalSlug = existing ? `${slug}-${Date.now().toString(36).slice(-4)}` : slug;

  await env.DB.prepare(
    `INSERT INTO blog_series (id, client_id, name, description, slug)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, user.clientId, name.trim(), description?.trim() || '', finalSlug).run();

  return jsonResponse({ id, name: name.trim(), slug: finalSlug }, 201);
}

// PUT: シリーズ更新
export async function onRequestPut(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!user) return jsonResponse({ error: '認証が必要です' }, 401);

  const body = await request.json();
  const { id, name, description } = body;

  if (!id) return jsonResponse({ error: 'id は必須です' }, 400);

  const series = await env.DB.prepare(
    'SELECT client_id FROM blog_series WHERE id = ?'
  ).bind(id).first();

  if (!series) return jsonResponse({ error: 'シリーズが見つかりません' }, 404);
  if (user.role !== 'admin' && user.clientId !== series.client_id) {
    return jsonResponse({ error: 'アクセス権限がありません' }, 403);
  }

  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description.trim()); }

  if (updates.length === 0) return jsonResponse({ error: '更新するフィールドがありません' }, 400);

  values.push(id);
  await env.DB.prepare(
    `UPDATE blog_series SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return jsonResponse({ success: true, id });
}

// DELETE: シリーズ削除
export async function onRequestDelete(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!user) return jsonResponse({ error: '認証が必要です' }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id パラメータは必須です' }, 400);

  const series = await env.DB.prepare(
    'SELECT client_id FROM blog_series WHERE id = ?'
  ).bind(id).first();

  if (!series) return jsonResponse({ error: 'シリーズが見つかりません' }, 404);
  if (user.role !== 'admin' && user.clientId !== series.client_id) {
    return jsonResponse({ error: 'アクセス権限がありません' }, 403);
  }

  // 記事のシリーズ参照を解除
  await env.DB.prepare(
    'UPDATE blog_posts SET series_id = NULL, series_order = NULL WHERE series_id = ?'
  ).bind(id).run();

  await env.DB.prepare('DELETE FROM blog_series WHERE id = ?').bind(id).run();

  return jsonResponse({ success: true });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
