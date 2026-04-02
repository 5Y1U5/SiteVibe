# Deep Dive Spec: SiteVibe SaaS Evolution

## Goal
SiteVibe Agent Console を単一クライアント向けの管理画面から、汎用マルチテナント SaaS に進化させる。管理者（i-Style）がクライアントをセットアップし、クライアントは自分のサイト更新とブログ執筆を行える。ブログ機能は SiteVibe 制作サイト以外にも独立提供可能。

## Constraints
- ソロ開発者（i-Style代表）による開発・運用
- 既存の Cloudflare Pages + Pages Functions アーキテクチャを維持
- スモールスタート（既存クライアントに提供 → 拡大）
- 半年で 20-30 社対応
- 外部サービス依存は最小限（Cloudflare エコシステム内で完結を優先）
- Mac mini はコード変更用に維持、テキスト系は CF Workers で完結

## Non-Goals
- 100社以上のスケールは初期スコープ外（設計は考慮するが実装は後）
- クライアント自身によるリポジトリ登録（管理者がセットアップ）
- リアルタイムコラボレーション
- ネイティブアプリ
- JSウィジェット（ブログ埋め込み）は後回し

## Acceptance Criteria

### Phase A: マルチテナント基盤
- [ ] D1 に clients, users テーブルが作成されている
- [ ] CF Access JWT から email を読み取り、D1 で clientId と role を解決できる
- [ ] role=admin のユーザーは全クライアントのデータにアクセスできる
- [ ] role=client のユーザーは自分の clientId のデータのみアクセスできる
- [ ] /api/agent が認証済みユーザーの clientId をジョブランナーに転送する
- [ ] 未認証リクエストは 401 を返す

### Phase B: 課金基盤
- [ ] Stripe に 3 プラン（Light/Standard/Premium）の Product + Price が作成されている
- [ ] /api/stripe-webhook が subscription.created/updated/deleted, invoice.paid を処理する
- [ ] D1 の clients テーブルに plan, stripe_subscription_id が記録される
- [ ] /api/agent がジョブ投入前に月次利用回数をチェックし、上限超過で 429 を返す
- [ ] invoice.paid で新しい billing_period が始まり、カウントがリセットされる

### Phase C: 管理者セットアップ画面
- [ ] /admin/ 内に管理者専用のクライアント管理UIがある（role=admin のみ表示）
- [ ] クライアントの新規登録（名前、メール、プラン、リポジトリパス）ができる
- [ ] 登録済みクライアント一覧が表示される
- [ ] クライアントのプラン変更、リポジトリパス変更ができる
- [ ] クライアントの利用状況（今月のジョブ数/上限）が表示される

### Phase D: ブログ MVP
- [ ] Vibe に「ブログ書いて」と伝えるとインテント判定で blog ルートに入る
- [ ] Claude API (Sonnet) で記事ドラフトが生成される（CF Workers で完結）
- [ ] Tiptap エディタで記事を編集できる
- [ ] 記事が D1 の blog_posts テーブルに保存される（タイトル、本文HTML、ステータス）
- [ ] blog.client-domain.com でサブドメイン配信される（CF Workers + Cloudflare for SaaS）
- [ ] 記事の一覧表示、公開/非公開切り替えができる

### Phase E: ジョブランナー強化
- [ ] server/index.ts の Map/Array が Bun SQLite に置き換わっている
- [ ] サーバー再起動後もジョブと履歴が永続化されている
- [ ] ジョブキューで最大3並列実行ができる
- [ ] getRepoPath() が D1 の clients テーブルから repo_path を取得する

## Technical Context

### 現行アーキテクチャ
- フロントエンド: 静的 HTML/CSS/JS（バニラ、フレームワークなし）
- ホスティング: Cloudflare Pages + Pages Functions
- 認証: Cloudflare Access (OTP メール)
- 音声入力: OpenAI Whisper API
- 音声出力: OpenAI TTS API (alloy, speed 1.25)
- 雑談: GPT-4o-mini
- インテント判定: GPT-4o-mini (temperature: 0)
- コード変更: Claude Code CLI (Sonnet 4.6) on Mac mini
- ジョブランナー: Bun + Hono (Mac mini, launchd)
- 外部公開: Tailscale Funnel
- データ: 全てインメモリ（永続化なし）

### 新規採用技術
| 技術 | 用途 | 選定理由 |
|------|------|---------|
| Cloudflare D1 | メインDB | CF Pages ネイティブ、$0、SQL対応 |
| Bun SQLite | ジョブランナー補助DB | Mac mini ローカル、追加コスト0 |
| Tiptap | ブログエディタ | Vanilla JS対応、AI統合最適、OSS |
| Claude API (Sonnet) | ブログ記事生成 | 品質高、CF Workers から直接呼出 |
| Stripe Billing | サブスク課金 | 既存アカウントあり、日本対応 |
| Cloudflare for SaaS | ブログカスタムドメイン | 100ドメインまで無料 |

### D1 スキーマ（全Phase統合）
```sql
-- クライアント管理
CREATE TABLE clients (
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
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  role TEXT NOT NULL DEFAULT 'client',
  display_name TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- 利用量
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(id),
  action TEXT NOT NULL,
  job_id TEXT,
  billing_period TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

-- ブログ記事
CREATE TABLE blog_posts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(client_id, slug)
);

-- ジョブ履歴（D1版、server側のBun SQLiteとは別）
CREATE TABLE job_history (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  message TEXT NOT NULL,
  commit_hash TEXT,
  diff TEXT,
  result TEXT,
  approved_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### コスト見積もり（20-30社時点）
| 項目 | 月額 |
|------|------|
| Cloudflare Pages + D1 | $0 (無料枠内) |
| Cloudflare Access | $0 (50人まで無料) |
| Cloudflare for SaaS | $0 (100ドメインまで) |
| OpenAI API (Whisper+TTS+Chat) | ~$10-30 |
| Claude API (コード変更+ブログ生成) | ~$20-50 |
| Stripe 手数料 | 3.6% + ¥30/取引 |
| Mac mini | $0 (既存資産) |
| **合計** | **~$30-80/月 + Stripe手数料**

### 料金プラン（2026-04-02 再設計）

**コンセプト変更**: Web接客+Chatta標準 → AI管理画面「Vibe」中心、Chatta/ブログはオプション化

詳細は `docs/PRICING-PLAN-2026-04.md` を参照。

**ベースプラン（月額）:**
- Light ¥5,500（AI更新月3回）/ Standard ¥11,000（月10回）/ Premium ¥33,000（月30回）

**制作費（段階制）:**
- Light ¥55,000 / Standard ¥110,000 / Premium ¥220,000

**オプション:**
- Chatta: +¥3,300（Light, Haiku 4.5）/ +¥8,800（Pro, Sonnet 4.6選択可）
- ブログ: +¥3,300（Light, 月5本）/ +¥5,500（Pro, 月15本） |

## Trace Findings

### Lane 1: 認証・マルチテナント
- CF Access + D1 ハイブリッドが最適（50人まで$0）
- Phase 1: JWT検証 + D1マッピング → Phase 2: 独立ログイン（50人超過時）
- CF Access の `CF_Authorization` Cookie から email 取得可能
- D1 に `_middleware.js` でアクセス可能

### Lane 2: データ・ブログ配信
- D1（メイン）+ Bun SQLite（ジョブランナー補助）のハイブリッド推奨
- ブログ配信: サブドメイン型（SEO最良）+ 将来のJSウィジェット
- エディタ: Tiptap（Vanilla JS対応、AI統合最適、OSS無料）
- Cloudflare for SaaS で CNAME ベースのカスタムドメイン

### Lane 3: スケーリング・課金
- ハイブリッド: テキスト系→CF Workers、コード変更→Mac mini
- Stripe既存アカウント活用、3プラン定額+利用回数制限
- D1で利用量カウント、billing_periodベースで月次リセット
- Agent SDK (v0.2.x) は安定したらCLIから移行

## Implementation Phases

| Phase | 内容 | 見積もり |
|-------|------|---------|
| A | マルチテナント基盤（D1 + JWT認証 + ロール分離） | 3-5日 |
| B | 課金基盤（Stripe + 利用回数カウント） | 3-5日 |
| C | 管理者セットアップ画面 | 3-5日 |
| D | ブログMVP（記事生成 + Tiptap + サブドメイン配信） | 1-2週間 |
| E | ジョブランナー強化（SQLite + キュー + 並列化） | 3-5日 |

## Interview Transcript

1. **画面構成**: 同一アプリ内でロール切替（/admin/ 内で role に応じて表示分岐）
2. **ブログ範囲**: MVP（Vibe生成 + Tiptap編集 + サブドメイン配信）、JSウィジェットは後回し
3. **クライアント数**: 半年で 20-30社
4. **AIモデル**: ブログ記事生成は Claude API (Sonnet)、CF Workers で完結
5. **実装順序**: A→B→C→D→E の段階的実装
