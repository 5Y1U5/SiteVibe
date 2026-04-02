#!/bin/bash
# ============================================
# SiteVibe — Stripe Products/Prices セットアップ
# 実行前に stripe login を済ませること
# ============================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULT_FILE="$SCRIPT_DIR/stripe-prices.json"

echo "=== SiteVibe Stripe セットアップ ==="
echo ""

# --- 事前チェック ---
for cmd in stripe jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd がインストールされていません"
    exit 1
  fi
done

# ヘルパー: Product作成 → Product ID 返却
create_product() {
  local name="$1"
  local desc="$2"
  local plan_id="$3"
  stripe products create \
    -d "name=$name" \
    -d "description=$desc" \
    -d "metadata[plan_id]=$plan_id" \
    | jq -r '.id'
}

# ヘルパー: 月額Price作成 → Price ID 返却
create_recurring_price() {
  local product="$1"
  local amount="$2"
  stripe prices create \
    -d "product=$product" \
    -d "currency=jpy" \
    -d "unit_amount=$amount" \
    -d "recurring[interval]=month" \
    | jq -r '.id'
}

# ヘルパー: 都度Price作成 → Price ID 返却
create_onetime_price() {
  local product="$1"
  local amount="$2"
  stripe prices create \
    -d "product=$product" \
    -d "currency=jpy" \
    -d "unit_amount=$amount" \
    | jq -r '.id'
}

# --- ベースプラン ---

echo "▶ ベースプラン作成中..."

LIGHT_PROD=$(create_product "SiteVibe Light" "AI管理画面Vibe付きWeb制作 Lightプラン（月3回更新）" "sitevibe_light")
LIGHT_PRICE=$(create_recurring_price "$LIGHT_PROD" 5500)
echo "  SiteVibe Light (¥5,500/月): $LIGHT_PRICE"

STANDARD_PROD=$(create_product "SiteVibe Standard" "AI管理画面Vibe付きWeb制作 Standardプラン（月10回更新）" "sitevibe_standard")
STANDARD_PRICE=$(create_recurring_price "$STANDARD_PROD" 11000)
echo "  SiteVibe Standard (¥11,000/月): $STANDARD_PRICE"

PREMIUM_PROD=$(create_product "SiteVibe Premium" "AI管理画面Vibe付きWeb制作 Premiumプラン（月30回更新）" "sitevibe_premium")
PREMIUM_PRICE=$(create_recurring_price "$PREMIUM_PROD" 33000)
echo "  SiteVibe Premium (¥33,000/月): $PREMIUM_PRICE"

# --- オプション ---

echo ""
echo "▶ オプション作成中..."

CHATTA_LIGHT_PROD=$(create_product "Chatta Light" "AIチャットボット Lightプラン（月300対話、Haiku 4.5）" "chatta_light")
CHATTA_LIGHT_PRICE=$(create_recurring_price "$CHATTA_LIGHT_PROD" 3300)
echo "  Chatta Light (¥3,300/月): $CHATTA_LIGHT_PRICE"

CHATTA_PRO_PROD=$(create_product "Chatta Pro" "AIチャットボット Proプラン（月2,000対話、Sonnet 4.6選択可）" "chatta_pro")
CHATTA_PRO_PRICE=$(create_recurring_price "$CHATTA_PRO_PROD" 8800)
echo "  Chatta Pro (¥8,800/月): $CHATTA_PRO_PRICE"

BLOG_LIGHT_PROD=$(create_product "ブログ Light" "AI記事生成 Lightプラン（月5本、基本SEO）" "blog_light")
BLOG_LIGHT_PRICE=$(create_recurring_price "$BLOG_LIGHT_PROD" 3300)
echo "  ブログ Light (¥3,300/月): $BLOG_LIGHT_PRICE"

BLOG_PRO_PROD=$(create_product "ブログ Pro" "AI記事生成 Proプラン（月15本、高度SEO最適化）" "blog_pro")
BLOG_PRO_PRICE=$(create_recurring_price "$BLOG_PRO_PROD" 5500)
echo "  ブログ Pro (¥5,500/月): $BLOG_PRO_PRICE"

# --- 超過更新（都度課金） ---

echo ""
echo "▶ 超過更新作成中..."

EXTRA_PROD=$(create_product "SiteVibe 超過更新" "AI更新の月間上限超過時の追加更新" "vibe_extra_update")
EXTRA_PRICE=$(create_onetime_price "$EXTRA_PROD" 1100)
echo "  超過更新 (¥1,100/回): $EXTRA_PRICE"

# --- 結果を JSON に保存 ---

cat > "$RESULT_FILE" <<JSONEOF
{
  "light_price": "$LIGHT_PRICE",
  "standard_price": "$STANDARD_PRICE",
  "premium_price": "$PREMIUM_PRICE",
  "chatta_light_price": "$CHATTA_LIGHT_PRICE",
  "chatta_pro_price": "$CHATTA_PRO_PRICE",
  "blog_light_price": "$BLOG_LIGHT_PRICE",
  "blog_pro_price": "$BLOG_PRO_PRICE",
  "extra_price": "$EXTRA_PRICE"
}
JSONEOF

# --- まとめ ---

echo ""
echo "=== セットアップ完了 ==="
echo "Price ID を $RESULT_FILE に保存しました"
