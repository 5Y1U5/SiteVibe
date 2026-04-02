// ============================================
// SiteVibe — 利用状況 API
// 当月の AI更新 使用回数を返す
// ============================================

export async function onRequestGet(context) {
  const { env } = context;
  const user = context.data.user;

  const now = new Date();
  const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const usage = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM usage
     WHERE client_id = ? AND billing_period = ? AND action = 'code_change'`
  ).bind(user.clientId, billingPeriod).first();

  return new Response(JSON.stringify({
    billingPeriod,
    used: usage.count,
    limit: user.monthlyLimit,
    remaining: Math.max(0, user.monthlyLimit - usage.count),
    plan: user.plan,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
