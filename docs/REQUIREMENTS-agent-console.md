# Vibe Agent Console 要件定義書

**最終更新:** 2026-04-02
**ステータス:** Phase 1-6 完了・本番稼働中

---

## 1. コンセプト

「話しかけるだけでサイトが変わる、機能が増える」

Web制作サービス SiteVibe の管理画面。従来の CMS（WordPress 等）をAIエージェントに置き換え、
音声またはテキストでサイト改修を依頼 → AIが実行 → プレビュー確認 → 承認/却下 のフローを実現する。

---

## 2. ユーザーストーリー

| # | ストーリー | ステータス |
|---|-----------|----------|
| U1 | クライアントが音声でサイト変更を依頼できる | 完了 |
| U2 | クライアントがテキストでサイト変更を依頼できる | 完了 |
| U3 | 雑談はAIが即座に応答し、コード変更依頼だけがClaude Codeに送られる | 完了（AI判定） |
| U4 | コード変更前にプレビューでdiff + 実際の表示を確認できる | 完了（CSS未適用バグあり） |
| U5 | 承認するとgit push → 自動デプロイされる | 完了 |
| U6 | 却下するとコード変更がロールバックされる | 完了 |
| U7 | 変更履歴を一覧でき、過去の変更を取り消せる | 完了 |
| U8 | スマホから管理画面にアクセスして操作できる | 一部完了（レスポンシブ最適化未了） |
| U9 | Cloudflare Access によるOTP認証で保護されている | 完了 |
| U10 | AIの応答を音声で読み上げる（ON/OFF切替可） | 完了 |

---

## 3. システムアーキテクチャ

```
[ブラウザ: /admin/]
    │
    ├─→ /api/intent    (GPT-4o-mini)  → "code" or "chat" 判定
    ├─→ /api/chat      (GPT-4o-mini)  → 雑談応答（1-3秒）
    ├─→ /api/transcribe(Whisper)       → 音声→テキスト
    ├─→ /api/speech    (TTS alloy)     → テキスト→音声
    ├─→ /api/agent     (プロキシ)      → ジョブランナーへ転送
    │       │
    │       └─→ [Mac mini: Tailscale Funnel]
    │               ├── POST /jobs          → Claude Code CLI 実行
    │               ├── GET  /jobs/:id      → ジョブ状態確認
    │               ├── POST /jobs/:id/approve → git commit + push
    │               ├── POST /jobs/:id/reject  → git checkout --
    │               ├── GET  /history       → 変更履歴
    │               ├── POST /history/:hash/rollback → git revert
    │               └── GET  /preview/*     → 変更後ファイル配信
    │
    └─→ /api/preview   (プロキシ)      → プレビューHTML取得 + パス書き換え
```

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | 静的 HTML/CSS/JS（フレームワークなし） |
| ホスティング | Cloudflare Pages + Pages Functions |
| 認証 | Cloudflare Access（OTPメール認証） |
| 音声入力 | OpenAI Whisper API |
| 音声出力 | OpenAI TTS API（alloy, speed 1.25） |
| 雑談チャット | OpenAI GPT-4o-mini |
| インテント判定 | OpenAI GPT-4o-mini（temperature: 0） |
| コード変更 | Claude Code CLI（Sonnet 4.6） |
| ジョブランナー | Bun + Hono（Mac mini, launchdデーモン） |
| 外部公開 | Tailscale Funnel |
| デプロイ | GitHub Actions → Cloudflare Pages |

---

## 4. API仕様

### 4.1 POST /api/intent — インテント判定

**リクエスト:**
```json
{ "message": "ユーザーのテキスト" }
```
**レスポンス:**
```json
{ "intent": "code" | "chat" }
```
**動作:** GPT-4o-mini が「サイト変更依頼（code）」か「雑談（chat）」を判定。エラー時は `chat` にフォールバック。

### 4.2 POST /api/chat — 雑談チャット

**リクエスト:**
```json
{ "message": "ユーザーのテキスト" }
```
**レスポンス:**
```json
{ "reply": "バイブの返答テキスト" }
```
**動作:** GPT-4o-mini がバイブのキャラクターで即座に応答。max_tokens: 300。

### 4.3 POST /api/transcribe — 音声文字起こし

**リクエスト:** `multipart/form-data` (`file` フィールドに音声Blob)
**レスポンス:**
```json
{ "text": "文字起こし結果" }
```
**制約:** 25MB上限、言語は日本語固定。

### 4.4 POST /api/speech — 音声読み上げ

**リクエスト:**
```json
{ "text": "読み上げテキスト", "voice": "alloy" }
```
**レスポンス:** `audio/mpeg` バイナリ
**制約:** 4096文字上限、speed 1.25x。

### 4.5 POST /api/agent — ジョブ操作

**新規ジョブ投入:**
```json
{ "message": "変更内容", "clientId": "default" }
→ { "id": "job-xxx", "status": "pending" }
```

**承認:**
```json
{ "action": "approve", "jobId": "job-xxx" }
→ { "success": true, "commit": "[Vibe] ...", "hash": "abc123" }
```

**却下:**
```json
{ "action": "reject", "jobId": "job-xxx" }
→ { "success": true }
```

**ロールバック:**
```json
{ "action": "rollback", "hash": "abc123" }
→ { "success": true, "revertedHash": "abc123", "newHash": "def456" }
```

### 4.6 GET /api/agent — ジョブ状態・履歴

**ジョブ状態:** `GET /api/agent?jobId=job-xxx`
```json
{ "id": "...", "status": "done", "result": "...", "diff": "...", "error": null }
```

**履歴:** `GET /api/agent?action=history`
```json
{ "history": [{ "message": "...", "commitHash": "...", "approvedAt": 1234567890 }] }
```

### 4.7 GET /api/preview — プレビュー表示

ジョブランナーから変更後 HTML を取得し、CSS/JS/画像パスをジョブランナーの絶対URLに書き換えて返す。

---

## 5. フロントエンド構成

### 5.1 ファイル構成

| ファイル | 役割 |
|---------|------|
| `admin/index.html` | メインHTML（ヘッダー、Vibeエリア、チャット、マイク、テキスト入力、プレビューパネル、履歴パネル） |
| `admin/css/admin.css` | ダークテーマスタイル（カスタムプロパティ、アニメーション、レスポンシブ） |
| `admin/js/admin.js` | メインロジック（インテント判定、API呼び出し、チャット管理、プレビューパネル、履歴） |
| `admin/js/vibe.js` | Vibeキャラクター（SVG生成、6状態の表情変化、セリフ、紙吹雪エフェクト） |
| `admin/js/audio.js` | 音声モジュール（MediaRecorder、Whisper STT、TTS再生、波形解析） |

### 5.2 Vibeキャラクター状態

| 状態 | トリガー | 表情 | セリフ例 |
|------|---------|------|---------|
| idle | 初期状態/処理完了後 | 笑顔 | 「なんか用っすか〜？」 |
| listening | 録音中 | 大きい目 | 「聞いてるっすよ〜」 |
| thinking | 文字起こし中/AI判定中 | 横目 | 「ふむふむ...」 |
| working | Claude Code実行中 | 集中 | 「ガリガリ書いてるっす」 |
| done | 変更完了 | 星目+紙吹雪 | 「できたっす！」 |
| error | エラー発生 | X目 | 「やらかしたっす...」 |

### 5.3 処理フロー

```
ユーザー入力（音声 or テキスト）
  ↓
チャットに表示
  ↓
/api/intent でAI判定
  ↓
[chat] → /api/chat → 即座に返答表示 → TTS読み上げ
[code] → /api/agent POST → ジョブ投入
           ↓
         3秒間隔でポーリング（最大60回=180秒）
           ↓
         完了 → diff解析 → 「変更完了！」表示
           ↓
         「プレビューを見る」ボタン → プレビューパネル表示
           ↓
         [承認] → /api/agent approve → git push → デプロイ → 紙吹雪
         [却下] → /api/agent reject → git reset → 「取り消しました」
```

### 5.4 ミニVibe（ヘッダー）

- チャットメッセージが3件以上でメインVibeが縮小、ヘッダーにミニVibeが出現
- MutationObserverでメッセージ数を監視
- メインVibeのセリフと同期

---

## 6. ジョブランナー（server/）

### 6.1 ファイル構成

| ファイル | 役割 |
|---------|------|
| `server/index.ts` | Hono APIサーバー（ジョブ管理、プレビュー配信、履歴管理） |
| `server/run-claude.sh` | Claude Code CLI ラッパー（AGENT.md付き） |
| `server/AGENT.md` | ガードレール（許可/禁止操作の定義） |
| `server/.env` | 環境変数（AGENT_API_TOKEN, PORT, DEFAULT_REPO_PATH） |

### 6.2 ジョブライフサイクル

1. **pending** — 投入直後
2. **running** — Claude Code CLI実行中（`git stash` → `run-claude.sh` → `git diff`）
3. **done** — 完了（diff取得済み、承認/却下待ち）
4. **error** — エラー（`git checkout -- .` で自動復旧）

### 6.3 ガードレール（AGENT.md）

**許可:** HTML/CSS/JS編集、画像追加、embed追加
**禁止:** `rm`、`.env`/`.git`変更、`git push`、`npm install`、`admin/`変更、外部API追加

### 6.4 デーモン化

- launchdサービス: `com.istyle.sitevibe-jobrunner.plist`
- RunAtLoad: true, KeepAlive: true
- ログ: `~/Library/Logs/sitevibe-jobrunner.log`

---

## 7. 環境変数

| 変数名 | 場所 | 用途 |
|--------|------|------|
| `OPENAI_API_KEY` | CF Pages シークレット | Whisper + TTS + Chat + Intent |
| `JOB_RUNNER_URL` | CF Pages シークレット | Tailscale Funnel URL |
| `JOB_RUNNER_TOKEN` | CF Pages シークレット | ジョブランナー認証トークン |
| `RESEND_API_KEY` | CF Pages シークレット | メール送信（ディレクションシート） |
| `AGENT_API_TOKEN` | server/.env | ジョブランナーのBearer認証トークン |
| `PORT` | server/.env | ジョブランナーポート（3100） |
| `DEFAULT_REPO_PATH` | server/.env | デフォルトリポジトリパス |

---

## 8. 既知の問題・バグ

### 8.1 クリティカル（要修正）

| # | 問題 | 詳細 | 影響 |
|---|------|------|------|
| B1 | audio.js のTTSデフォルト音声が 'nova' | `speak(text, voice = 'nova')` — speech.js側は 'alloy' だが、admin.jsがvoice引数を渡していないため audio.js のデフォルト 'nova' が使われる | 女性声になる（Vibeキャラに不一致） |
| B2 | プレビューのCSS未適用 | ジョブランナーがパスを `/preview/css/` に書き換え → preview.js が二重書き換え。順序依存で壊れる場合あり | プレビューがスタイルなし表示 |
| B3 | プレビューパネルの画像パス未対応 | `src="../images/"` パターンが preview.js で未カバー（修正済みだが server/index.ts 側は未対応） | 画像が表示されない |

### 8.2 中程度

| # | 問題 | 詳細 |
|---|------|------|
| B4 | ジョブポーリング中のフィードバック不足 | 180秒間「サイトを改修中...」のまま進捗なし |
| B5 | ジョブ/履歴がインメモリ保存 | サーバー再起動で消失 |
| B6 | server/index.ts の `commitHash` プロパティ未定義 | Job インターフェースに `commitHash` と `approvedAt` が未定義 |

### 8.3 軽微

| # | 問題 | 詳細 |
|---|------|------|
| B7 | TTS失敗が静かに無視される | `.catch(() => {})` |
| B8 | レスポンシブ最適化未了 | スマホでの操作性に課題 |
| B9 | ミニVibeの表情がメインVibeと連動しない | 静的SVGのまま |

---

## 9. 未実装機能（バックログ）

| # | 機能 | 優先度 |
|---|------|--------|
| F1 | レスポンシブ最適化（スマホファースト） | 高 |
| F2 | ミニVibeの表情連動 | 高 |
| F3 | チャットへの画像添付 | 高 |
| F4 | 対話の往復対応（Vibeが質問を返す） | 中 |
| F5 | マルチクライアント対応 | 中 |
| F6 | 利用回数カウント（プラン別制限） | 中 |
| F7 | TTS voice 最適化 | 低 |
| F8 | Cloudflare Access ログインページカスタマイズ | 低 |
