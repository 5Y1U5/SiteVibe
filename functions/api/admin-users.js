// ============================================
// SiteVibe — ユーザー管理 API
// 全操作 admin ロール専用
// ============================================

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
  const clientId = url.searchParams.get('client_id');

  let query, params;
  if (clientId) {
    query = `SELECT u.email, u.client_id, u.role, u.display_name, u.created_at,
                    c.name as client_name
             FROM users u JOIN clients c ON u.client_id = c.id
             WHERE u.client_id = ?
             ORDER BY u.created_at DESC`;
    params = [clientId];
  } else {
    query = `SELECT u.email, u.client_id, u.role, u.display_name, u.created_at,
                    c.name as client_name
             FROM users u JOIN clients c ON u.client_id = c.id
             ORDER BY u.created_at DESC`;
    params = [];
  }

  const users = params.length
    ? await env.DB.prepare(query).bind(...params).all()
    : await env.DB.prepare(query).all();

  return jsonResponse({ users: users.results });
}

export async function onRequestPost(context) {
  const { env } = context;
  const user = context.data?.user;
  const guard = adminGuard(user);
  if (guard) return guard;

  const body = await context.request.json();
  const { email, client_id, role, display_name } = body;

  if (!email?.trim() || !client_id?.trim()) {
    return jsonResponse({ error: 'email と client_id は必須です' }, 400);
  }

  // メール形式チェック
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: '有効なメールアドレスを入力してください' }, 400);
  }

  // クライアント存在チェック
  const client = await env.DB.prepare(
    `SELECT id FROM clients WHERE id = ?`
  ).bind(client_id).first();

  if (!client) {
    return jsonResponse({ error: '指定されたクライアントが存在しません' }, 404);
  }

  // 重複チェック
  const existing = await env.DB.prepare(
    `SELECT email FROM users WHERE email = ?`
  ).bind(email.trim().toLowerCase()).first();

  if (existing) {
    return jsonResponse({ error: 'このメールアドレスは既に登録されています' }, 409);
  }

  const userRole = (role === 'admin') ? 'admin' : 'client';

  await env.DB.prepare(
    `INSERT INTO users (email, client_id, role, display_name)
     VALUES (?, ?, ?, ?)`
  ).bind(email.trim().toLowerCase(), client_id, userRole, display_name?.trim() || null).run();

  return jsonResponse({ success: true, email: email.trim().toLowerCase() }, 201);
}

export async function onRequestPut(context) {
  const { env } = context;
  const user = context.data?.user;
  const guard = adminGuard(user);
  if (guard) return guard;

  const body = await context.request.json();
  const { email, display_name, role, client_id } = body;

  if (!email) {
    return jsonResponse({ error: 'email は必須です' }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT email FROM users WHERE email = ?`
  ).bind(email).first();

  if (!existing) {
    return jsonResponse({ error: 'ユーザーが見つかりません' }, 404);
  }

  const updates = [];
  const values = [];

  if (display_name !== undefined) { updates.push('display_name = ?'); values.push(display_name?.trim() || null); }
  if (role !== undefined) { updates.push('role = ?'); values.push(role === 'admin' ? 'admin' : 'client'); }
  if (client_id !== undefined) {
    // 移動先クライアント存在チェック
    const target = await env.DB.prepare(
      `SELECT id FROM clients WHERE id = ?`
    ).bind(client_id).first();
    if (!target) {
      return jsonResponse({ error: '移動先のクライアントが存在しません' }, 404);
    }
    updates.push('client_id = ?');
    values.push(client_id);
  }

  if (updates.length === 0) {
    return jsonResponse({ error: '更新するフィールドがありません' }, 400);
  }

  values.push(email);

  await env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE email = ?`
  ).bind(...values).run();

  return jsonResponse({ success: true, email });
}

export async function onRequestDelete(context) {
  const { env } = context;
  const user = context.data?.user;
  const guard = adminGuard(user);
  if (guard) return guard;

  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return jsonResponse({ error: 'email は必須です' }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT email, role FROM users WHERE email = ?`
  ).bind(email).first();

  if (!existing) {
    return jsonResponse({ error: 'ユーザーが見つかりません' }, 404);
  }

  // 最後の admin ユーザーは削除不可
  if (existing.role === 'admin') {
    const adminCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM users WHERE role = 'admin'`
    ).first();

    if (adminCount.count <= 1) {
      return jsonResponse({ error: '最後の管理者ユーザーは削除できません' }, 403);
    }
  }

  await env.DB.prepare(
    `DELETE FROM users WHERE email = ?`
  ).bind(email).run();

  return jsonResponse({ success: true, email });
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
