# SiteVibe サービス設計書

作成日: 2026-04-02
ステータス: 確定（LP・契約書への落とし込み前）

---

## コンセプト

**「話しかけるだけで、サイトが変わる。ブログも書ける。」**

Web のことがよくわからない経営者が、AI アシスタント「Vibe」に話しかけるだけで、サイト編集もブログ執筆もできる Web 制作 SaaS。

## ターゲット

- Web リテラシーが高くない中小企業の経営者
- 「サイトは欲しいけど、更新が面倒」「ブログを書く時間がない」層
- 制作会社に高額を払い続けることに疑問を持っている層

---

## サービス構成

### コアサービス（月額サブスク）

| プラン | 制作費（税込） | 月額（税込） | AI更新 | ページ | サポート |
|--------|---------------|-------------|--------|--------|---------|
| Light | ¥55,000 | ¥5,500 | 月3回 | 最大3P | メール |
| Standard | ¥110,000 | ¥11,000 | 月10回 | 最大7P | チャット+メール |
| Premium | ¥220,000 | ¥33,000 | 月30回 | 無制限 | 電話含む優先 |

- 超過更新: ¥1,100/回
- AI更新 = Vibe（Claude Code）によるサイト編集

### オプション

| オプション | 月額（税込） | 内容 |
|-----------|-------------|------|
| Chatta Light | +¥3,300 | AIチャットボット、月300対話、Haiku 4.5 |
| Chatta Pro | +¥8,800 | 月2,000対話、Sonnet 4.6選択可 |
| ブログ Light | +¥3,300 | 月5本生成、基本SEO |
| ブログ Pro | +¥5,500 | 月15本生成、SEO/AIO最適化 |
| メール転送 追加 | +¥550/アドレス | CF Email Routing |
| Google Workspace 導入 | ¥11,000（初期）+実費 | 本格メール環境 |

### 標準付帯（全プラン共通）

- 独自ドメイン設定（i-Style 取得 or 既存ドメインの DNS 設定代行）
- SSL 証明書（Cloudflare 自動発行）
- メール転送 1アドレス（CF Email Routing、無料）
- Cloudflare Pages ホスティング
- レスポンシブ対応
- 管理画面アクセス（/admin/）

---

## 技術アーキテクチャ

### 全体構成

```
SiteVibe 中央プラットフォーム（sitevibe-web.com）
├── 管理画面（/admin/）        ← 全クライアント共通、CF Access 保護
│   ├── Agent Console          ← Vibe チャット（音声/テキスト）
│   ├── ブログ管理パネル        ← 記事一覧・エディタ・公開
│   └── セットアップ画面        ← クライアント・ユーザー管理（admin専用）
├── D1 データベース             ← clients, users, usage, blog_posts, job_history
├── API（Cloudflare Pages Functions）
│   ├── /api/me, /api/chat, /api/intent, /api/agent
│   ├── /api/blog-generate, /api/blog-posts
│   ├── /api/clients, /api/admin-users（admin専用）
│   ├── /api/usage, /api/stripe-webhook
│   └── /api/transcribe, /api/speech
└── ジョブランナー（Mac mini）
    ├── Bun + Hono API サーバー
    ├── SQLite 永続化（ジョブキュー、履歴）
    ├── Claude Code CLI（Sonnet 4.6）
    └── Tailscale Funnel 外部公開

クライアントサイト（各自の CF Pages プロジェクト + 独自ドメイン）
├── index.html                 ← Vibe で制作・更新
├── blog/                      ← ブログ記事（静的HTML、公開時に自動生成）
│   ├── index.html             ← 記事一覧
│   └── [slug]/index.html      ← 個別記事
├── css/style.css              ← クライアント独自デザイン
└── js/                        ← クライアント独自スクリプト
```

### ブログのデータフロー

```
1. Vibe に話す or テキスト入力
2. インテント判定 → blog
3. AI が記事生成（Opus 4.6 or GPT-4o）
   - ライティングDNA（writing_profile）を適用
   - タイトル + Markdown本文 + slug + meta description
4. D1 に下書き保存
5. 管理パネルで編集（任意）
6.「公開」ボタン
7. ジョブランナー → Claude Code がクライアントのリポに HTML 生成
   - クライアントの CSS を自動適用
   - SEO タグ（OGP, 構造化データ）自動挿入
8. git push → CF Pages 自動デプロイ（1-2分）
9. クライアントの独自ドメインで公開
```

### サイト編集のフロー

```
1. Vibe に「お客様の声セクションを追加して」と話す
2. インテント判定 → code
3. ジョブランナー → Claude Code がクライアントのリポを編集
4. diff + プレビューを管理画面に表示
5. 承認 → git push → CF Pages 自動デプロイ
6. 却下 → git checkout で元に戻す
```

---

## 運用モデル

### クライアントが用意するもの

- **基本的にゼロ**
- 既存ドメインがある場合のみ、ドメイン管理画面のログイン情報を預かる

### i-Style が管理するもの

| 管理対象 | ツール | 備考 |
|---------|--------|------|
| ソースコード | GitHub Organization | 全クライアントのリポを一元管理 |
| ホスティング | Cloudflare Pages | クライアントごとにプロジェクト作成 |
| ドメイン・DNS | Cloudflare | Registrar + DNS + Email Routing |
| SSL | Cloudflare | 自動発行・自動更新 |
| 課金 | Stripe | サブスク + Webhook 自動連携 |
| データベース | Cloudflare D1 | マルチテナント、全クライアント共通 |
| AI エージェント | SiteVibe ジョブランナー | Mac mini、Claude Code CLI |
| 認証 | Cloudflare Access | メールベースのOTP認証 |
| パスワード管理 | 1Password 等 | クライアントのドメイン管理情報 |

### クライアントが使うもの

- **SiteVibe 管理画面（/admin/）のみ**
  - Vibe に話しかけてサイト編集
  - ブログパネルで記事管理
  - CF Access のメール認証でログイン

---

## ドメイン管理

### パターン A: ドメインをまだ持っていない（推奨）

1. i-Style が Cloudflare Registrar で取得（.com 年 $10 程度）
2. DNS・SSL は自動設定
3. 費用は月額に含める or 年額実費請求
4. 解約時のドメイン移管: ¥5,500（有償）

### パターン B: 既存ドメインがある

1. クライアントからドメイン管理画面のログイン情報を預かる
2. i-Style が CNAME レコードを追加（`www → xxx.pages.dev`）
3. CF Pages でカスタムドメイン設定 → SSL 自動発行
4. 解約時: CNAME を削除するだけ。ドメインはクライアントの資産

### メールアドレス

- **標準**: Cloudflare Email Routing で 1アドレス転送（無料）
  - 例: info@salon-abc.com → クライアントの Gmail に転送
  - 送信は Gmail の「別のアドレスから送信」で対応
- **追加**: +¥550/月/アドレス
- **本格運用**: Google Workspace 導入代行（¥11,000 初期 + 実費）

---

## 解約時の取り扱い

### 契約書に明記すべき事項

```
1. 著作権
   制作物（HTML/CSS/JS/画像等）の著作権は株式会社 i-Style に帰属する。

2. サービス停止
   解約月末日をもってサイトの公開を停止する。
   管理画面へのアクセスも同日に無効化する。

3. データ保持期間
   解約後90日間はデータ（サイトデータ・ブログ記事）を保持する。
   90日経過後、データは完全に削除される。

4. ソースコード引き渡し（オプション）
   希望する場合、静的 HTML ファイル一式を ¥55,000 で引き渡す。
   引き渡し後の運用・保守は顧客の責任とする。

5. ドメイン移管（i-Style 取得ドメインの場合）
   移管手続き: ¥5,500
   移管完了後の DNS 設定は顧客の責任とする。

6. 支払い停止時の自動停止
   Stripe の支払いが失敗した場合、猶予期間（14日）後にサイトを非公開にする。
   Webhook により自動処理される。
```

### 技術的な解約処理

```
1. Stripe サブスク解約 → Webhook で active = 0
2. CF Pages のカスタムドメインを削除
3. サイトをメンテナンスページに差し替え（or デプロイ停止）
4. CF Access からユーザーメールを削除
5. 90日後: リポジトリ削除、D1 データ削除
```

---

## 新規クライアント追加手順（完全版）

### 1. セットアップ画面からクライアント登録

1. `sitevibe-web.com/admin/setup.html` にアクセス
2. 「クライアント管理」→「+ 新規追加」
   - ID: `salon-abc`（英小文字+ハイフン）
   - 名前: サロンABC
   - プラン: Standard
   - ブログオプション: Blog Light
3. 「ユーザー管理」→「+ 新規追加」
   - メール: owner@salon-abc.com
   - ロール: client

### 2. GitHub リポジトリ作成

```bash
# i-Style Organization 内に作成
gh repo create i-style-inc/salon-abc --private
# テンプレートからクローン（今後テンプレートリポを用意）
```

### 3. Cloudflare Pages プロジェクト作成

```bash
wrangler pages project create salon-abc
# GitHub 連携で自動デプロイ設定
```

### 4. ドメイン設定

- 新規取得: CF Registrar で salon-abc.com を取得
- 既存: CNAME 設定代行

### 5. メール転送設定

CF Dashboard → Email Routing → `info@salon-abc.com` → 転送先設定

### 6. CF Access にメール追加

CF Dashboard → Access → Applications → ポリシーにメール追加

### 7. Stripe サブスクリプション作成

```bash
stripe customers create --name "サロンABC" --email "owner@salon-abc.com"
stripe subscriptions create --customer "cus_xxx" -d "items[0][price]=price_standard"
```
→ Webhook が D1 を自動更新

### 8. ライティングDNA 設定（ブログオプションがある場合）

セットアップ画面でクライアント編集 → writing_profile に JSON 設定

### 9. サイト制作開始

Vibe Agent Console からクライアントを選択 → 制作開始

---

## SaaS 化フェーズ完了状況

| Phase | 内容 | ステータス |
|-------|------|-----------|
| A | マルチテナント基盤（D1 + 認証） | 完了 |
| B | 課金基盤（Stripe Webhook + 利用制限） | 完了 |
| C | 管理者セットアップ画面 | 完了（PR #19） |
| D | ブログ MVP（AI 記事生成 + CRUD API） | 完了（PR #17） |
| E | ジョブランナー強化（SQLite + キュー） | 完了（PR #20） |
| - | ブログ管理 UI + 音声→記事生成 | 完了（PR #21） |
| - | blog_plan / chatta_plan UI 設定 | 完了（PR #22） |

## 今後の実装タスク

### 優先度: 高

1. **ブログ公開→静的HTML生成フロー** — 「公開」ボタンでクライアントのリポに HTML を自動生成・push
2. **ブログ SEO/AIO タグ** — meta description, OGP, 構造化データ（JSON-LD）、llms.txt
3. **LP 内容の見直し** — 今回確定したサービス設計を反映
4. **契約書・利用規約の作成** — 著作権・解約・ドメイン移管の条項

### 優先度: 中

5. **クライアントサイトテンプレート** — 新規制作時の雛形リポジトリ
6. **解約自動処理** — active=0 時のサイト非公開フロー
7. **Anthropic API キー設定** — Opus 4.6 でのブログ生成切り替え
8. **CF Email Routing 設定の自動化** — API 経由での設定

### 優先度: 低

9. ブログのスタイル自動学習（ライティングDNA の自動進化）
10. 予約公開・スケジューリング
11. ブログのシリーズ/テーマ管理
12. Google Workspace 導入自動化

---

## 環境変数一覧

### Cloudflare Pages（sitevibe-web.com）

| 変数名 | 用途 |
|--------|------|
| `OPENAI_API_KEY` | Whisper STT + TTS + Chat + Intent + ブログ生成（フォールバック） |
| `ANTHROPIC_API_KEY` | ブログ生成（Opus 4.6、未設定） |
| `JOB_RUNNER_URL` | ジョブランナーの Tailscale Funnel URL |
| `JOB_RUNNER_TOKEN` | ジョブランナー認証トークン |
| `RESEND_API_KEY` | メール送信（ディレクションシート） |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 署名検証 |
| D1 binding: `DB` | sitevibe-db |

### ジョブランナー（Mac mini）

| 変数名 | 用途 |
|--------|------|
| `AGENT_API_TOKEN` | API 認証トークン |
| `DEFAULT_REPO_PATH` | デフォルトリポジトリパス |
| `PORT` | サーバーポート（デフォルト: 3100） |

---

## 関連ドキュメント

- 料金設計書: `docs/PRICING-PLAN-2026-04.md`
- 運用ガイド: `docs/OPERATIONS-GUIDE.md`
- Stripe セットアップ: `docs/STRIPE-SETUP-GUIDE.md`
- 要件定義書: `docs/REQUIREMENTS-agent-console.md`
- Agent ガードレール: `server/AGENT.md`
