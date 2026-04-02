# SiteVibe

## 概要
「AIがあなたのサイト上で、自動で接客する時代へ。」をコンセプトにしたWeb制作サービスのLP + 診断フォーム。株式会社i-Styleのサービス。制作費55,000円（税込）で、AIチャットボット「Chatta」搭載の高品質Webサイトを7日で納品。

## 技術スタック
- フレームワーク: 静的HTML/CSS/JS（フレームワークなし）
- DB: なし（フォーム送信は今後API連携予定）
- ホスティング: Cloudflare Pages（https://sitevibe.pages.dev）
- 独自ドメイン: https://sitevibe-web.com（www.sitevibe-web.com も設定済み）
- 主要ライブラリ: なし（バニラJS）
- フォント: Inter + Noto Sans JP（Google Fonts）
- デザインカラー: #077BDC（ブルー）ベース

## ディレクトリ構成
```
SiteVibe/
├── index.html          # メインLP（10セクション構成）
├── diagnosis/
│   └── index.html      # 診断フォーム（7問 + 連絡先 + 結果）
├── direction/
│   └── index.html      # ディレクションシート（7ステップ）
├── admin/              # Vibe Agent Console（管理画面）
│   ├── index.html      # メインHTML（ダークテーマ）
│   ├── css/admin.css   # 管理画面スタイル + アニメーション
│   └── js/
│       ├── admin.js    # チャット管理、エージェント連携、プレビューパネル
│       ├── vibe.js     # Vibeキャラクター（SVG、5表情、セリフ）
│       └── audio.js    # 音声録音(MediaRecorder) + Whisper STT + TTS再生
├── css/
│   ├── style.css       # 共通スタイル（カラー変数・レイアウト・全コンポーネント）
│   ├── diagnosis.css   # 診断ページ専用スタイル
│   └── direction.css   # ディレクションページ専用スタイル
├── js/
│   ├── main.js         # LP用スクリプト（ナビ・FAQ・スクロールアニメーション）
│   ├── diagnosis.js    # 診断フォームスクリプト
│   └── direction.js    # ディレクションシートスクリプト
├── functions/api/      # Cloudflare Pages Functions
│   ├── transcribe.js   # OpenAI Whisper API プロキシ（STT）
│   ├── speech.js       # OpenAI TTS API プロキシ
│   ├── agent.js        # ジョブランナー転送プロキシ
│   └── direction.js    # ディレクションシート送信
├── server/             # ジョブランナー（Mac mini で稼働）
│   ├── index.ts        # Hono + Bun API サーバー
│   ├── run-claude.sh   # Claude Code CLI ラッパー
│   └── AGENT.md        # ガードレール（許可/禁止操作）
├── docs/               # ドキュメント
│   └── PLAN-admin-agent.md  # 実装計画書（6フェーズ）
├── images/             # 画像アセット
└── .claude/            # Claude Code 設定
```

## 開発コマンド
```bash
# 開発サーバー（ローカル確認）
npx serve .

# デプロイ（Cloudflare Pages）
# GitHub連携による自動デプロイ（main ブランチへのマージでトリガー）
```

## LPセクション構成（index.html）
1. ヒーロー — キャッチコピー + 制作費55,000円フォーカス + 3数字
2. 問題提起 — フォームの限界（送信率・返信時間・営業時間外）
3. ビフォーアフター対比 — フォーム vs AIチャット
4. Chatta紹介 — メインフィーチャー、全プラン標準搭載
5. サービスの特徴 — 6つ（7日納品/プロ品質/AI接客/スマホ/SEO/保守）
6. 制作の流れ — 3ステップ
7. 料金プラン — 制作費55,000円バナー + 3プラン
8. FAQ — 7問
9. CTA — 「まだフォームで待たせますか？」
10. フッター

## サービス内容
- コンセプト: 「話しかけるだけでサイトが変わる、機能が増える」
- 制作費: Light ¥55,000 / Standard ¥110,000 / Premium ¥220,000（税込）
- ベース3プラン:
  - Light: ¥5,500/月（最大3P、AI更新月3回、メールサポート）
  - Standard: ¥11,000/月（最大7P、AI更新月10回、チャット+メール）
  - Premium: ¥33,000/月（無制限、AI更新月30回、電話含む優先サポート）
- 超過更新: ¥1,100/回
- オプション:
  - Chatta Light: +¥3,300/月（AIチャットボット、月300対話、Haiku 4.5）
  - Chatta Pro: +¥8,800/月（月2,000対話、Sonnet 4.6選択可）
  - ブログ Light: +¥3,300/月（月5本生成、サブドメイン配信）
  - ブログ Pro: +¥5,500/月（月15本、SEO高度最適化）
- 料金設計書: docs/PRICING-PLAN-2026-04.md

## 診断フォーム（diagnosis/index.html）
- 7問構成: 業種 → 目的 → サイト有無 → ページ数 → デザイン → 問い合わせ課題（複数選択）→ 希望時期
- 推薦ロジック: ページ数 + Q6の課題数でスコアリング（score >= 6: Premium, >= 2: Standard, else: Light）
- TOTAL_QUESTIONS = 7（js/diagnosis.js）

## デザインルール
- メインカラー: #077BDC / Light: #4DA3E8 / Dark: #055DA6
- 背景: #E8F4FD / ボーダーアクセント: #90C8F0
- アイコン: stroke-width 1.5 のミニマルラインアイコン（統一感重視）
- 特徴カードのアイコン背景色は全て統一（カラフルにしない）

## Agent Console（/admin/）
- コンセプト: 「話しかけるだけでサイトが変わる、機能が増える」
- エージェント名: Vibe（バイブ）— 音波から生まれたAIアシスタント
- 音声入力（Whisper STT）メイン、テキスト入力は補助
- Claude Code CLI で実際にサイトのコードを変更
- ジョブランナー（server/）が Mac mini で稼働、Tailscale Funnel で外部公開
- 変更はプレビューパネルで確認 → 承認/却下フロー

## 環境変数
- `OPENAI_API_KEY` — Cloudflare Pages シークレット（Whisper + TTS 用）
- `JOB_RUNNER_URL` — ジョブランナーの公開URL（Tailscale Funnel）
- `JOB_RUNNER_TOKEN` — ジョブランナー認証トークン
- `RESEND_API_KEY` — メール送信用（ディレクションシート）

## 禁止事項
- main ブランチへの直接コミット（feature ブランチで PR 経由）
- .env / .dev.vars ファイルのコミット
- admin/ ディレクトリの変更をジョブランナー経由で行わない
