// ============================================
// SiteVibe — ユーザー情報 API
// 認証済みユーザーの情報を返す
// ============================================

export async function onRequestGet(context) {
  const user = context.data.user;

  return new Response(JSON.stringify({
    email: user.email,
    clientId: user.clientId,
    role: user.role,
    displayName: user.displayName,
    clientName: user.clientName,
    plan: user.plan,
    monthlyLimit: user.monthlyLimit,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
