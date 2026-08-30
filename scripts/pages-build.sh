#!/usr/bin/env bash
# Cloudflare Pages へアップロードする「公開してよいファイルだけ」を _site に集める。
#
# なぜ要るか:
#   CI が `pages deploy .` でリポジトリ直下をそのまま上げていたため、
#   2026-08-30 の監査で CLAUDE.md / docs/ / .claude/ / .omc/plans/ / wrangler.toml が
#   sitevibe-web.com から読める状態になっていた。
#   ローカルから手で deploy した場合は .dev.vars まで上がる経路でもあった。
#
# 方針: denylist だと内部フォルダを新しく足したときに漏れる。allowlist で集める。
set -euo pipefail

OUT="_site"
rm -rf "$OUT"
mkdir -p "$OUT"

for f in *.html _headers _redirects favicon.ico robots.txt sitemap.xml llms.txt; do
  [ -e "$f" ] && cp "$f" "$OUT/"
done

# functions/ は Pages Functions の実体。
for d in css js images assets admin apply blog diagnosis direction functions; do
  [ -d "$d" ] && cp -R "$d" "$OUT/"
done

find "$OUT" \( \
  -name '*.md' -o -name '*.sh' -o -name '*.yml' -o -name '*.yaml' \
  -o -name '*.sql' -o -name '.env' -o -name '.env.*' -o -name '.dev.vars' \
  -o -name '.DS_Store' \
\) -type f -delete
find "$OUT" -type d -empty -delete

echo "---- 配信対象 ----"
find "$OUT" -type f | wc -l
echo "---- 内部ファイルの残り（0 件であること） ----"
find "$OUT" \( -name '*.md' -o -name '*.sh' -o -name '*.sql' -o -name '.dev.vars' \) -type f | wc -l

# 2026-08-30 の事故対応。
#    Cloudflare Pages はファイルを消しても、以前に配信された URL の内容を
#    自分のキャッシュ層に s-maxage=604800（7日）保持し続ける。デプロイし直しても消えない。
#    同じパスに中身のあるファイルを置き直すとキャッシュが差し替わるので、
#    露出していたパスに「公開対象ではありません」の1行を置いて上書きする。
#    2026-09-06 を過ぎたらこのブロックと scripts/cache-stubs.txt を削除してよい。
if [ -f scripts/cache-stubs.txt ]; then
  while IFS= read -r stub; do
    [ -z "$stub" ] && continue
    mkdir -p "$OUT/$(dirname "$stub")"
    printf 'このパスは公開対象ではありません。\n' > "$OUT/$stub"
  done < scripts/cache-stubs.txt
  echo "---- キャッシュ上書き用のスタブ ----"
  wc -l < scripts/cache-stubs.txt
fi
