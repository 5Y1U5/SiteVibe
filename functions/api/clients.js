// ============================================
// SiteVibe — クライアント管理 API
// 全操作 admin ロール専用
// ============================================

const PLAN_LIMITS = {
  light: 3,
  standard: 10,
  premium: 30,
};

function adminGuard(user) {
  if (!user || user.role !== 'admin') {
    return jsonResponse({ error: '管理者権限が必要です' }, 403);
  }
  return null;
}

export async function onRequestGet(context) {
  const { env } = context;
  const user = context.data?.user;
  const guard = adminGuard(user);
  if (guard) return guard;

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  // 単体取得（ユーザー一覧付き）
  if (id) {
    const client = await env.DB.prepare(
      `SELECT * FROM clients WHERE id = ?`
    ).bind(id).first();

    if (!client) {
      return jsonResponse({ error: 'クライアントが見つかりません' }, 404);
    }

    const users = await env.DB.prepare(
      `SELECT email, role, display_name, created_at FROM users WHERE client_id = ?`
    ).bind(id).all();

    return jsonResponse({ ...client, users: users.results });
  }

  // 一覧取得
  const clients = await env.DB.prepare(
    `SELECT id, name, plan, monthly_limit, stripe_customer_id, stripe_subscription_id,
            chatta_plan, blog_plan, active, created_at
     FROM clients ORDER BY created_at DESC`
  ).all();

  return jsonResponse({ clients: clients.results });
}

export async function onRequestPost(context) {
  const { env } = context;
  const user = context.data?.user;
  const guard = adminGuard(user);
  if (guard) return guard;

  const body = await context.request.json();
  const { id, name, plan, repo_path, stripe_customer_id } = body;

  if (!id?.trim() || !name?.trim()) {
    return jsonResponse({ error: 'id と name は必須です' }, 400);
  }

  // id フォーマットチェック（英数字+ハイフン）
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && id.length > 1 || id.length === 1 && !/^[a-z0-9]$/.test(id)) {
    return jsonResponse({ error: 'id は英小文字・数字・ハイフンのみ使用可能です' }, 400);
  }

  // 重複チェック
  const existing = await env.DB.prepare(
    `SELECT id FROM clients WHERE id = ?`
  ).bind(id).first();

  if (existing) {
    return jsonResponse({ error: 'このIDは既に使用されています' }, 409);
  }

  const monthlyLimit = PLAN_LIMITS[plan] || PLAN_LIMITS.light;
  const clientPlan = PLAN_LIMITS[plan] ? plan : 'light';

  await env.DB.prepare(
    `INSERT INTO clients (id, name, plan, monthly_limit, repo_path, stripe_customer_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, name.trim(), clientPlan, monthlyLimit, repo_path || null, stripe_customer_id || null).run();

  return jsonResponse({ success: true, id, plan: clientPlan, monthly_limit: monthlyLimit }, 201);
}

export async function onRequestPut(context) {
  const { env } = context;
  const user = context.data?.user;
  const guard = adminGuard(user);
  if (guard) return guard;

  const body = await context.request.json();
  const { id, name, plan, monthly_limit, repo_path, stripe_customer_id, stripe_subscription_id, chatta_plan, blog_plan, active } = body;

  if (!id) {
    return jsonResponse({ error: 'id は必須です' }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM clients WHERE id = ?`
  ).bind(id).first();

  if (!existing) {
    return jsonResponse({ error: 'クライアントが見つかりません' }, 404);
  }

  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
  if (plan !== undefined) {
    updates.push('plan = ?');
    values.push(plan);
    // plan 変更時は monthly_limit も自動更新（明示指定がない場合）
    if (monthly_limit === undefined && PLAN_LIMITS[plan]) {
      updates.push('monthly_limit = ?');
      values.push(PLAN_LIMITS[plan]);
    }
  }
  if (monthly_limit !== undefined) { updates.push('monthly_limit = ?'); values.push(monthly_limit); }
  if (repo_path !== undefined) { updates.push('repo_path = ?'); values.push(repo_path || null); }
  if (stripe_customer_id !== undefined) { updates.push('stripe_customer_id = ?'); values.push(stripe_customer_id || null); }
  if (stripe_subscription_id !== undefined) { updates.push('stripe_subscription_id = ?'); values.push(stripe_subscription_id || null); }
  if (chatta_plan !== undefined) { updates.push('chatta_plan = ?'); values.push(chatta_plan || null); }
  if (blog_plan !== undefined) { updates.push('blog_plan = ?'); values.push(blog_plan || null); }
  if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }

  if (updates.length === 0) {
    return jsonResponse({ error: '更新するフィールドがありません' }, 400);
  }

  values.push(id);

  await env.DB.prepare(
    `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return jsonResponse({ success: true, id });
}

export async function onRequestDelete(context) {
  const { env } = context;
  const user = context.data?.user;
  const guard = adminGuard(user);
  if (guard) return guard;

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return jsonResponse({ error: 'id は必須です' }, 400);
  }

  // default クライアントは削除不可
  if (id === 'default') {
    return jsonResponse({ error: 'デフォルトクライアントは無効化できません' }, 403);
  }

  const existing = await env.DB.prepare(
    `SELECT id, active FROM clients WHERE id = ?`
  ).bind(id).first();

  if (!existing) {
    return jsonResponse({ error: 'クライアントが見つかりません' }, 404);
  }

  // ソフトデリート
  await env.DB.prepare(
    `UPDATE clients SET active = 0 WHERE id = ?`
  ).bind(id).run();

  return jsonResponse({ success: true, id });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
