// ============================================
// SiteVibe — Stripe Webhook ハンドラー
// 署名検証 + サブスクリプション/請求イベント処理
// _middleware.js の PUBLIC_PATHS でスキップ済み
// ============================================

// ベースプラン: Stripe Price ID → D1 plan + monthly_limit
// scripts/stripe-setup.sh 実行後に実際の Price ID で置き換える
const PRICE_MAP = {
  'price_1THf6DJFnEGuQY4KhoOdN2Zx': { plan: 'light', monthlyLimit: 3 },
  'price_1THf6EJFnEGuQY4K6MNaLn8Z': { plan: 'standard', monthlyLimit: 10 },
  'price_1THf6GJFnEGuQY4Ktz3ov9LQ': { plan: 'premium', monthlyLimit: 30 },
};

// オプション: Stripe Price ID → D1 カラム + 値
const ADDON_MAP = {
  'price_1THf6IJFnEGuQY4KBxfDXjFx': { field: 'chatta_plan', value: 'chatta_light' },
  'price_1THf6JJFnEGuQY4KsdLbQp8H': { field: 'chatta_plan', value: 'chatta_pro' },
  'price_1THf6LJFnEGuQY4KFgzh7QKA': { field: 'blog_plan', value: 'blog_light' },
  'price_1THf6MJFnEGuQY4K5KYZQyIQ': { field: 'blog_plan', value: 'blog_pro' },
};

// ── Webhook 署名検証 ──

async function verifySignature(rawBody, sigHeader, secret) {
  // Stripe-Signature: t=タイムスタンプ,v1=署名
  const parts = {};
  for (const item of sigHeader.split(',')) {
    const [key, value] = item.split('=');
    parts[key] = value;
  }

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // タイムスタンプ検証（5分以内）
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300 || age < -60) return false;

  // HMAC-SHA256 で期待される署名を計算
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );

  // constant-time 比較（XOR ベース）
  const expected = hexToBytes(bufferToHex(signed));
  const actual = hexToBytes(signature);
  if (expected.length !== actual.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected[i] ^ actual[i];
  }
  return diff === 0;
}

function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── イベント処理 ──

async function handleSubscriptionChange(subscription, db) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  // 解約処理
  if (status === 'canceled' || status === 'unpaid') {
    await db.prepare(
      `UPDATE clients SET active = 0, stripe_subscription_id = ? WHERE stripe_customer_id = ?`
    ).bind(subscriptionId, customerId).run();
    console.log(`サブスク解約: customer=${customerId}`);
    return;
  }

  // active でない場合（incomplete 等）はスキップ
  if (status !== 'active' && status !== 'trialing') return;

  // サブスクリプションアイテムからプランを判定
  let plan = null;
  let monthlyLimit = null;
  let chattaPlan = null;
  let blogPlan = null;

  const items = subscription.items?.data || [];
  for (const item of items) {
    const priceId = item.price?.id;
    if (!priceId) continue;

    if (PRICE_MAP[priceId]) {
      plan = PRICE_MAP[priceId].plan;
      monthlyLimit = PRICE_MAP[priceId].monthlyLimit;
    }
    if (ADDON_MAP[priceId]) {
      const addon = ADDON_MAP[priceId];
      if (addon.field === 'chatta_plan') chattaPlan = addon.value;
      if (addon.field === 'blog_plan') blogPlan = addon.value;
    }
  }

  if (!plan) {
    console.warn(`未知の Price ID — items をスキップ: customer=${customerId}`);
    return;
  }

  await db.prepare(
    `UPDATE clients
     SET plan = ?, monthly_limit = ?, stripe_subscription_id = ?,
         chatta_plan = ?, blog_plan = ?, active = 1
     WHERE stripe_customer_id = ?`
  ).bind(plan, monthlyLimit, subscriptionId, chattaPlan, blogPlan, customerId).run();

  console.log(`サブスク更新: customer=${customerId}, plan=${plan}, limit=${monthlyLimit}`);
}

async function handleInvoicePaid(invoice, db) {
  // billing_period は YYYY-MM 形式で自然リセットされるため、
  // ここでは D1 更新不要。ログのみ記録。
  const customerId = invoice.customer;
  const amount = invoice.amount_paid;
  console.log(`請求完了: customer=${customerId}, amount=${amount}`);
}

// ── メインハンドラー ──

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET が未設定');
    return jsonResponse({ error: '設定エラー' }, 500);
  }

  const sigHeader = request.headers.get('Stripe-Signature');
  if (!sigHeader) {
    return jsonResponse({ error: '署名ヘッダーがありません' }, 400);
  }

  const rawBody = await request.text();

  // 署名検証
  const valid = await verifySignature(rawBody, sigHeader, secret);
  if (!valid) {
    console.warn('Webhook 署名検証失敗');
    return jsonResponse({ error: '署名検証失敗' }, 400);
  }

  // イベント処理
  try {
    const event = JSON.parse(rawBody);
    const db = env.DB;

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object, db);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event.data.object, db);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object, db);
        break;

      default:
        // 未対応イベントは無視
        break;
    }

    return jsonResponse({ received: true });
  } catch (err) {
    // Stripe にリトライさせないため 200 を返す
    console.error('Webhook 処理エラー:', err.message);
    return jsonResponse({ received: true, error: err.message });
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
