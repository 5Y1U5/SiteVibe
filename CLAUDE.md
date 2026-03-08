# SiteVibe

## 概要
Vibe CodingによるWeb制作サブスクリプションサービスのLP + 診断フォーム。株式会社i-Styleのサービス。

## 技術スタック
- フレームワーク: 静的HTML/CSS/JS（フレームワークなし）
- DB: なし（フォーム送信は今後API連携予定）
- ホスティング: Cloudflare Pages（予定）
- 主要ライブラリ: なし（バニラJS）

## ディレクトリ構成
```
SiteVibe/
├── index.html          # メインLP
├── diagnosis/
│   └── index.html      # 診断フォームページ
├── css/
│   ├── style.css       # 共通スタイル
│   └── diagnosis.css   # 診断ページ専用スタイル
├── js/
│   ├── main.js         # LP用スクリプト
│   └── diagnosis.js    # 診断フォームスクリプト
├── images/             # 画像アセット
├── docs/               # ドキュメント（ADR等）
└── .claude/            # Claude Code 設定
    └── skills/         # スキル定義
```

## 開発コマンド
```bash
# 開発サーバー（ローカル確認）
npx serve .

# デプロイ（Cloudflare Pages）
# GitHub連携による自動デプロイ
```

## サービス内容
- 3プラン: Light(¥10,000/月), Standard(¥20,000/月), Premium(¥50,000/月)
- Standard以上にAIチャットボット「Chatta」が付属
- Web上のヒアリングフォーム→7営業日で納品

## 禁止事項
- main ブランチへの直接コミット
- .env ファイルのコミット
