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
- コンセプト: 「フォームの時代は終わった。AIが接客する時代へ。」
- 制作費: 55,000円（税込）全プラン共通
- 3プラン: Light(¥5,500/月), Standard(¥11,000/月), Premium(¥33,000/月)
- 全プランにAIチャットボット「Chatta」が標準搭載
- Web上のヒアリングフォーム→7日で納品
- 診断フォーム: 7問構成（Q6は問い合わせ対応の課題、複数選択）

## 禁止事項
- main ブランチへの直接コミット
- .env ファイルのコミット
