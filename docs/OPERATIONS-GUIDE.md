# SiteVibe 運用ガイド

作成日: 2026-04-02
ステータス: Phase B（課金基盤）完了時点

---

## 稼働中の URL 一覧

### 本番サイト

- LP（メイン）: https://sitevibe-web.com
- LP（www）: https://www.sitevibe-web.com
- LP（CF Pages直）: https://sitevibe.pages.dev
- 診断フォーム: https://sitevibe-web.com/diagnosis/
- ディレクションシート: https://sitevibe-web.com/direction/
- Agent Console（管理画面）: https://sitevibe-web.com/admin/

### API エンドポイント

認証あり（CF Access）:
- GET /api/me — ユーザー情報取得
- POST /api/chat — チャット応答（GPT-4o-mini）
- POST /api/intent — インテント判定（GPT-4o-mini）
- POST /api/agent — ジョブランナープロキシ + 利用制限チェック
- GET /api/agent?jobId=xxx — ジョブ状態確認（ポーリング）
- GET /api/agent?action=history — 変更履歴取得
- GET /api/usage — 当月利用状況（使用回数/上限）
- GET/POST/PUT/DELETE /api/clients — クライアントCRUD（admin専用）
- GET/POST/PUT/DELETE /api/admin-users — ユーザーCRUD（admin専用）
- POST /api/transcribe — 音声認識（OpenAI Whisper）
- POST /api/speech — 音声合成（OpenAI TTS）

認証なし:
- GET /api/preview — プレビュー HTML
- POST /api/direction — ディレクションシート送信（Resend メール）
- POST /api/stripe-webhook — Stripe Webhook（署名検証あり）

### 外部サービス管理画面

- Cloudflare Dashboard: https://dash.cloudflare.com
  - Pages / D1 / DNS / CF Access の管理
- Stripe Dashboard（テストモード）: https://dashboard.stripe.com/test
  - 商品 / サブスクリプション / Webhook の管理
- GitHub リポジトリ: https://github.com/5Y1U5/SiteVibe
  - ソースコード / PR / GitHub Actions デプロイ

### インフラ構成

- ホスティング: Cloudflare Pages（GitHub Actions で自動デプロイ）
- データベース: Cloudflare D1（sitevibe-db, ID: 0b3355cd-1eb6-46c2-9fea-203a21271346）
- 認証: Cloudflare Access（/admin/ を保護、JWT Cookie でユーザー識別）
- ジョブランナー: Mac mini（Bun + Hono, server/index.ts）→ Tailscale Funnel で外部公開
- メール送信: Resend API

---

## 課金基盤の仕組み

### 料金プラン

ベースプラン（月額サブスクリプション）:
- Light: ¥5,500/月（AI更新 月3回）
- Standard: ¥11,000/月（AI更新 月10回）
- Premium: ¥33,000/月（AI更新 月30回）

オプション（月額アドオン）:
- Chatta Light: +¥3,300/月（月300対話、Haiku 4.5）
- Chatta Pro: +¥8,800/月（月2,000対話、Sonnet 4.6選択可）
- ブログ Light: +¥3,300/月（月5本生成）
- ブログ Pro: +¥5,500/月（月15本生成）

超過更新: ¥1,100/回（手動運用）

### Webhook によるプラン自動反映

Stripe でサブスクリプションを作成/変更/解約すると、Webhook が自動で D1 を更新する。

```
Stripe でサブスク操作
  → Webhook 送信（https://sitevibe-web.com/api/stripe-webhook）
  → 署名検証（HMAC-SHA256, constant-time 比較）
  → D1 clients テーブル更新（plan / monthly_limit / stripe_subscription_id）
```

対応イベント:
- customer.subscription.created — プラン設定
- customer.subscription.updated — プラン変更反映
- customer.subscription.deleted — active = 0（無効化）
- invoice.paid — ログ記録（billing_period は自然月で自動リセット）

### 月次利用制限の動作

```
ユーザーが Vibe に依頼
  → POST /api/agent
  → usage テーブルで当月カウント確認
  → 上限以内: ジョブ実行 → 承認時にカウント+1
  → 上限超過: 429 エラー → Vibe が「上限に達しました」と案内
```

管理画面ヘッダーにバッジで表示:
- 通常: 白文字（例: 3/10回）
- 残り20%以下: 黄色（warning）
- 上限到達: 赤色（exceeded）

---

## 新規クライアント追加手順

### 方法 A: セットアップ画面から（推奨）

1. https://sitevibe-web.com/admin/setup.html にアクセス（admin ロール必須）
2. 「クライアント管理」タブ → 「+ 新規追加」
3. ID、名前、プランを入力して作成
4. 「ユーザー管理」タブ → 「+ 新規追加」でユーザーを登録
5. **CF Access にメール追加**（手動）: Cloudflare Dashboard → Access → Applications → sitevibe のポリシーにメールを追加
6. Stripe で顧客作成 → サブスクリプション作成 → Webhook が自動で D1 更新
7. クライアントに管理画面 URL を共有: https://sitevibe-web.com/admin/

### 方法 B: CLI から（手動）

#### 1. Stripe で顧客を作成

```bash
stripe customers create --name "クライアント名" --email "client@example.com"
```
→ 出力の `id`（cus_xxx）を控える

#### 2. D1 にクライアント登録

```bash
wrangler d1 execute sitevibe-db --remote --command \
  "INSERT INTO clients (id, name, plan, monthly_limit, stripe_customer_id)
   VALUES ('client-slug', 'クライアント名', 'light', 3, 'cus_xxx');"
```

#### 3. D1 にユーザー登録

```bash
wrangler d1 execute sitevibe-db --remote --command \
  "INSERT INTO users (email, client_id, role, display_name)
   VALUES ('client@example.com', 'client-slug', 'client', '担当者名');"
```

#### 4. CF Access にメール追加

Cloudflare Dashboard → Access → Applications → sitevibe のポリシーにメールを追加。

#### 5. Stripe でサブスクリプション作成

```bash
stripe subscriptions create \
  --customer "cus_xxx" \
  -d "items[0][price]=price_xxxxx"
```
→ Webhook が自動で D1 の plan / monthly_limit を更新

#### 6. クライアントに管理画面 URL を共有

https://sitevibe-web.com/admin/
（CF Access のログイン画面経由でアクセス）

---

## 運用コマンド集

### D1 データ確認

```bash
# クライアント一覧
wrangler d1 execute sitevibe-db --remote --command "SELECT * FROM clients;"

# ユーザー一覧
wrangler d1 execute sitevibe-db --remote --command "SELECT * FROM users;"

# 当月の利用状況
wrangler d1 execute sitevibe-db --remote --command \
  "SELECT c.name, COUNT(u.id) as used, c.monthly_limit
   FROM clients c LEFT JOIN usage u ON c.id = u.client_id
   AND u.billing_period = strftime('%Y-%m', 'now')
   GROUP BY c.id;"
```

### Stripe 確認

```bash
# Webhook エンドポイント一覧
stripe webhook_endpoints list

# サブスクリプション一覧
stripe subscriptions list --limit 10

# 最近のイベント
stripe events list --limit 5
```

### Pages Secret 管理

```bash
# Secret 一覧
wrangler pages secret list --project-name sitevibe

# Secret 追加/更新（Pages 用。wrangler secret put ではない）
echo "値" | wrangler pages secret put SECRET_NAME --project-name sitevibe
```

注意: `wrangler secret put` は Worker 用。Pages Functions には `wrangler pages secret put --project-name sitevibe` を使うこと。

---

## 本番運用への切り替え

現在は Stripe テストモードで動作中。本番に切り替える手順:

1. Stripe ダッシュボードを本番モードに切り替え
2. 本番用の商品/Price を作成（`scripts/stripe-setup.sh` を本番モードで実行）
3. `functions/api/stripe-webhook.js` の PRICE_MAP / ADDON_MAP を本番 Price ID で更新
4. 本番用 Webhook エンドポイントを登録
5. 本番用 Secret を設定:
   ```bash
   echo "whsec_本番の値" | wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name sitevibe
   ```
6. コミット・プッシュしてデプロイ

---

## 関連ドキュメント

- 料金設計書: docs/PRICING-PLAN-2026-04.md
- Stripe セットアップ手順: docs/STRIPE-SETUP-GUIDE.md
- 要件定義書: docs/REQUIREMENTS-agent-console.md
- Agent Console 実装計画: docs/PLAN-admin-agent.md
