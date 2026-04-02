# ARCHITECT Review: RALPLAN SiteVibe SaaS Evolution

**レビュー日**: 2026-04-02
**レビュー対象**: `ralplan-sitevibe-saas.md` + `deep-dive-sitevibe-saas-evolution.md`
**レビュアー**: ARCHITECT (RALPLAN-DR Consensus)

---

## VERDICT: ITERATE

計画は全体的に堅実で、ソロ開発者の制約に合った現実的な選択をしている。ただし、セキュリティ面に致命的な問題が1件、アーキテクチャ上の未解決テンションが2件あり、実装前に修正が必要。

---

## Steelman Counterargument（反論）

**CF Pages Functions + D1 への最強の反論:**

「Pages Functions は本質的に CDN エッジの付属機能であり、SaaS のAPIサーバーとして使うものではない。10ms CPU 制限は "subrequest は含まれない" という前提に依存しているが、D1 クエリ自体は CPU 時間にカウントされる。認証ミドルウェアの D1 JOIN + 各エンドポイントの D1 クエリが合計で 10ms を超えるケースは十分にあり得る。特に Phase D のブログ CRUD（INSERT + UPDATE + SELECT を1リクエストで実行する可能性）や、Phase B の利用回数チェック（COUNT + INSERT の2クエリ）では、D1 のコールドスタート時に制限に引っかかるリスクがある。専用 Workers なら CPU 制限を気にせず、将来の拡張にも耐えられる。"開発工数2倍"という見積もりは過大で、既存の7ファイルを Workers に移植するのは1-2日の作業に過ぎない。」

**この反論の評価**: 部分的に妥当。D1 クエリは通常 1-3ms だが、Pages Functions の 10ms CPU 制限はリアルなリスク。ただし、計画の段階的アプローチ（問題が出たら Workers に分離）は合理的。Phase A で実測してから判断する戦略は正しい。

---

## Tradeoff Tension（未解決のトレードオフ）

### Tension 1: D1 単一データベース vs テナント分離

計画は全テナントが1つの D1 データベースを共有する。これは開発速度では最適だが:
- あるクライアントの大量ブログ記事がD1の5MB/リクエスト応答制限に影響する可能性
- D1 の無料枠（5M reads/日）を1テナントが占有するリスク
- データ削除依頼時にテナントデータを確実に分離できるか（GDPR的な文脈）

**計画が触れていない点**: テナント間のデータ分離保証と、テナント単位のリソース消費制限。

### Tension 2: Mac mini 単一障害点 vs SaaS 可用性

コード変更が Mac mini に依存する構造は、20-30社の SaaS としてはSLA的に脆弱。計画はこのリスクを認識しているが、軽減策が「SQLite永続化 + launchd再起動」のみで、Mac mini がオフラインの場合のユーザー体験（エラーメッセージ、リトライ、通知）が設計されていない。

### Synthesis（統合案）

1. **Tension 1**: 現時点では単一DB で十分。ただし `client_id` による論理分離を徹底し、全クエリに `client_id` フィルターを必須とするヘルパー関数を作る。Phase A に「テナント分離ヘルパー」を追加で 0.5 日。
2. **Tension 2**: Phase A に「ジョブランナー接続不能時の graceful degradation」を追加。具体的には `/api/agent` がジョブランナーに接続できない場合、「現在コード変更機能はメンテナンス中です。ブログ機能はご利用いただけます。」と返す UI 対応。

---

## Architectural Concerns（アーキテクチャ上の懸念）

### 1. _middleware.js の適用範囲が広すぎる

`functions/_middleware.js` は Pages Functions の全パスに適用される。計画では `/api/` 以外をスキップし、`PUBLIC_PATHS` で例外管理しているが、Pages Functions の middleware は `functions/` ディレクトリ内の全関数に対して実行される。

**問題**: 静的ファイル（LP、診断フォーム）へのアクセスにもミドルウェアが実行され、不要な D1 クエリが発生する。ただし計画では `if (!url.pathname.startsWith('/api/'))` でスキップしているので実害は小さい。

**推奨**: `functions/_middleware.js` ではなく `functions/api/_middleware.js` に配置する。これで `/api/` 配下のみに適用され、静的ファイルには一切影響しない。

### 2. ジョブランナーの repo-path API が認証を迂回する可能性

`functions/api/clients/[id]/repo-path.js` は認証ミドルウェアを通過するが、任意の `client_id` の `repo_path`（Mac mini のファイルパス）を返す。client ロールのユーザーが他クライアントの repo_path を取得できてしまう。

**推奨**: admin ロール限定にするか、ジョブランナー専用のトークン認証を別途設ける。

### 3. ブログ配信 Workers と Pages Functions の D1 共有

Phase D の `workers/blog-delivery/index.js` は独立した Workers だが、D1 バインディングを Pages と共有する設計。これ自体は正しいが、計画に D1 バインディングの共有方法（`wrangler.toml` の設定）が blog-delivery 側に明記されていない。

**推奨**: `workers/blog-delivery/wrangler.toml` のサンプルを計画に含める。

### 4. blog-delivery Workers のXSS脆弱性

`renderBlogPost()` と `renderBlogIndex()` がクライアント名やメタ説明文をエスケープなしで HTML に埋め込んでいる。D1 から取得した値を信頼しているが、admin が登録したデータにもXSS対策は必要。

```javascript
// 現在（危険）
return `<title>${post.title} | ${siteName}</title>`;
// 修正（安全）
return `<title>${escapeHtml(post.title)} | ${escapeHtml(siteName)}</title>`;
```

### 5. Phase E の D1 REST API 依存が不明瞭

ジョブランナー（Mac mini）から D1 のデータを取得するために `functions/api/clients/[id]/repo-path.js` を呼ぶ設計だが、これは CF Pages Functions を経由するため:
- CF Access の認証が必要（ジョブランナーは CF Access トークンを持っていない）
- ネットワーク経由の往復レイテンシが追加される

**推奨**: ジョブランナーからの D1 アクセスには Cloudflare D1 HTTP API（`https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query`）を直接使うか、`/api/clients/[id]/repo-path` を `PUBLIC_PATHS` に追加してジョブランナートークンで認証する専用ルートにする。

---

## Security Concerns（セキュリティ上の懸念）

### 1. [CRITICAL] JWT 署名検証をスキップしている

計画の `_middleware.js` には以下のコメントがある:

> `// CF Access の JWT ペイロードをデコード（署名検証は CF Access が実施済み）`

**これは誤り。** CF Access がリクエストをプロキシしてJWTを付与するが、Pages Functions は CF Access の背後にあるとは限らない。攻撃者が `Cf-Access-Jwt-Assertion` ヘッダーを偽造して直接 Pages Functions にリクエストを送る可能性がある。

**必須修正**: CF Access の公開鍵（`https://<team-name>.cloudflareaccess.com/cdn-cgi/access/certs`）を使って JWT の署名を検証する。Cloudflare の公式ドキュメントに実装例がある。これがないと、認証は完全にバイパス可能。

### 2. [HIGH] Stripe Webhook の署名検証にタイミング攻撃の脆弱性

`verifyStripeSignature()` で `expected === sig` を使った文字列比較をしている。これはタイミング攻撃に対して脆弱。

**推奨**: `crypto.subtle.timingSafeEqual` は Workers では使えないが、constant-time comparison を実装する:

```javascript
// 定数時間比較
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

### 3. [HIGH] Stripe Webhook のタイムスタンプ検証がない

署名のタイムスタンプ（`t=`）を検証していない。リプレイ攻撃が可能。

**推奨**: タイムスタンプが5分以内であることを検証する:

```javascript
const tolerance = 300; // 5分
if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > tolerance) {
  return false;
}
```

### 4. [MEDIUM] CORS が `Access-Control-Allow-Origin: *` のまま

既存の `agent.js` が `*` で CORS を許可しており、計画もこれを踏襲している。SaaS 化後は `sitevibe-web.com` に限定すべき。

### 5. [MEDIUM] クライアント登録 API に入力バリデーションがない

`POST /api/clients` の `body.name`, `body.email`, `body.repoPath` にバリデーションがない。特に `repoPath` は Mac mini のファイルシステムパスで、パストラバーサル攻撃のリスクがある（例: `../../etc/passwd`）。admin のみのエンドポイントだが、admin アカウントが侵害された場合のリスク。

### 6. [LOW] blog-generate API にレート制限がない

Claude API 呼出はコストが発生する。client ロールのユーザーが大量にブログ生成リクエストを送る可能性。usage テーブルのカウントは `agent_job` アクション用であり、`blog_generate` はカウントされていない。

---

## Recommended Improvements（推奨改善）

### 1. [必須] JWT 署名検証を実装する

CF Access の JWKS エンドポイントから公開鍵を取得し、`crypto.subtle.verify` で RS256 署名を検証する。これがないとセキュリティモデルが成立しない。実装は +0.5日。

### 2. [必須] Stripe Webhook のタイミング安全比較 + タイムスタンプ検証を追加する

上記 Security #2, #3 の修正を Phase B に含める。実装は +0.25日。

### 3. [推奨] ミドルウェアを `functions/api/_middleware.js` に移動する

静的ファイルへの不要なミドルウェア実行を完全に排除する。

### 4. [推奨] ブログ生成を usage カウントに含める

`blog_generate` アクションを usage テーブルに記録し、月次制限の対象にする（別カウントでも良い）。プランごとの生成回数上限を設ける。

### 5. [推奨] blog-delivery の HTML エスケープを追加する

XSS 防止のため、D1 から取得した全データを HTML エスケープしてからテンプレートに埋め込む。

### 6. [推奨] D1 スキーマにインデックスを追加する

Phase A のマイグレーションに以下のインデックスが不足:

```sql
CREATE INDEX idx_users_client ON users(client_id);
CREATE INDEX idx_usage_billing ON usage(client_id, billing_period);
CREATE INDEX idx_clients_stripe ON clients(stripe_customer_id);
CREATE INDEX idx_clients_subdomain ON clients(blog_subdomain);
```

特に `usage(client_id, billing_period)` は Phase B の COUNT クエリで毎回使われるため必須。

### 7. [推奨] Phase A に「既存動作の互換テスト」を明示する

受入基準に「既存の Agent Console が正常動作する」とあるが、テスト手順が具体的でない。CF Access がまだ設定されていない場合のフォールバック（開発時のバイパス）を計画に含める。

### 8. [検討] billing_period のリセットロジックを明確化する

現在の設計では `billing_period = "YYYY-MM"` で自然月リセット。しかし Stripe のサブスクリプション開始日が月中の場合、Stripe の請求期間と D1 の billing_period がずれる。

例: 4/15 に契約開始 → Stripe は 4/15-5/14 を1期間とする → D1 は 4月と5月で分かれる

**推奨**: `invoice.paid` イベントで明示的に `billing_period_start` / `billing_period_end` を管理するか、自然月で統一すると割り切る（計画に明記する）。

---

## D1 スキーマ評価

**良い点:**
- `client_id` による論理分離が一貫している
- `UNIQUE(client_id, slug)` でブログスラッグの重複を防止
- `unixepoch()` による一貫したタイムスタンプ

**改善点:**
- インデックス不足（上記 #6）
- `usage` テーブルの `billing_period` が TEXT 型で、Stripe の請求期間とのマッピングが曖昧
- `clients.plan` に CHECK 制約がない（`CHECK(plan IN ('light','standard','premium'))` を推奨）
- `users.role` に CHECK 制約がない（`CHECK(role IN ('admin','client'))` を推奨）
- `blog_posts.status` に CHECK 制約がない（`CHECK(status IN ('draft','published'))` を推奨）

---

## Blog Subdomain Architecture 評価

サブドメイン配信は技術的に正しいアプローチ。Cloudflare for SaaS + Workers の組み合わせはSEO的にも最適。

**懸念:**
- 初回セットアップの手順が複雑（CF Dashboard での手動操作が必要）。管理者セットアップ UI からワンクリックで設定できるのが理想だが、MVP では手動で十分。
- blog-delivery Workers がHTMLを文字列連結で生成しているが、テンプレートエンジンなしでの拡張は限界がある。MVP後にHTMLテンプレートファイル（R2 or KV に保存）への移行を検討すべき。

---

## Summary

計画は CF エコシステム内でのソロ開発 SaaS として合理的な設計。段階的な Phase 構成と見積もりは現実的。ただし JWT 署名検証のスキップは認証モデルを根本から破壊する致命的問題であり、Phase A の実装前に必ず修正が必要。Stripe Webhook のタイミング攻撃対策とタイムスタンプ検証も Phase B の前に組み込むべき。これら3点のセキュリティ修正と、D1 インデックスの追加を反映すれば APPROVE に変更する。
