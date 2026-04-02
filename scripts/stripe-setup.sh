#!/bin/bash
# ============================================
# SiteVibe — Stripe Products/Prices セットアップ
# 実行前に stripe login を済ませること
# ============================================
set -euo pipefail

echo "=== SiteVibe Stripe セットアップ ==="
echo ""

# --- ベースプラン ---

echo "▶ ベースプラン作成中..."

LIGHT_PROD=$(stripe products create \
  --name="SiteVibe Light" \
  --metadata[plan_id]=sitevibe_light \
  --format=json | jq -r '.id')
echo "  Product: $LIGHT_PROD"

LIGHT_PRICE=$(stripe prices create \
  --product="$LIGHT_PROD" \
  --currency=jpy \
  --unit-amount=5500 \
  --recurring[interval]=month \
  --format=json | jq -r '.id')
echo "  Price (¥5,500/月): $LIGHT_PRICE"

STANDARD_PROD=$(stripe products create \
  --name="SiteVibe Standard" \
  --metadata[plan_id]=sitevibe_standard \
  --format=json | jq -r '.id')
echo "  Product: $STANDARD_PROD"

STANDARD_PRICE=$(stripe prices create \
  --product="$STANDARD_PROD" \
  --currency=jpy \
  --unit-amount=11000 \
  --recurring[interval]=month \
  --format=json | jq -r '.id')
echo "  Price (¥11,000/月): $STANDARD_PRICE"

PREMIUM_PROD=$(stripe products create \
  --name="SiteVibe Premium" \
  --metadata[plan_id]=sitevibe_premium \
  --format=json | jq -r '.id')
echo "  Product: $PREMIUM_PROD"

PREMIUM_PRICE=$(stripe prices create \
  --product="$PREMIUM_PROD" \
  --currency=jpy \
  --unit-amount=33000 \
  --recurring[interval]=month \
  --format=json | jq -r '.id')
echo "  Price (¥33,000/月): $PREMIUM_PRICE"

# --- オプション ---

echo ""
echo "▶ オプション作成中..."

CHATTA_LIGHT_PROD=$(stripe products create \
  --name="Chatta Light" \
  --metadata[plan_id]=chatta_light \
  --format=json | jq -r '.id')
CHATTA_LIGHT_PRICE=$(stripe prices create \
  --product="$CHATTA_LIGHT_PROD" \
  --currency=jpy \
  --unit-amount=3300 \
  --recurring[interval]=month \
  --format=json | jq -r '.id')
echo "  Chatta Light (¥3,300/月): $CHATTA_LIGHT_PRICE"

CHATTA_PRO_PROD=$(stripe products create \
  --name="Chatta Pro" \
  --metadata[plan_id]=chatta_pro \
  --format=json | jq -r '.id')
CHATTA_PRO_PRICE=$(stripe prices create \
  --product="$CHATTA_PRO_PROD" \
  --currency=jpy \
  --unit-amount=8800 \
  --recurring[interval]=month \
  --format=json | jq -r '.id')
echo "  Chatta Pro (¥8,800/月): $CHATTA_PRO_PRICE"

BLOG_LIGHT_PROD=$(stripe products create \
  --name="ブログ Light" \
  --metadata[plan_id]=blog_light \
  --format=json | jq -r '.id')
BLOG_LIGHT_PRICE=$(stripe prices create \
  --product="$BLOG_LIGHT_PROD" \
  --currency=jpy \
  --unit-amount=3300 \
  --recurring[interval]=month \
  --format=json | jq -r '.id')
echo "  ブログ Light (¥3,300/月): $BLOG_LIGHT_PRICE"

BLOG_PRO_PROD=$(stripe products create \
  --name="ブログ Pro" \
  --metadata[plan_id]=blog_pro \
  --format=json | jq -r '.id')
BLOG_PRO_PRICE=$(stripe prices create \
  --product="$BLOG_PRO_PROD" \
  --currency=jpy \
  --unit-amount=5500 \
  --recurring[interval]=month \
  --format=json | jq -r '.id')
echo "  ブログ Pro (¥5,500/月): $BLOG_PRO_PRICE"

# --- 超過更新（都度課金） ---

echo ""
echo "▶ 超過更新作成中..."

EXTRA_PROD=$(stripe products create \
  --name="SiteVibe 超過更新" \
  --metadata[plan_id]=vibe_extra_update \
  --format=json | jq -r '.id')
EXTRA_PRICE=$(stripe prices create \
  --product="$EXTRA_PROD" \
  --currency=jpy \
  --unit-amount=1100 \
  --format=json | jq -r '.id')
echo "  超過更新 (¥1,100/回): $EXTRA_PRICE"

# --- まとめ ---

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "stripe-webhook.js の PRICE_MAP に以下を設定してください:"
echo ""
echo "const PRICE_MAP = {"
echo "  // ベースプラン"
echo "  '$LIGHT_PRICE': { plan: 'light', monthlyLimit: 3 },"
echo "  '$STANDARD_PRICE': { plan: 'standard', monthlyLimit: 10 },"
echo "  '$PREMIUM_PRICE': { plan: 'premium', monthlyLimit: 30 },"
echo "};"
echo ""
echo "const ADDON_MAP = {"
echo "  '$CHATTA_LIGHT_PRICE': { field: 'chatta_plan', value: 'chatta_light' },"
echo "  '$CHATTA_PRO_PRICE': { field: 'chatta_plan', value: 'chatta_pro' },"
echo "  '$BLOG_LIGHT_PRICE': { field: 'blog_plan', value: 'blog_light' },"
echo "  '$BLOG_PRO_PRICE': { field: 'blog_plan', value: 'blog_pro' },"
echo "};"
echo ""
echo "超過更新 Price ID: $EXTRA_PRICE"
