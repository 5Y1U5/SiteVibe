# SiteVibe Stripe セットアップガイド

## 1. 商品一覧（8商品）

### ベースプラン（月額サブスクリプション × 3）

| # | 商品名 | 説明 | 金額 | 課金方式 | metadata |
|---|--------|------|------|----------|----------|
| 1 | SiteVibe Light | AI管理画面Vibe付きWeb制作 Lightプラン（月3回更新） | ¥5,500/月 | 継続（月次） | plan_id: sitevibe_light |
| 2 | SiteVibe Standard | AI管理画面Vibe付きWeb制作 Standardプラン（月10回更新） | ¥11,000/月 | 継続（月次） | plan_id: sitevibe_standard |
| 3 | SiteVibe Premium | AI管理画面Vibe付きWeb制作 Premiumプラン（月30回更新） | ¥33,000/月 | 継続（月次） | plan_id: sitevibe_premium |

### オプション（月額アドオン × 4）

| # | 商品名 | 説明 | 金額 | 課金方式 | metadata |
|---|--------|------|------|----------|----------|
| 4 | Chatta Light | AIチャットボット Lightプラン（月300対話、Haiku 4.5） | ¥3,300/月 | 継続（月次） | plan_id: chatta_light |
| 5 | Chatta Pro | AIチャットボット Proプラン（月2,000対話、Sonnet 4.6選択可） | ¥8,800/月 | 継続（月次） | plan_id: chatta_pro |
| 6 | ブログ Light | AI記事生成 Lightプラン（月5本、基本SEO） | ¥3,300/月 | 継続（月次） | plan_id: blog_light |
| 7 | ブログ Pro | AI記事生成 Proプラン（月15本、高度SEO最適化） | ¥5,500/月 | 継続（月次） | plan_id: blog_pro |

### 従量課金（都度 × 1）

| # | 商品名 | 説明 | 金額 | 課金方式 | metadata |
|---|--------|------|------|----------|----------|
| 8 | SiteVibe 超過更新 | AI更新の月間上限超過時の追加更新 | ¥1,100/回 | 都度（One time） | plan_id: vibe_extra_update |

### 全商品共通設定
- **通貨**: JPY（日本円）
- **税金**: 内税（税込表示）

---

## 2. 商品作成時の入力項目（Stripe Dashboard）

各商品で入力する項目:

1. **Product > Add product** をクリック
2. **Name**: 上記の「商品名」
3. **Description**: 上記の「説明」
4. **Pricing**:
   - Price: 上記の「金額」（例: 5500）
   - Currency: JPY
   - Billing period: Monthly（#1〜#7）/ One time（#8）
5. **Metadata** > Add metadata:
   - Key: `plan_id`
   - Value: 上記の「metadata」の値

---

## 3. 作成後に記録する Price ID

各商品を作成すると Price ID（`price_` で始まる文字列）が発行される。
以下のフォーマットで記録し、コードに反映する:

```
# ベースプラン
SiteVibe Light:    price_________________
SiteVibe Standard: price_________________
SiteVibe Premium:  price_________________

# オプション
Chatta Light:      price_________________
Chatta Pro:        price_________________
ブログ Light:      price_________________
ブログ Pro:        price_________________

# 従量課金
超過更新:          price_________________
```

---

## 4. Webhook 設定

### エンドポイント登録（Stripe Dashboard > Developers > Webhooks）

| 項目 | 値 |
|------|-----|
| Endpoint URL | `https://sitevibe-web.com/api/stripe-webhook` |
| Listen to | Events on your account |

### 受信するイベント（4つ選択）

1. `customer.subscription.created`
2. `customer.subscription.updated`
3. `customer.subscription.deleted`
4. `invoice.paid`

### Webhook Signing Secret
Webhook 作成後に表示される `whsec_` で始まる文字列を記録する。
→ Cloudflare Pages の Secret に設定する:
```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# プロンプトで whsec_xxxx を入力
```

---

## 5. D1 マイグレーション

```bash
npx wrangler d1 migrations apply sitevibe-db
```
→ clients テーブルに chatta_plan / blog_plan カラムが追加される

---

## 6. Price ID のコード反映

`functions/api/stripe-webhook.js` の冒頭を編集:

```javascript
const PRICE_MAP = {
  'price_実際のID': { plan: 'light', monthlyLimit: 3 },
  'price_実際のID': { plan: 'standard', monthlyLimit: 10 },
  'price_実際のID': { plan: 'premium', monthlyLimit: 30 },
};

const ADDON_MAP = {
  'price_実際のID': { field: 'chatta_plan', value: 'chatta_light' },
  'price_実際のID': { field: 'chatta_plan', value: 'chatta_pro' },
  'price_実際のID': { field: 'blog_plan', value: 'blog_light' },
  'price_実際のID': { field: 'blog_plan', value: 'blog_pro' },
};
```

---

## 7. セットアップ完了チェックリスト

- [ ] Stripe で 8 商品を作成
- [ ] 各 Price ID を記録
- [ ] Webhook エンドポイントを登録（4イベント）
- [ ] Webhook Signing Secret を記録
- [ ] `npx wrangler secret put STRIPE_WEBHOOK_SECRET` を実行
- [ ] `npx wrangler d1 migrations apply sitevibe-db` を実行
- [ ] `stripe-webhook.js` の PRICE_MAP / ADDON_MAP に Price ID を設定
- [ ] コミット・プッシュしてデプロイ
- [ ] テストモードでサブスク作成 → Webhook 受信を確認
