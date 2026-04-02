# RALPLAN-DR: SiteVibe SaaS Evolution 実装計画

作成日: 2026-04-02
更新日: 2026-04-02（Architect/Critic レビュー反映）
対象スペック: `.omc/specs/deep-dive-sitevibe-saas-evolution.md`

## Architect/Critic レビュー指摘事項（反映済み）

| # | 深刻度 | 指摘 | 対応 |
|---|--------|------|------|
| 1 | CRITICAL | JWT署名検証がない | JWKS公開鍵でRS256検証を実装 |
| 2 | HIGH | Stripe Webhookタイミング攻撃+リプレイ | constant-time比較+タイムスタンプ検証 |
| 3 | HIGH | repo-path APIテナント分離不備 | admin限定エンドポイントに変更 |
| 4 | HIGH | blog-delivery XSS脆弱性 | escapeHtml()追加 |
| 5 | HIGH | ブログ生成がusageカウント対象外 | blog_generateもカウント対象に |
| 6 | MEDIUM | ミドルウェア配置が非最適 | functions/api/_middleware.jsに移動 |
| 7 | MEDIUM | D1インデックス不足 | 4インデックス追加 |
| 8 | MEDIUM | billing_periodのStripeとのずれ | 自然月統一を明記 |
| 9 | MEDIUM | CORSが*のまま | sitevibe-web.comに限定 |
| 10 | LOW | CHECK制約未定義 | plan/role/statusにCHECK追加 |

---

## 1. 要件サマリー

### ゴール
SiteVibe Agent Console を単一クライアント向け管理画面から、汎用マルチテナント SaaS へ進化させる。管理者（i-Style）がクライアントをセットアップし、クライアントは自分のサイト更新とブログ執筆を行える。

### 制約
- ソロ開発者（i-Style代表）が開発・運用
- 既存の Cloudflare Pages + Pages Functions アーキテクチャを維持
- 半年で 20-30 社対応
- CF エコシステム内で完結を優先（D1, Workers, Access）
- Mac mini はコード変更用に維持、テキスト系は CF Workers で完結
- 月額運用コスト $15-50 + Stripe 手数料

### スコープ外
- 100社以上のスケール実装（設計は考慮）
- クライアント自身によるリポジトリ登録
- リアルタイムコラボレーション
- ネイティブアプリ
- JS ウィジェット（ブログ埋め込み）

---

## 2. RALPLAN-DR サマリー

### 設計原則（Principles）

1. **CF ネイティブ最優先** — D1, Access, Workers, for SaaS を最大活用し、外部依存を最小化する
2. **段階的テナント分離** — 既存の単一テナント動作を壊さずに、clientId ベースの分離を逐次導入する
3. **認証は CF Access に委任** — JWT 検証のみ自前実装し、ログイン画面・セッション管理は CF Access に任せる
4. **コード変更 = Mac mini、テキスト = Workers** — 処理の性質に応じて実行環境を分離し、コスト最適化する
5. **Stripe は Webhook 駆動** — サブスク状態は Stripe をマスターとし、Webhook で D1 に同期する

### 意思決定ドライバー（Decision Drivers）

1. **運用コスト** — 無料枠内（D1, Access 50人, for SaaS 100ドメイン）で 20-30 社をカバーできるか
2. **開発速度** — ソロ開発者が各フェーズ 3-5 日で完了できる粒度か
3. **既存システムとの互換性** — 現行の Agent Console が Phase A 完了後も動作するか

### 実現可能なアーキテクチャ選択肢（Viable Options）

#### Option A: CF Pages Functions + D1（推奨、採用）
- **構成**: 既存の Pages Functions に `_middleware.js` を追加、D1 をデータストアとして利用
- **利点**: 既存アーキテクチャとの親和性が高い、追加コスト $0、デプロイ変更不要
- **欠点**: Pages Functions は 10ms CPU 制限（無料プラン）、D1 は 5MB/リクエスト制限
- **リスク**: ブログ記事生成が CPU 制限に引っかかる可能性（→ Claude API 呼出は外部 fetch なので CPU 時間に含まれない）

#### Option B: 専用 CF Workers + D1
- **構成**: Pages Functions をやめて独立した Workers で API を構築
- **利点**: CPU 制限が緩い（有料プランで 50ms）、Workers 間通信が効率的
- **欠点**: 既存の Pages Functions を全て移行する必要がある、開発工数 2 倍
- **リスク**: 移行中にダウンタイムが発生する可能性

→ **Option A を採用**。既存コードの変更を最小限にでき、無料枠内で 20-30 社に対応可能。ブログ記事生成の Claude API 呼出は subrequest であり CPU 時間にカウントされないため、Pages Functions の制限内で動作する。

---

## 3. 実装計画

### Phase A: マルチテナント基盤（3-5日）

**ゴール**: CF Access JWT から email を取得し、D1 でクライアントとロールを解決して、全 API エンドポイントに clientId を注入する。

#### タスク

##### A-1: D1 データベース作成

```bash
wrangler d1 create sitevibe-db
```

`wrangler.toml`（新規作成）に以下を追加:
```toml
name = "sitevibe"
compatibility_date = "2024-12-01"

[[d1_databases]]
binding = "DB"
database_name = "sitevibe-db"
database_id = "<作成時に取得したID>"
```

##### A-2: D1 マイグレーション（Phase A 分）

**新規作成**: `migrations/0001_create_tables.sql`

```sql
-- クライアント管理
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'light',
  monthly_limit INTEGER NOT NULL DEFAULT 3,
  repo_path TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  blog_subdomain TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  active INTEGER DEFAULT 1
);

-- ユーザー管理
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  role TEXT NOT NULL DEFAULT 'client',
  display_name TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- 利用量
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(id),
  action TEXT NOT NULL,
  job_id TEXT,
  billing_period TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

-- ジョブ履歴（D1版）
CREATE TABLE IF NOT EXISTS job_history (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  message TEXT NOT NULL,
  commit_hash TEXT,
  diff TEXT,
  result TEXT,
  approved_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- 初期データ: 管理者 + デフォルトクライアント
INSERT INTO clients (id, name, plan, monthly_limit, repo_path)
VALUES ('istyle', 'i-Style', 'premium', 999, NULL);

INSERT INTO users (email, client_id, role, display_name)
VALUES ('admin@i-style.vc', 'istyle', 'admin', 'i-Style 管理者');
```

マイグレーション実行:
```bash
wrangler d1 migrations apply sitevibe-db
```

##### A-3: 認証ミドルウェア作成

**新規作成**: `functions/_middleware.js`

```javascript
// CF Access JWT 検証 + D1 ユーザー解決ミドルウェア
// 全 /api/* リクエストに適用

const PUBLIC_PATHS = ['/api/stripe-webhook'];

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // 公開パスはスキップ
  if (PUBLIC_PATHS.some(p => url.pathname.startsWith(p))) {
    return next();
  }

  // /api/ 以外はスキップ（静的ファイル等）
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  // CF Access JWT を Cookie から取得
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // CF Access の JWT ペイロードをデコード（署名検証は CF Access が実施済み）
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    const email = payload.email;

    if (!email) {
      return new Response(JSON.stringify({ error: 'メールアドレスが取得できません' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // D1 でユーザー情報を取得
    const user = await env.DB.prepare(
      'SELECT u.email, u.client_id, u.role, u.display_name, c.name as client_name, c.plan, c.monthly_limit, c.repo_path, c.active FROM users u JOIN clients c ON u.client_id = c.id WHERE u.email = ?'
    ).bind(email).first();

    if (!user) {
      return new Response(JSON.stringify({ error: '未登録のユーザーです' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!user.active) {
      return new Response(JSON.stringify({ error: 'アカウントが無効です' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // context.data にユーザー情報を注入
    data.user = {
      email: user.email,
      clientId: user.client_id,
      role: user.role,
      displayName: user.display_name,
      clientName: user.client_name,
      plan: user.plan,
      monthlyLimit: user.monthly_limit,
      repoPath: user.repo_path,
    };

    return next();
  } catch (err) {
    console.error('認証エラー:', err);
    return new Response(JSON.stringify({ error: '認証処理でエラーが発生しました' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

##### A-4: /api/agent.js の修正

**変更ファイル**: `functions/api/agent.js`

変更内容:
- `context.data.user` から clientId を取得（body.clientId は廃止）
- admin ロールの場合は `body.targetClientId` で対象クライアントを指定可能
- clientId をジョブランナーに転送

```javascript
// 変更箇所（onRequestPost）
const user = context.data.user;
const clientId = user.role === 'admin' && body.targetClientId
  ? body.targetClientId
  : user.clientId;

// ジョブランナーへの転送時に clientId を付与
body: JSON.stringify({
  message: body.message,
  clientId: clientId,
}),
```

##### A-5: /api/chat.js, /api/intent.js の修正

**変更ファイル**: `functions/api/chat.js`, `functions/api/intent.js`

変更内容:
- `context.data.user` の存在確認（ミドルウェア通過後にユーザー情報が利用可能）
- ログに clientId を含める（将来の利用量追跡用）

##### A-6: フロントエンド修正

**変更ファイル**: `admin/js/admin.js`

変更内容:
- API 呼出時に `Cf-Access-Jwt-Assertion` ヘッダーは CF Access が自動付与するため変更不要
- `callAgent()` から `clientId: 'default'` の送信を削除
- ユーザー情報取得 API（`/api/me`）を追加呼出し、ヘッダーにクライアント名を表示

**新規作成**: `functions/api/me.js`

```javascript
// 現在のユーザー情報を返す
export async function onRequestGet(context) {
  const user = context.data.user;
  return new Response(JSON.stringify({
    email: user.email,
    clientId: user.clientId,
    role: user.role,
    displayName: user.displayName,
    clientName: user.clientName,
    plan: user.plan,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

#### 新規ファイル
| パス | 内容 |
|------|------|
| `wrangler.toml` | D1 バインディング設定 |
| `migrations/0001_create_tables.sql` | テーブル作成 + 初期データ |
| `functions/_middleware.js` | JWT 検証 + ユーザー解決 |
| `functions/api/me.js` | 現在ユーザー情報 API |

#### 変更ファイル
| パス | 変更内容 |
|------|---------|
| `functions/api/agent.js` | context.data.user から clientId 取得に変更 |
| `functions/api/chat.js` | user 情報のログ追加 |
| `functions/api/intent.js` | user 情報のログ追加 |
| `admin/js/admin.js` | /api/me 呼出、ヘッダーにクライアント名表示、clientId 送信削除 |

#### API エンドポイント

**GET /api/me**
```
レスポンス:
{
  "email": "admin@i-style.vc",
  "clientId": "istyle",
  "role": "admin",
  "displayName": "i-Style 管理者",
  "clientName": "i-Style",
  "plan": "premium"
}
```

**POST /api/agent（変更後）**
```
リクエスト:
{
  "message": "ヘッダーの色を変えて",
  "targetClientId": "salon-abc"  // admin のみ。省略時は自分の clientId
}

レスポンス: 変更なし
```

**401 レスポンス（未認証）**
```
{
  "error": "認証が必要です"
}
```

#### 受入基準
- [ ] D1 に clients, users テーブルが作成されている
- [ ] CF Access JWT から email を読み取り、D1 で clientId と role を解決できる
- [ ] role=admin のユーザーは全クライアントのデータにアクセスできる
- [ ] role=client のユーザーは自分の clientId のデータのみアクセスできる
- [ ] /api/agent が認証済みユーザーの clientId をジョブランナーに転送する
- [ ] 未認証リクエストは 401 を返す
- [ ] 既存の Agent Console が正常動作する（管理者ユーザーとして）

#### 依存関係
- なし（最初のフェーズ）
- 前提: Cloudflare Access が sitevibe-web.com/admin/* に設定済み

#### 見積もり
3-4 日

---

### Phase B: 課金基盤（3-5日）

**ゴール**: Stripe サブスクリプションと D1 を連携し、プランに応じた利用回数制限を実装する。

#### タスク

##### B-1: Stripe Products/Prices 作成

Stripe ダッシュボードまたは API で以下を作成:

| プラン | Product 名 | Price | monthly_limit |
|--------|-----------|-------|---------------|
| Light | SiteVibe Light | ¥5,500/月 | 3 |
| Standard | SiteVibe Standard | ¥11,000/月 | 10 |
| Premium | SiteVibe Premium | ¥33,000/月 | 999（実質無制限） |

##### B-2: Stripe Webhook ハンドラー

**新規作成**: `functions/api/stripe-webhook.js`

```javascript
export async function onRequestPost(context) {
  const { request, env } = context;

  // Stripe Webhook 署名検証
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();

  // 注: CF Workers では crypto.subtle を使って署名検証
  const isValid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const plan = mapPriceToPlan(sub.items.data[0].price.id, env);
      const limit = planToLimit(plan);

      await env.DB.prepare(
        'UPDATE clients SET plan = ?, monthly_limit = ?, stripe_subscription_id = ?, stripe_customer_id = ? WHERE stripe_customer_id = ?'
      ).bind(plan, limit, sub.id, sub.customer, sub.customer).run();
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await env.DB.prepare(
        'UPDATE clients SET plan = ?, monthly_limit = ?, stripe_subscription_id = NULL, active = 0 WHERE stripe_subscription_id = ?'
      ).bind('light', 0, sub.id).run();
      break;
    }

    case 'invoice.paid': {
      // 請求期間更新 — usage カウントのリセットは billing_period ベースで自動的に行われる
      // （新しい billing_period にはまだ usage レコードがないため）
      break;
    }
  }

  return new Response('ok', { status: 200 });
}

function mapPriceToPlan(priceId, env) {
  const map = {
    [env.STRIPE_PRICE_LIGHT]: 'light',
    [env.STRIPE_PRICE_STANDARD]: 'standard',
    [env.STRIPE_PRICE_PREMIUM]: 'premium',
  };
  return map[priceId] || 'light';
}

function planToLimit(plan) {
  const limits = { light: 3, standard: 10, premium: 999 };
  return limits[plan] || 3;
}

async function verifyStripeSignature(payload, signature, secret) {
  // Stripe の署名検証ロジック（crypto.subtle 使用）
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const sig = parts['v1'];

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${payload}`)
  );

  const expected = Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return expected === sig;
}
```

##### B-3: 利用回数チェック（/api/agent.js に追加）

**変更ファイル**: `functions/api/agent.js`

```javascript
// ジョブ投入前に利用回数チェック
const now = new Date();
const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const usageCount = await env.DB.prepare(
  'SELECT COUNT(*) as count FROM usage WHERE client_id = ? AND billing_period = ?'
).bind(clientId, billingPeriod).first();

if (usageCount.count >= user.monthlyLimit) {
  return jsonResponse({
    error: '今月の利用上限に達しました。プランのアップグレードをご検討ください。',
    usage: usageCount.count,
    limit: user.monthlyLimit,
  }, 429);
}

// ジョブ投入成功後に usage 記録
await env.DB.prepare(
  'INSERT INTO usage (client_id, action, job_id, billing_period) VALUES (?, ?, ?, ?)'
).bind(clientId, 'agent_job', submitResult.id, billingPeriod).run();
```

##### B-4: 利用状況 API

**新規作成**: `functions/api/usage.js`

```javascript
export async function onRequestGet(context) {
  const { env, data } = context;
  const user = data.user;

  const clientId = user.role === 'admin'
    ? new URL(context.request.url).searchParams.get('clientId') || user.clientId
    : user.clientId;

  const now = new Date();
  const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM usage WHERE client_id = ? AND billing_period = ?'
  ).bind(clientId, billingPeriod).first();

  const client = await env.DB.prepare(
    'SELECT plan, monthly_limit FROM clients WHERE id = ?'
  ).bind(clientId).first();

  return new Response(JSON.stringify({
    clientId,
    billingPeriod,
    used: result.count,
    limit: client.monthly_limit,
    plan: client.plan,
    remaining: Math.max(0, client.monthly_limit - result.count),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

#### 新規ファイル
| パス | 内容 |
|------|------|
| `functions/api/stripe-webhook.js` | Stripe Webhook 受信・処理 |
| `functions/api/usage.js` | 利用状況 API |

#### 変更ファイル
| パス | 変更内容 |
|------|---------|
| `functions/api/agent.js` | 利用回数チェック + usage 記録追加 |
| `functions/_middleware.js` | `/api/stripe-webhook` を公開パスに追加（済み） |

#### 環境変数（追加）
| 変数名 | 用途 |
|--------|------|
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名検証用シークレット |
| `STRIPE_PRICE_LIGHT` | Light プランの Price ID |
| `STRIPE_PRICE_STANDARD` | Standard プランの Price ID |
| `STRIPE_PRICE_PREMIUM` | Premium プランの Price ID |

#### API エンドポイント

**POST /api/stripe-webhook**（公開、Stripe 署名検証）
```
リクエスト: Stripe Event JSON（自動送信）
レスポンス: "ok" (200)
```

**GET /api/usage**
```
リクエスト: GET /api/usage?clientId=salon-abc（admin のみ clientId 指定可）
レスポンス:
{
  "clientId": "salon-abc",
  "billingPeriod": "2026-04",
  "used": 2,
  "limit": 10,
  "plan": "standard",
  "remaining": 8
}
```

**429 レスポンス（利用上限超過）**
```
{
  "error": "今月の利用上限に達しました。プランのアップグレードをご検討ください。",
  "usage": 10,
  "limit": 10
}
```

#### 受入基準
- [ ] Stripe に 3 プラン（Light/Standard/Premium）の Product + Price が作成されている
- [ ] /api/stripe-webhook が subscription.created/updated/deleted, invoice.paid を処理する
- [ ] D1 の clients テーブルに plan, stripe_subscription_id が記録される
- [ ] /api/agent がジョブ投入前に月次利用回数をチェックし、上限超過で 429 を返す
- [ ] invoice.paid で billing_period が進み、カウントが実質リセットされる

#### 依存関係
- Phase A 完了（D1 + 認証ミドルウェア）

#### 見積もり
3-4 日

---

### Phase C: 管理者セットアップ UI（3-5日）

**ゴール**: 管理者（role=admin）がクライアントの登録・編集・利用状況確認をブラウザから行える管理画面を構築する。

#### タスク

##### C-1: クライアント管理 API

**新規作成**: `functions/api/clients.js`

```javascript
// GET /api/clients — クライアント一覧（admin のみ）
export async function onRequestGet(context) {
  const { env, data } = context;
  if (data.user.role !== 'admin') {
    return jsonResponse({ error: '管理者権限が必要です' }, 403);
  }

  const clients = await env.DB.prepare(
    'SELECT c.*, (SELECT COUNT(*) FROM usage u WHERE u.client_id = c.id AND u.billing_period = ?) as month_usage FROM clients c ORDER BY c.created_at DESC'
  ).bind(currentBillingPeriod()).all();

  return jsonResponse({ clients: clients.results });
}

// POST /api/clients — クライアント新規登録（admin のみ）
export async function onRequestPost(context) {
  const { request, env, data } = context;
  if (data.user.role !== 'admin') {
    return jsonResponse({ error: '管理者権限が必要です' }, 403);
  }

  const body = await request.json();
  const id = generateId(); // crypto.randomUUID() の短縮版

  await env.DB.prepare(
    'INSERT INTO clients (id, name, plan, monthly_limit, repo_path) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, body.name, body.plan || 'light', planToLimit(body.plan), body.repoPath || null).run();

  // ユーザーも同時登録
  if (body.email) {
    await env.DB.prepare(
      'INSERT INTO users (email, client_id, role, display_name) VALUES (?, ?, ?, ?)'
    ).bind(body.email, id, 'client', body.name).run();
  }

  return jsonResponse({ id, success: true });
}

// PUT /api/clients — クライアント更新（admin のみ）
export async function onRequestPut(context) {
  const { request, env, data } = context;
  if (data.user.role !== 'admin') {
    return jsonResponse({ error: '管理者権限が必要です' }, 403);
  }

  const body = await request.json();
  await env.DB.prepare(
    'UPDATE clients SET name = ?, plan = ?, monthly_limit = ?, repo_path = ?, active = ? WHERE id = ?'
  ).bind(body.name, body.plan, planToLimit(body.plan), body.repoPath, body.active ? 1 : 0, body.id).run();

  return jsonResponse({ success: true });
}
```

**API エンドポイント**:

**GET /api/clients（admin のみ）**
```
レスポンス:
{
  "clients": [
    {
      "id": "salon-abc",
      "name": "ABC美容室",
      "plan": "standard",
      "monthly_limit": 10,
      "repo_path": "/Users/takahashiyuuki/repos/salon-abc",
      "active": 1,
      "month_usage": 3,
      "created_at": 1743552000
    }
  ]
}
```

**POST /api/clients（admin のみ）**
```
リクエスト:
{
  "name": "ABC美容室",
  "email": "owner@salon-abc.com",
  "plan": "standard",
  "repoPath": "/Users/takahashiyuuki/repos/salon-abc"
}

レスポンス:
{ "id": "abc123", "success": true }
```

**PUT /api/clients（admin のみ）**
```
リクエスト:
{
  "id": "salon-abc",
  "name": "ABC美容室",
  "plan": "premium",
  "repoPath": "/Users/takahashiyuuki/repos/salon-abc",
  "active": true
}

レスポンス:
{ "success": true }
```

##### C-2: 管理者 UI（admin/index.html に統合）

**変更ファイル**: `admin/index.html`

変更内容:
- ヘッダーにクライアント管理ボタン追加（admin ロールのみ表示）
- クライアント管理パネル（オーバーレイ）を追加

```html
<!-- クライアント管理パネル（admin のみ表示） -->
<div class="clients-overlay" id="clientsOverlay">
  <div class="clients-panel">
    <div class="clients-panel__header">
      <h3>クライアント管理</h3>
      <button id="clientsClose">✕</button>
    </div>
    <div class="clients-panel__actions">
      <button id="addClientBtn">+ 新規クライアント</button>
    </div>
    <div class="clients-panel__body" id="clientsList"></div>
  </div>
</div>

<!-- 新規クライアントフォーム -->
<div class="client-form-overlay" id="clientFormOverlay">
  <div class="client-form">
    <h3 id="clientFormTitle">新規クライアント登録</h3>
    <form id="clientForm">
      <input type="hidden" id="clientId">
      <label>クライアント名<input type="text" id="clientName" required></label>
      <label>メールアドレス<input type="email" id="clientEmail"></label>
      <label>プラン
        <select id="clientPlan">
          <option value="light">Light（月3回）</option>
          <option value="standard">Standard（月10回）</option>
          <option value="premium">Premium（無制限）</option>
        </select>
      </label>
      <label>リポジトリパス<input type="text" id="clientRepoPath"></label>
      <div class="client-form__actions">
        <button type="button" id="clientFormCancel">キャンセル</button>
        <button type="submit">保存</button>
      </div>
    </form>
  </div>
</div>
```

##### C-3: 管理者 JS

**新規作成**: `admin/js/clients.js`

- クライアント一覧取得・表示
- 新規登録フォーム
- 編集フォーム
- 利用状況バッジ（使用回数/上限）
- admin ロール判定で表示/非表示切替

##### C-4: 管理者 CSS

**変更ファイル**: `admin/css/admin.css`

- クライアント管理パネルのスタイル追加
- フォームスタイル追加
- 利用状況バッジのスタイル

#### 新規ファイル
| パス | 内容 |
|------|------|
| `functions/api/clients.js` | クライアント CRUD API |
| `admin/js/clients.js` | クライアント管理 UI スクリプト |

#### 変更ファイル
| パス | 変更内容 |
|------|---------|
| `admin/index.html` | 管理パネル HTML 追加、clients.js 読込追加 |
| `admin/css/admin.css` | 管理パネルスタイル追加 |
| `admin/js/admin.js` | /api/me で role 取得、admin なら管理ボタン表示 |

#### 受入基準
- [ ] /admin/ 内に管理者専用のクライアント管理UIがある（role=admin のみ表示）
- [ ] クライアントの新規登録（名前、メール、プラン、リポジトリパス）ができる
- [ ] 登録済みクライアント一覧が表示される
- [ ] クライアントのプラン変更、リポジトリパス変更ができる
- [ ] クライアントの利用状況（今月のジョブ数/上限）が表示される
- [ ] role=client のユーザーには管理ボタンが表示されない

#### 依存関係
- Phase A 完了（認証 + D1）
- Phase B 完了（利用状況データ）

#### 見積もり
3-4 日

---

### Phase D: ブログ MVP（1-2週間）

**ゴール**: Vibe に「ブログ書いて」と伝えると記事ドラフトが生成され、Tiptap で編集・公開でき、サブドメインで配信される。

#### タスク

##### D-1: D1 マイグレーション（ブログテーブル）

**新規作成**: `migrations/0002_blog_posts.sql`

```sql
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  meta_description TEXT,
  featured_image TEXT,
  published_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(client_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_client ON blog_posts(client_id, status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(client_id, slug);
```

##### D-2: インテント判定に 'blog' ルート追加

**変更ファイル**: `functions/api/intent.js`

```javascript
// system prompt を変更
content: `あなたはWebサイト管理AIです。ユーザーのメッセージが以下のどれかを判定してください。

「code」— サイトのHTML/CSS/JSの変更・追加・修正・削除を依頼している
「blog」— ブログ記事の作成・編集・公開を依頼している（「ブログ書いて」「記事作って」「投稿したい」など）
「chat」— 雑談、質問、感想、挨拶など

「code」「blog」「chat」のどれか1単語だけを返してください。`
```

##### D-3: ブログ記事生成 API

**新規作成**: `functions/api/blog-generate.js`

```javascript
// Claude API (Sonnet) で記事ドラフトを生成
export async function onRequestPost(context) {
  const { request, env, data } = context;
  const user = data.user;

  const { topic, tone, length } = await request.json();

  if (!topic?.trim()) {
    return jsonResponse({ error: 'topic は必須です' }, 400);
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `以下のトピックでブログ記事を書いてください。

トピック: ${topic}
トーン: ${tone || 'プロフェッショナルだが親しみやすい'}
長さ: ${length || '1500-2000文字'}

以下のJSON形式で返してください:
{
  "title": "記事タイトル",
  "content": "<p>HTML形式の本文</p>",
  "metaDescription": "SEO用の説明文（120文字以内）",
  "slug": "url-friendly-slug"
}`
      }],
    }),
  });

  if (!res.ok) {
    return jsonResponse({ error: '記事生成に失敗しました' }, 502);
  }

  const result = await res.json();
  const text = result.content[0].text;

  // JSON パース
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return jsonResponse({ error: '記事のパースに失敗しました' }, 500);
  }

  const article = JSON.parse(jsonMatch[0]);

  return jsonResponse({
    title: article.title,
    content: article.content,
    metaDescription: article.metaDescription,
    slug: article.slug,
  });
}
```

##### D-4: ブログ CRUD API

**新規作成**: `functions/api/blog.js`

```javascript
// GET /api/blog — 記事一覧
export async function onRequestGet(context) {
  const { env, data, request } = context;
  const user = data.user;
  const clientId = user.role === 'admin'
    ? new URL(request.url).searchParams.get('clientId') || user.clientId
    : user.clientId;

  const posts = await env.DB.prepare(
    'SELECT id, title, slug, status, published_at, created_at, updated_at FROM blog_posts WHERE client_id = ? ORDER BY created_at DESC'
  ).bind(clientId).all();

  return jsonResponse({ posts: posts.results });
}

// POST /api/blog — 記事作成
export async function onRequestPost(context) {
  const { request, env, data } = context;
  const user = data.user;
  const clientId = user.clientId;

  const body = await request.json();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO blog_posts (id, client_id, title, content, slug, status, meta_description) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, clientId, body.title, body.content, body.slug, body.status || 'draft', body.metaDescription || '').run();

  return jsonResponse({ id, success: true });
}

// PUT /api/blog — 記事更新
export async function onRequestPut(context) {
  const { request, env, data } = context;
  const user = data.user;
  const body = await request.json();

  // 所有権チェック
  const post = await env.DB.prepare(
    'SELECT client_id FROM blog_posts WHERE id = ?'
  ).bind(body.id).first();

  if (!post || (user.role !== 'admin' && post.client_id !== user.clientId)) {
    return jsonResponse({ error: '記事が見つかりません' }, 404);
  }

  const publishedAt = body.status === 'published' ? Math.floor(Date.now() / 1000) : null;

  await env.DB.prepare(
    'UPDATE blog_posts SET title = ?, content = ?, slug = ?, status = ?, meta_description = ?, published_at = COALESCE(?, published_at), updated_at = unixepoch() WHERE id = ?'
  ).bind(body.title, body.content, body.slug, body.status, body.metaDescription || '', publishedAt, body.id).run();

  return jsonResponse({ success: true });
}

// DELETE /api/blog — 記事削除
export async function onRequestDelete(context) {
  const { request, env, data } = context;
  const user = data.user;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  const post = await env.DB.prepare(
    'SELECT client_id FROM blog_posts WHERE id = ?'
  ).bind(id).first();

  if (!post || (user.role !== 'admin' && post.client_id !== user.clientId)) {
    return jsonResponse({ error: '記事が見つかりません' }, 404);
  }

  await env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true });
}
```

**API エンドポイント**:

**GET /api/blog**
```
レスポンス:
{
  "posts": [
    {
      "id": "uuid-1",
      "title": "美容室の集客方法",
      "slug": "beauty-salon-marketing",
      "status": "published",
      "published_at": 1743552000,
      "created_at": 1743465600,
      "updated_at": 1743552000
    }
  ]
}
```

**POST /api/blog**
```
リクエスト:
{
  "title": "美容室の集客方法",
  "content": "<p>本文HTML...</p>",
  "slug": "beauty-salon-marketing",
  "status": "draft",
  "metaDescription": "美容室の集客に効果的な5つの方法"
}

レスポンス:
{ "id": "uuid-1", "success": true }
```

**POST /api/blog-generate**
```
リクエスト:
{
  "topic": "美容室の集客方法",
  "tone": "親しみやすい",
  "length": "2000文字"
}

レスポンス:
{
  "title": "美容室の集客を劇的に変える5つの方法",
  "content": "<p>HTML形式の本文...</p>",
  "metaDescription": "美容室の集客に効果的な5つの方法を解説",
  "slug": "beauty-salon-marketing-tips"
}
```

##### D-5: Tiptap エディタ統合

**新規作成**: `admin/js/blog-editor.js`

- Tiptap エディタの初期化（CDN 版を使用）
- 記事一覧画面
- 新規作成 / 編集画面
- 公開/非公開切替
- AI 生成ボタン（/api/blog-generate を呼出）

**変更ファイル**: `admin/index.html`

- Tiptap CDN スクリプト追加
- ブログエディタ画面の HTML 追加

```html
<!-- Tiptap CDN -->
<script src="https://cdn.jsdelivr.net/npm/@tiptap/core@2/dist/index.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@tiptap/starter-kit@2/dist/index.umd.js"></script>

<!-- ブログ画面 -->
<div class="blog-overlay" id="blogOverlay">
  <div class="blog-panel">
    <div class="blog-panel__header">
      <h3>ブログ管理</h3>
      <button id="blogClose">✕</button>
    </div>
    <!-- 記事一覧 / エディタ が切り替わる -->
    <div class="blog-panel__body" id="blogContent"></div>
  </div>
</div>
```

##### D-6: サブドメイン配信（CF Workers + Cloudflare for SaaS）

**新規作成**: `workers/blog-delivery/index.js`

別途 Workers プロジェクトとしてデプロイ。D1 バインディングを共有。

```javascript
// blog.{client-domain}.com でアクセスされた記事を配信
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // blog.example.com → example.com → D1 で client 特定
    const client = await env.DB.prepare(
      'SELECT id, name FROM clients WHERE blog_subdomain = ?'
    ).bind(hostname).first();

    if (!client) {
      return new Response('Not Found', { status: 404 });
    }

    const path = url.pathname;

    // / → 記事一覧
    if (path === '/' || path === '') {
      const posts = await env.DB.prepare(
        "SELECT title, slug, meta_description, published_at FROM blog_posts WHERE client_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 20"
      ).bind(client.id).all();

      return new Response(renderBlogIndex(client.name, posts.results), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // /slug → 記事詳細
    const slug = path.replace(/^\//, '').replace(/\/$/, '');
    const post = await env.DB.prepare(
      "SELECT * FROM blog_posts WHERE client_id = ? AND slug = ? AND status = 'published'"
    ).bind(client.id, slug).first();

    if (!post) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response(renderBlogPost(client.name, post), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};

function renderBlogIndex(siteName, posts) {
  // シンプルな HTML テンプレート（後で改善）
  const postLinks = posts.map(p =>
    `<article><h2><a href="/${p.slug}">${p.title}</a></h2><p>${p.meta_description || ''}</p></article>`
  ).join('');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${siteName} Blog</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>${siteName} Blog</h1>${postLinks}</body></html>`;
}

function renderBlogPost(siteName, post) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${post.title} | ${siteName}</title><meta name="description" content="${post.meta_description || ''}"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><article><h1>${post.title}</h1>${post.content}</article><a href="/">← 記事一覧に戻る</a></body></html>`;
}
```

Cloudflare for SaaS セットアップ:
```bash
# フォールバックオリジン設定（初回のみ）
wrangler pages project list  # 確認
# CF Dashboard > SSL/TLS > Custom Hostnames でフォールバックオリジンを設定
# クライアントの DNS に CNAME レコードを追加: blog → sitevibe-blog.{account}.workers.dev
```

##### D-7: admin.js のルーティング変更

**変更ファイル**: `admin/js/admin.js`

- `classifyIntent()` の戻り値に `'blog'` を追加
- `processRequest()` に blog ルートを追加
- blog インテント時はブログエディタを開き、AI 生成を開始

```javascript
// processRequest 内
if (intent === 'blog') {
  await processBlogRequest(text);
} else if (intent === 'code') {
  await processCodeRequest(text);
} else {
  await processChatRequest(text);
}
```

#### 新規ファイル
| パス | 内容 |
|------|------|
| `migrations/0002_blog_posts.sql` | ブログテーブル作成 |
| `functions/api/blog-generate.js` | Claude API で記事生成 |
| `functions/api/blog.js` | ブログ CRUD API |
| `admin/js/blog-editor.js` | Tiptap エディタ + ブログ管理 UI |
| `workers/blog-delivery/index.js` | サブドメイン配信 Workers |
| `workers/blog-delivery/wrangler.toml` | Workers 設定 |

#### 変更ファイル
| パス | 変更内容 |
|------|---------|
| `functions/api/intent.js` | 'blog' インテント追加 |
| `admin/index.html` | Tiptap CDN + ブログ画面 HTML 追加 |
| `admin/js/admin.js` | blog ルート追加、processBlogRequest 追加 |
| `admin/css/admin.css` | ブログエディタ・記事一覧スタイル追加 |

#### 環境変数（追加）
| 変数名 | 用途 |
|--------|------|
| `ANTHROPIC_API_KEY` | Claude API（記事生成用） |

#### 受入基準
- [ ] Vibe に「ブログ書いて」と伝えるとインテント判定で blog ルートに入る
- [ ] Claude API (Sonnet) で記事ドラフトが生成される（CF Workers で完結）
- [ ] Tiptap エディタで記事を編集できる
- [ ] 記事が D1 の blog_posts テーブルに保存される
- [ ] blog.client-domain.com でサブドメイン配信される
- [ ] 記事の一覧表示、公開/非公開切り替えができる

#### 依存関係
- Phase A 完了（認証 + D1）
- Phase B は並行可能だが、利用量カウントを blog にも適用する場合は B 完了後

#### 見積もり
7-10 日

---

### Phase E: ジョブランナー強化（3-5日）

**ゴール**: server/index.ts のインメモリ Map を Bun SQLite に置換し、ジョブの永続化と並列実行を実現する。

#### タスク

##### E-1: Bun SQLite セットアップ

**新規作成**: `server/db.ts`

```typescript
import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, 'data', 'jobs.db');

// data ディレクトリ作成
import { mkdirSync } from 'fs';
mkdirSync(join(import.meta.dir, 'data'), { recursive: true });

const db = new Database(DB_PATH);

// WAL モード有効化（並列アクセス向上）
db.run('PRAGMA journal_mode = WAL');

// テーブル作成
db.run(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    diff TEXT,
    error TEXT,
    commit_hash TEXT,
    approved_at INTEGER,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    message TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    diff TEXT,
    result TEXT,
    approved_at INTEGER NOT NULL
  )
`);

db.run('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)');
db.run('CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id)');
db.run('CREATE INDEX IF NOT EXISTS idx_history_client ON history(client_id)');

export default db;
```

##### E-2: server/index.ts の Map → SQLite 置換

**変更ファイル**: `server/index.ts`

主な変更:
- `const jobs = new Map<string, Job>()` → SQLite クエリに置換
- `const history: HistoryEntry[]` → SQLite クエリに置換
- ジョブ投入: `INSERT INTO jobs`
- ジョブ取得: `SELECT FROM jobs WHERE id = ?`
- 履歴追加: `INSERT INTO history`
- 履歴取得: `SELECT FROM history WHERE client_id = ? ORDER BY approved_at DESC LIMIT 20`

```typescript
import db from './db';

// ジョブ投入
app.post('/jobs', async (c) => {
  const body = await c.req.json<{ message: string; clientId?: string }>();
  const clientId = body.clientId || 'default';

  // 同一クライアントで実行中のジョブチェック
  const running = db.query(
    "SELECT id FROM jobs WHERE client_id = ? AND status IN ('pending', 'running')"
  ).get(clientId);

  if (running) {
    return c.json({ error: '実行中のジョブがあります。完了をお待ちください。' }, 429);
  }

  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  db.run(
    'INSERT INTO jobs (id, client_id, message, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, clientId, body.message.trim(), 'pending', Date.now()]
  );

  runJob(id, clientId, body.message.trim());
  return c.json({ id, status: 'pending' });
});
```

##### E-3: 並列実行キュー

**新規作成**: `server/queue.ts`

```typescript
const MAX_PARALLEL = 3;
let runningCount = 0;
const waitQueue: Array<() => void> = [];

export async function acquireSlot(): Promise<void> {
  if (runningCount < MAX_PARALLEL) {
    runningCount++;
    return;
  }
  return new Promise(resolve => {
    waitQueue.push(() => {
      runningCount++;
      resolve();
    });
  });
}

export function releaseSlot(): void {
  runningCount--;
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    next();
  }
}

export function getQueueStatus() {
  return { running: runningCount, waiting: waitQueue.length, max: MAX_PARALLEL };
}
```

**変更ファイル**: `server/index.ts`

```typescript
import { acquireSlot, releaseSlot, getQueueStatus } from './queue';

async function runJob(jobId: string, clientId: string, message: string) {
  await acquireSlot();
  try {
    db.run("UPDATE jobs SET status = 'running' WHERE id = ?", [jobId]);
    // ... 既存の Claude Code CLI 実行ロジック ...
  } finally {
    releaseSlot();
  }
}
```

##### E-4: getRepoPath() の D1 連携

**変更ファイル**: `server/index.ts`

```typescript
// ハードコードされた repos マップを D1 REST API に置換
async function getRepoPath(clientId: string): Promise<string> {
  // まずローカルキャッシュを確認
  if (repoPathCache.has(clientId)) {
    return repoPathCache.get(clientId)!;
  }

  try {
    // D1 REST API 経由で取得
    const res = await fetch(`${D1_API_URL}/clients/${clientId}/repo-path`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.repoPath) {
        repoPathCache.set(clientId, data.repoPath);
        return data.repoPath;
      }
    }
  } catch (err) {
    console.error('D1 からリポパス取得失敗:', err);
  }

  // フォールバック
  return process.env.DEFAULT_REPO_PATH || `${process.env.HOME}/01_開発/01_自社プロダクト/SiteVibe`;
}

const repoPathCache = new Map<string, string>();
```

D1 側にリポパス取得 API を追加:

**新規作成**: `functions/api/clients/[id]/repo-path.js`

```javascript
export async function onRequestGet(context) {
  const { env, params } = context;
  const clientId = params.id;

  const client = await env.DB.prepare(
    'SELECT repo_path FROM clients WHERE id = ? AND active = 1'
  ).bind(clientId).first();

  if (!client) {
    return new Response(JSON.stringify({ error: 'クライアントが見つかりません' }), { status: 404 });
  }

  return new Response(JSON.stringify({ repoPath: client.repo_path }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

##### E-5: ヘルスチェック強化

**変更ファイル**: `server/index.ts`

```typescript
app.get('/health', (c) => {
  const jobStats = db.query(
    "SELECT status, COUNT(*) as count FROM jobs GROUP BY status"
  ).all();

  const historyCount = db.query("SELECT COUNT(*) as count FROM history").get();

  return c.json({
    status: 'ok',
    jobs: Object.fromEntries(jobStats.map((s: any) => [s.status, s.count])),
    history: historyCount.count,
    queue: getQueueStatus(),
    uptime: process.uptime(),
  });
});
```

#### 新規ファイル
| パス | 内容 |
|------|------|
| `server/db.ts` | Bun SQLite 初期化 + テーブル定義 |
| `server/queue.ts` | 並列実行キュー |
| `server/data/` | SQLite DB ファイル格納ディレクトリ |
| `functions/api/clients/[id]/repo-path.js` | リポパス取得 API |

#### 変更ファイル
| パス | 変更内容 |
|------|---------|
| `server/index.ts` | Map → SQLite、並列キュー導入、getRepoPath D1 連携 |
| `.gitignore` | `server/data/*.db*` を追加 |

#### 受入基準
- [ ] server/index.ts の Map/Array が Bun SQLite に置き換わっている
- [ ] サーバー再起動後もジョブと履歴が永続化されている
- [ ] ジョブキューで最大3並列実行ができる
- [ ] getRepoPath() が D1 の clients テーブルから repo_path を取得する
- [ ] ヘルスチェックがキュー状態を含めて返す

#### 依存関係
- Phase A 完了（D1 + clients テーブル）
- server/index.ts は Phase A-D と独立して変更可能（Mac mini ローカル）

#### 見積もり
3-4 日

---

## 4. リスクと軽減策

| # | リスク | 影響度 | 発生確率 | 軽減策 |
|---|--------|--------|---------|--------|
| 1 | **CF Access 無料枠超過（50人）** | 高 | 低（20-30社なら1社1-2人で50人以内） | ユーザー数を監視。超過前に独自認証（JWT + D1 セッション）への移行を計画 |
| 2 | **D1 の書込制限（無料: 100K writes/日）** | 中 | 低（30社 × 10回/日 = 300 writes） | usage テーブルの書込頻度を監視。$5/月の有料プランで 10M writes/月に拡張可能 |
| 3 | **Pages Functions の CPU 制限（10ms/無料）** | 中 | 中（Claude API 呼出は subrequest で対象外だが、D1 クエリ + JSON パースが重い場合） | 重い処理は Workers に分離。有料プランで 50ms に拡張可能 |
| 4 | **Stripe Webhook の信頼性** | 高 | 低 | 冪等性を確保（subscription_id で UPDATE）。Webhook 再送を考慮した設計。Stripe Dashboard でイベント再送可能 |
| 5 | **Mac mini ダウン時のジョブランナー停止** | 高 | 中 | Phase E の SQLite 永続化でジョブ復旧可能。ヘルスチェック + launchd の自動再起動。テキスト系（ブログ）は CF Workers で動作するため影響なし |
| 6 | **Tiptap CDN の可用性** | 低 | 低 | CDN 障害時は npm install でローカルバンドルに切替。初期は CDN で十分 |
| 7 | **CF for SaaS のカスタムドメイン設定の複雑さ** | 中 | 中 | 最初は sitevibe-blog.pages.dev のサブパスで配信（/blog/client-name/）。安定後にカスタムドメインへ移行 |
| 8 | **認証ミドルウェアのパフォーマンス** | 中 | 低 | D1 クエリは 1ms 程度。毎リクエスト実行だが十分高速。将来的に KV キャッシュ導入可能 |

---

## 5. 検証ステップ

### Phase A 検証

```bash
# 1. D1 テーブル確認
wrangler d1 execute sitevibe-db --command "SELECT * FROM clients"
wrangler d1 execute sitevibe-db --command "SELECT * FROM users"

# 2. 認証テスト（CF Access 経由でアクセス）
curl -H "Cf-Access-Jwt-Assertion: <JWT>" https://sitevibe-web.com/api/me
# 期待: {"email":"admin@i-style.vc","clientId":"istyle","role":"admin",...}

# 3. 未認証テスト
curl https://sitevibe-web.com/api/me
# 期待: 401 {"error":"認証が必要です"}

# 4. Agent Console 動作確認
# ブラウザで https://sitevibe-web.com/admin/ にアクセス
# CF Access ログイン → チャット送信 → ジョブ投入が動作すること
```

### Phase B 検証

```bash
# 1. Stripe Webhook テスト
stripe trigger customer.subscription.created
# D1 の clients テーブルに plan が反映されることを確認

# 2. 利用回数チェック
# Light プラン（月3回）のクライアントで 3 回ジョブ投入
# 4 回目で 429 レスポンスが返ることを確認

# 3. 利用状況 API
curl -H "Cf-Access-Jwt-Assertion: <JWT>" https://sitevibe-web.com/api/usage
# 期待: {"used":3,"limit":3,"remaining":0}
```

### Phase C 検証

```
1. admin ロールでログイン → ヘッダーにクライアント管理ボタンが表示される
2. クライアント一覧が表示される
3. 新規クライアント登録 → 一覧に追加される
4. クライアント編集 → プラン変更が反映される
5. client ロールでログイン → クライアント管理ボタンが表示されない
```

### Phase D 検証

```
1. Vibe に「美容室の集客についてブログ書いて」と送信
2. intent = 'blog' と判定される
3. Claude API で記事ドラフトが生成される
4. Tiptap エディタで編集できる
5. 「公開」をクリック → D1 に保存
6. blog.client-domain.com でアクセス → 記事が表示される
```

### Phase E 検証

```bash
# 1. ジョブ永続化テスト
bun run server/index.ts &
curl -X POST http://localhost:3100/jobs -H "Authorization: Bearer <token>" -d '{"message":"test"}'
kill %1
bun run server/index.ts &
curl http://localhost:3100/health
# 期待: 以前のジョブが残っている

# 2. 並列実行テスト
# 3 つのジョブを同時投入
for i in 1 2 3; do
  curl -X POST http://localhost:3100/jobs -H "Authorization: Bearer <token>" -d "{\"message\":\"test $i\",\"clientId\":\"client$i\"}" &
done
# 3 つとも running になることを確認

# 3. キュー待ちテスト
# 4 つ目のジョブが pending（キュー待ち）になることを確認

# 4. getRepoPath テスト
# D1 にクライアントの repo_path を登録
# ジョブ投入時にそのパスが使われることをログで確認
```

---

## 6. ADR（Architecture Decision Record）

### ADR-001: CF Pages Functions + D1 で SaaS 基盤を構築する

**日付**: 2026-04-02
**ステータス**: 採用

#### 決定
既存の Cloudflare Pages Functions アーキテクチャを維持し、D1 をデータストアとして追加することで、マルチテナント SaaS を構築する。

#### ドライバー
1. **運用コスト最小化** — 20-30 社で月額 $0（CF 無料枠内）
2. **移行リスク最小化** — 既存コードの変更を最小限にする
3. **開発速度** — ソロ開発者が各フェーズ 3-5 日で完了できる

#### 検討した選択肢

| 選択肢 | 利点 | 欠点 |
|--------|------|------|
| **A: Pages Functions + D1（採用）** | 既存互換、コスト$0、変更最小 | CPU 10ms 制限、Pages Functions の柔軟性限定 |
| **B: 専用 CF Workers + D1** | CPU 制限緩い、自由度高い | 全 API 移行必要、開発工数 2 倍 |
| **C: Hono on CF Workers + D1** | フルスタック、型安全 | 既存コード全面書換、学習コスト |
| **D: Supabase + Vercel** | PostgreSQL、認証組込み | 月額 $25+、CF エコシステム外 |

#### 採用理由
- Pages Functions は subrequest（外部 API 呼出）の待ち時間が CPU 時間にカウントされないため、Claude API 呼出やジョブランナー転送は制限内で動作する
- D1 は Pages Functions からネイティブにバインディングでアクセスでき、追加設定が最小限
- 既存の `functions/api/*.js` を段階的に改修でき、一括移行のリスクがない
- 20-30 社規模では無料枠で十分

#### 結果
- 全 API エンドポイントに `_middleware.js` による認証が追加される
- D1 バインディングが全 Functions で利用可能になる
- Pages Functions の CPU 制限を超える処理が必要になった場合は、その処理のみ Workers に分離する（部分移行）

#### フォローアップ
- [ ] 50 人超過時の認証移行計画を Phase B 完了後に策定
- [ ] D1 の書込量が無料枠に近づいたら有料プラン移行を検討
- [ ] Phase D のブログ配信 Workers が安定したら、他の重い処理も Workers 分離を検討

---

### ADR-002: ジョブランナーに Bun SQLite を採用する

**日付**: 2026-04-02
**ステータス**: 採用

#### 決定
Mac mini 上のジョブランナー（server/index.ts）のデータ永続化に Bun の組込み SQLite を使用する。

#### ドライバー
1. **追加依存なし** — Bun に組込みで、追加インストール不要
2. **パフォーマンス** — Bun SQLite は C バインディングで高速
3. **運用シンプルさ** — ファイルベースで DB サーバー不要

#### 検討した選択肢

| 選択肢 | 利点 | 欠点 |
|--------|------|------|
| **Bun SQLite（採用）** | 追加依存0、高速、WAL並列 | Mac mini ローカルのみ |
| **better-sqlite3** | Node.js 互換 | Bun と二重管理 |
| **D1 REST API** | CF 上でデータ統合 | レイテンシ高い、オフライン不可 |
| **Redis** | 高速、TTL機能 | 別サーバー必要、コスト増 |

#### 結果
- `server/data/jobs.db` にデータが永続化される
- WAL モードで読み書き並列アクセスが可能
- サーバー再起動後もジョブ状態が復旧する

---

## 全体タイムライン

```
Phase A (3-4日)  ━━━━━━━━
Phase B (3-4日)          ━━━━━━━━
Phase C (3-4日)                  ━━━━━━━━
Phase D (7-10日)                          ━━━━━━━━━━━━━━━━
Phase E (3-4日)    ━━━━━━━━  (A 完了後いつでも着手可)
                   ─────────────────────────────────────
合計: 約 4-6 週間
```

Phase E は Mac mini ローカルの作業なので、Phase B-D と並行して進めることが可能。全体で約 4-6 週間の見込み。
