# SiteVibe Agent Console 実装計画

> コンセプト: 「話しかけるだけでサイトが変わる、機能が増える」
> エージェント名: **Vibe（バイブ）** — 音波から生まれたAIアシスタント

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────┐
│  クライアントのブラウザ                                │
│  sitevibe-web.com/admin/                            │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Vibe Agent Console                         │    │
│  │  - 🎤 音声入力 (MediaRecorder → Whisper)    │    │
│  │  - 🔊 音声応答 (TTS)                        │    │
│  │  - 💬 テキストチャット (補助)                │    │
│  │  - 🎭 Vibe キャラクターアニメーション        │    │
│  │  - 📋 変更プレビュー / 承認 UI              │    │
│  └──────────┬──────────────────────────────────┘    │
│             │                                       │
└─────────────┼───────────────────────────────────────┘
              │ HTTPS
┌─────────────┼───────────────────────────────────────┐
│  Cloudflare │ Edge                                  │
│             │                                       │
│  [Cloudflare Access] ← OTPメール認証で /admin/* 保護 │
│             │                                       │
│  [Pages Functions]                                  │
│  ├─ /api/transcribe  → OpenAI Whisper API プロキシ  │
│  ├─ /api/speech      → OpenAI TTS API プロキシ      │
│  └─ /api/agent       → i-Style サーバーへ転送       │
│             │                                       │
└─────────────┼───────────────────────────────────────┘
              │ HTTPS (Tailscale Funnel)
┌─────────────┼───────────────────────────────────────┐
│  i-Style 管理サーバー (Mac mini M4)                  │
│                                                     │
│  [ジョブランナー API] (Hono / Express)               │
│  ├─ リクエスト受信 → キュー管理                      │
│  ├─ Claude Code CLI 呼び出し                        │
│  │   claude --print --permission-mode bypass \      │
│  │     --project-dir ~/repos/client-x/ "タスク"     │
│  ├─ ガードレール（システムプロンプト + CLAUDE.md）    │
│  ├─ 結果（git diff）を返却                          │
│  └─ Tailscale Funnel で外部公開                     │
│             │                                       │
│  [Git Push] → GitHub → Cloudflare Pages 自動デプロイ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 旧案（OpenClaw）からの変更理由
- OpenClaw は個人用 AI アシスタント基盤で、マルチテナントに非対応
- 実運用で固まる・不安定になるリスクがある
- coding-agent の本質は Claude Code CLI の呼び出し → 直接呼ぶ方がシンプルで安定
- 管理画面 UI は自前で作るため、OpenClaw のチャンネル機能は不要

## Vibe キャラクター設計

### プロフィール
- **名前**: Vibe（バイブ）
- **ビジュアル**: 丸い球体 + 音波の触角（SVG、#077BDC グラデーション）
- **性格**: テンション高めだけどタスクは正確。いい意味でふざけてる後輩エンジニア
- **一人称**: 「バイブ」
- **口調**: 「〜っすね！」「おまかせっす！」「できましたよ〜！」

### 表情パターン（5種）
| 状態 | 表情 | セリフ例 |
|------|------|---------|
| 待機 | `(◕‿◕)` のんびり | 「なんか用っすか〜？」 |
| 聞いてる | `(◕ᴗ◕)` 集中 | 「ふむふむ...」 |
| 作業中 | `(◕‿◕)⚡` がんばり | 「うりゃ！やってますよ〜」 |
| 完了 | `(◕▽◕)✨` ドヤ顔 | 「どやっ！見てください！」 |
| エラー | `(×_×)` ごめん | 「ぐはっ...も一回やりますね！」 |

### アニメーション演出
| 状態 | アニメーション |
|------|-------------|
| 待機中 | ゆらゆら浮遊 + ゆっくり瞬き |
| 聞いてる | 触角がビートに合わせて振動 + 体が膨らむ |
| 考え中 | ぐるぐる回転 + 目がキョロキョロ |
| 作業中 | 体からコード片が飛び散る + キーボード叩きモーション |
| 完了 | ジャンプ + 紙吹雪エフェクト |
| エラー | 一瞬固まる → 起き上がり復活アニメーション |

## ガードレール設計

### 許可する操作（ホワイトリスト）

| カテゴリ | 具体例 |
|---------|--------|
| コンテンツ編集 | テキスト変更、画像差し替え、セクション追加/並べ替え |
| スタイル調整 | カラー変更、フォント変更、レイアウト微調整 |
| 軽量機能追加 | Googleマップ埋め込み、SNSリンク、FAQ項目追加 |
| SEO対応 | meta タグ編集、OGP 設定、alt テキスト追加 |
| 運用タスク | ブログ記事追加、お知らせ更新、営業時間変更 |

### ブロックする操作（ブラックリスト）

| カテゴリ | 理由 |
|---------|------|
| フレームワーク/インフラ変更 | サイト構造が壊れるリスク |
| 外部API連携の新規追加 | セキュリティ・コスト影響 |
| 認証/決済系の変更 | 高リスク |
| 他クライアントのリポジトリ操作 | 権限逸脱 |
| ファイル削除（主要ファイル） | 復旧困難 |

### 実装方法（3層防御）

1. **システムプロンプト（CLAUDE.md）** — 変更スコープを明記、禁止操作をリスト化
2. **技術的制限** — `--allowedTools` で使用可能ツールを制限、Docker サンドボックス
3. **承認フロー（Phase 5）** — git diff プレビュー → 管理者承認 → デプロイ
4. **プラン別上限** — Light: 月3回 / Standard: 月10回 / Premium: 無制限

---

## Phase 1: 管理画面 UI + Vibe キャラクター

> 目標: /admin/ に Vibe が住む音声メインのチャット UI を構築。バックエンド未接続のモック状態。

### タスク

1. **ディレクトリ作成**
   - `admin/index.html` — メインページ
   - `admin/css/admin.css` — 管理画面専用スタイル（ダークテーマ）
   - `admin/js/admin.js` — メインスクリプト（チャット、状態管理）
   - `admin/js/vibe.js` — Vibe キャラクター描画 + アニメーション
   - `admin/js/audio.js` — 音声録音/再生モジュール（Phase 2 で実装、Phase 1 はスタブ）

2. **HTML 構造**
   ```
   admin/index.html
   ├─ ヘッダー（Vibe ロゴ + 接続ステータスインジケーター）
   ├─ メインエリア
   │   ├─ Vibe キャラクター（SVG、中央上部、大きめ表示）
   │   ├─ Vibe のセリフ吹き出し
   │   ├─ チャット履歴（スクロール、Vibe アバター付き）
   │   └─ 🎤 マイクボタン（大きな円形、中央、Vibe の下）
   └─ フッター: テキスト入力バー（補助的、小さめ）
   ```

3. **Vibe SVG キャラクター（`admin/js/vibe.js`）**
   - SVG で描画（丸い体 + 音波触角 + 表情パーツ）
   - 5つの表情を CSS class 切り替えで実現
   - 浮遊アニメーション（CSS `@keyframes`）
   - 状態変更メソッド: `vibe.setState('listening' | 'thinking' | 'working' | 'done' | 'error' | 'idle')`

4. **マイクボタン UI**
   - 大きな円形（直径 100px）、Vibe のカラー（#077BDC）
   - タップで「録音中」状態 → パルスアニメーション（呼吸光）
   - 再タップで停止
   - Phase 1 では実際の録音はしない（状態切り替えのみ）

5. **チャット UI（補助）**
   - 画面下部にテキスト入力バー
   - Enter で送信 → チャット履歴に追加
   - ユーザー: 右寄せ / Vibe: 左寄せ + ミニアバター

6. **モック動作**
   - マイクボタン押下 → Vibe が「聞いてる」表情に → 3秒後に自動停止
   - ダミーテキスト表示:「お客様の声セクションを追加して」
   - Vibe が「作業中」→「完了」の流れをアニメーション付きで表示
   - テキスト入力も同様のモックフロー
   - セリフはランダムバリエーション（3-5パターン/状態）

7. **デザイン**
   - ダークテーマ: `--c-bg-dark: #102A43` ベース
   - SiteVibe 既存の CSS 変数を `admin.css` 内で上書き/拡張
   - Vibe のグロー効果（box-shadow で発光感）
   - レスポンシブ: スマホでも Vibe + マイクが中心に

### コピー元パターン
- HTML テンプレート: `direction/index.html` の構造
- CSS 変数: `css/style.css` 1-74行目
- ボタンスタイル: `css/style.css` 141-195行目

### 検証
- [ ] `/admin/` でページが表示される
- [ ] Vibe キャラクターが描画され、浮遊アニメーションしている
- [ ] マイクボタンのパルスアニメーションが動作する
- [ ] モックのチャットフロー（依頼→作業中→完了）が動く
- [ ] Vibe の表情が状態に応じて切り替わる
- [ ] セリフ吹き出しが表示される
- [ ] スマホレイアウトが崩れない
- [ ] 既存の LP（`/`）に影響がない

### アンチパターン
- React/Vue 等のフレームワークを導入しない（バニラ JS）
- npm/ビルドツールを追加しない
- 既存の `css/style.css` を変更しない（`admin.css` で独立）
- Canvas ではなく SVG + CSS アニメーションで実装（軽量）

---

## Phase 2: 音声入出力（Whisper + TTS）

> 目標: マイクで話した内容が文字起こしされ、Vibe が音声で返答する。

### 前提知識

- Whisper API: `POST /v1/audio/transcriptions`, multipart/form-data, model=whisper-1, $0.006/分
- TTS API: `POST /v1/audio/speech`, JSON body, model=tts-1, voice=alloy, $0.015/1K文字
- ブラウザ MediaRecorder の `audio/webm` を Whisper が直接受付
- **API キーはフロントに置かない** → Cloudflare Pages Functions でプロキシ

### タスク

1. **Pages Functions プロキシ**
   - `functions/api/transcribe.js` — Whisper プロキシ（multipart 転送、25MB 上限チェック）
   - `functions/api/speech.js` — TTS プロキシ（JSON 転送、4096文字上限チェック）
   - 環境変数 `OPENAI_API_KEY` から認証

2. **音声録音（`admin/js/audio.js`）**
   - `getUserMedia({ audio: true })` → MediaRecorder
   - mimeType: `audio/webm;codecs=opus`（Safari は `audio/mp4` フォールバック）
   - 録音停止 → Blob → `/api/transcribe` に POST → テキスト取得

3. **音声再生**
   - Vibe の応答テキスト → `/api/speech` に POST → Blob → `new Audio()` 再生
   - 再生中は Vibe が「話してる」アニメーション

4. **波形アニメーション**
   - `AudioContext` + `AnalyserNode` で周波数データ取得
   - Vibe の触角を波形に連動させる（CSS transform で動的変形）

5. **TTS 音声の選定**
   - 日本語で自然な voice を選定テスト
   - Vibe のキャラに合う声（明るめ、テンション高め）

6. **環境変数**
   - Cloudflare Pages: `OPENAI_API_KEY` 設定
   - ローカル: `.dev.vars`（`.gitignore` 済み）

### 検証
- [ ] マイクボタン → ブラウザ許可 → 日本語文字起こし成功
- [ ] Vibe の応答が音声で再生される
- [ ] 触角が音声に連動して動く
- [ ] Safari でも動作する
- [ ] ソースに API キーが含まれていない

---

## Phase 3: Claude Code CLI 連携（コア機能）

> 目標: 管理画面からの依頼で、Claude Code が実際にサイトのコードを変更する。

### アーキテクチャ

OpenClaw を使わず、シンプルなジョブランナーで Claude Code CLI を直接呼び出す。

```
管理画面 → /api/agent → ジョブランナー API → Claude Code CLI
                                              ↓
                                        git diff 返却
                                              ↓
                                   管理者が承認 → git push → デプロイ
```

### タスク

1. **ジョブランナー API（Mac mini）**
   - Hono (Bun) or Express で軽量 HTTP サーバー
   - `POST /jobs` — タスク受付、キューに追加
   - `GET /jobs/:id` — 状態確認（pending / running / done / error）
   - `GET /jobs/:id/diff` — 完了後の git diff 取得
   - `POST /jobs/:id/approve` — 承認 → git commit + push
   - `POST /jobs/:id/reject` — 却下 → git reset
   - 同時実行制御（1クライアント = 1ジョブまで）
   - Bearer トークン認証

2. **Claude Code CLI 呼び出し**
   ```bash
   claude --print \
     --permission-mode bypassPermissions \
     --project-dir ~/repos/client-x/ \
     --system-prompt "$(cat ~/repos/client-x/AGENT.md)" \
     "ユーザーの依頼テキスト"
   ```
   - 実行前に `git stash` で未コミット変更を退避
   - 実行後に `git diff` を取得して結果に含める
   - タイムアウト: 120秒

3. **ガードレール（AGENT.md テンプレート）**
   ```markdown
   # SiteVibe Agent ガードレール
   
   あなたは「バイブ」です。クライアントのWebサイトを改修するAIアシスタントです。
   
   ## 許可される操作
   - HTML/CSS/JS ファイルの編集
   - 画像ファイルの追加（images/ ディレクトリのみ）
   - テキスト・スタイルの変更
   - セクションの追加・削除・並べ替え
   
   ## 禁止される操作（絶対に実行しないこと）
   - ファイルの削除（rm コマンド禁止）
   - .env, .git/, node_modules/ への操作
   - 外部APIの新規追加
   - git push, git reset --hard 等の破壊的操作
   - admin/ ディレクトリの変更
   
   ## 応答スタイル
   - 変更内容を簡潔に説明する
   - 変更したファイル名を列挙する
   ```

4. **Pages Functions — ジョブランナープロキシ**
   - `functions/api/agent.js` — ジョブランナー API への転送
   - 認証ユーザーのメール → クライアント ID → ジョブランナーに送信

5. **フロントエンド連携**
   - 依頼送信 → Vibe「作業中」アニメーション
   - ポーリング（3秒間隔）で状態確認
   - 完了 → diff 表示 + Vibe「完了！」演出
   - エラー → Vibe「ごめん」演出 + エラー内容表示

6. **Tailscale Funnel 設定**
   - Mac mini のジョブランナーを HTTPS で外部公開
   - `tailscale funnel 3000` 等

### 検証
- [ ] 「ページタイトルを変更して」→ 実際に HTML が変更される
- [ ] git diff が管理画面に表示される
- [ ] 禁止操作がブロックされる
- [ ] 承認 → GitHub push → Cloudflare Pages デプロイ
- [ ] 却下 → 変更が破棄される
- [ ] タイムアウト時に適切なエラー表示

---

## Phase 4: Cloudflare Access 認証

> 目標: /admin/ パスを認証で保護。

### タスク

1. **Cloudflare Access Application 作成**
   - Cloudflare One ダッシュボード → Self-hosted app
   - Domain: `sitevibe-web.com`, Path: `admin`
   - IdP: One-time PIN（OTPメール）
   - Session: 24 hours

2. **Access Policy**: 管理者メールアドレスのみ Allow

3. **Pages Functions JWT 検証（二重防御）**
   - `functions/admin/_middleware.js` で `CF_Authorization` 検証
   - API にも `Cf-Access-Authenticated-User-Email` チェック追加

4. **マルチクライアント準備**
   - メールアドレス → クライアント ID マッピング（KV or 環境変数）
   - クライアント ID → リポジトリパス対応

### 検証
- [ ] 未認証 → ログインページリダイレクト
- [ ] OTP 認証成功 → 管理画面アクセス可
- [ ] 未登録メール → 拒否
- [ ] API 直接アクセス → 401

---

## Phase 5: 変更承認フローと履歴

> 目標: 安全なデプロイパイプライン。

### タスク

1. **diff プレビュー UI** — シンタックスハイライト付き差分表示
2. **承認/却下/修正依頼** ボタン
3. **変更履歴一覧** — 過去のリクエスト、diff、タイムスタンプ
4. **ロールバック機能** — 特定コミットに戻す
5. **通知** — 完了時に Vibe が「デプロイ完了っす！」+ TTS

---

## Phase 6: LP 更新（新コンセプト訴求）

> 目標: SiteVibe の LP を新コンセプトに更新。

### タスク

1. **ヒーロー刷新** — 「話しかけるだけでサイトが変わる」+ Vibe のアニメーション
2. **新セクション** — 「管理画面がAIになる」WordPress 比較 + デモ動画
3. **料金プラン更新** — エージェント利用回数をプラン別に明記
4. **FAQ 追加** — よくある質問 3-5 問

---

## 実行順序

```
Phase 1 (UI + Vibe)    ← 今ここ。デモ可能な管理画面を作る
    ↓
Phase 2 (音声)         ← Whisper + TTS で音声が動くデモ
    ↓
Phase 3 (Claude Code)  ← 核心。実際にサイトが変わる
    ↓
Phase 4 (認証)         ← セキュリティ確保
    ↓
Phase 5 (承認フロー)   ← 安全なデプロイパイプライン
    ↓
Phase 6 (LP更新)       ← 新コンセプトで集客
```

## コスト見積もり（月額・テスト段階）

| 項目 | コスト |
|------|--------|
| OpenAI Whisper（1日10回 × 30秒） | $0.90 |
| OpenAI TTS（1日10回 × 200文字） | $0.90 |
| Anthropic Claude API（Claude Code CLI） | 従量課金 |
| Cloudflare Access | 無料（50人まで） |
| Cloudflare Pages | 無料 |
| Tailscale Funnel | 無料 |
| **合計（API除く）** | **約 $2/月** |
