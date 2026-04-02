// ============================================
// SiteVibe — 申込 API
// Stripe Checkout Session 作成
// 認証不要（PUBLIC_PATHS に追加済み）
// ============================================

// 月額サブスク Price ID（stripe-webhook.js と一致）
const PLAN_PRICES = {
  light: 'price_1THf6DJFnEGuQY4KhoOdN2Zx',
  standard: 'price_1THf6EJFnEGuQY4K6MNaLn8Z',
  premium: 'price_1THf6GJFnEGuQY4Ktz3ov9LQ',
};

// 制作費（税込、一括）
const SETUP_FEES = {
  light: { amount: 55000, label: 'Light' },
  standard: { amount: 110000, label: 'Standard' },
  premium: { amount: 220000, label: 'Premium' },
};

// オプション Price ID
const ADDON_PRICES = {
  blog_light: 'price_1THf6LJFnEGuQY4KFgzh7QKA',
  blog_pro: 'price_1THf6MJFnEGuQY4K5KYZQyIQ',
  chatta_light: 'price_1THf6IJFnEGuQY4KBxfDXjFx',
  chatta_pro: 'price_1THf6JJFnEGuQY4KsdLbQp8H',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return jsonResponse({ error: 'STRIPE_SECRET_KEY が未設定です' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'リクエストが不正です' }, 400);
  }

  const { plan, blogPlan, chattaPlan, name, email, company } = body;

  // バリデーション
  if (!plan || !PLAN_PRICES[plan]) {
    return jsonResponse({ error: '無効なプランです' }, 400);
  }
  if (!name || !email) {
    return jsonResponse({ error: 'お名前とメールアドレスは必須です' }, 400);
  }
  if (blogPlan && !ADDON_PRICES[blogPlan]) {
    return jsonResponse({ error: '無効なブログオプションです' }, 400);
  }
  if (chattaPlan && !ADDON_PRICES[chattaPlan]) {
    return jsonResponse({ error: '無効なChattaオプションです' }, 400);
  }

  try {
    const origin = new URL(request.url).origin;

    // Stripe Checkout Session パラメータ構築
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('payment_method_types[0]', 'card');
    params.append('customer_email', email);
    params.append('success_url', `${origin}/apply/complete.html?session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${origin}/apply/?canceled=1`);

    let idx = 0;

    // 月額サブスク
    params.append(`line_items[${idx}][price]`, PLAN_PRICES[plan]);
    params.append(`line_items[${idx}][quantity]`, '1');
    idx++;

    // 制作費（一括、初回請求に加算）
    const setup = SETUP_FEES[plan];
    params.append(`line_items[${idx}][price_data][currency]`, 'jpy');
    params.append(`line_items[${idx}][price_data][product_data][name]`, `制作費（${setup.label}プラン）`);
    params.append(`line_items[${idx}][price_data][unit_amount]`, setup.amount.toString());
    params.append(`line_items[${idx}][quantity]`, '1');
    idx++;

    // ブログオプション
    if (blogPlan && ADDON_PRICES[blogPlan]) {
      params.append(`line_items[${idx}][price]`, ADDON_PRICES[blogPlan]);
      params.append(`line_items[${idx}][quantity]`, '1');
      idx++;
    }

    // Chattaオプション
    if (chattaPlan && ADDON_PRICES[chattaPlan]) {
      params.append(`line_items[${idx}][price]`, ADDON_PRICES[chattaPlan]);
      params.append(`line_items[${idx}][quantity]`, '1');
      idx++;
    }

    // メタデータ（Webhook で D1 更新時に使用）
    params.append('subscription_data[metadata][plan]', plan);
    params.append('subscription_data[metadata][name]', name);
    params.append('subscription_data[metadata][company]', company || '');
    params.append('subscription_data[metadata][email]', email);
    params.append('subscription_data[metadata][blog_plan]', blogPlan || '');
    params.append('subscription_data[metadata][chatta_plan]', chattaPlan || '');

    // Stripe API コール
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await res.json();

    if (!res.ok) {
      console.error('Stripe Checkout Session 作成失敗:', session.error?.message);
      return jsonResponse({ error: 'Stripe決済の初期化に失敗しました' }, 500);
    }

    return jsonResponse({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('申込API エラー:', err.message);
    return jsonResponse({ error: 'サーバーエラーが発生しました' }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
