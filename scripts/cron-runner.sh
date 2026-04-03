#!/bin/bash
# SiteVibe Cron Runner — 予約公開 + 解約処理
# launchd で5分間隔実行

SITE_URL="${SITEVIBE_URL:-https://sitevibe-web.com}"
TOKEN="${SITEVIBE_CRON_TOKEN:-$(grep JOB_RUNNER_TOKEN /Users/takahashiyuuki/01_開発/01_自社プロダクト/SiteVibe/server/.env 2>/dev/null | cut -d= -f2)}"

if [ -z "$TOKEN" ]; then
  echo "$(date): ERROR - SITEVIBE_CRON_TOKEN not set" >> /tmp/sitevibe-cron.log
  exit 1
fi

# ブログ予約公開チェック
curl -s -o /dev/null -w "%{http_code}" "${SITE_URL}/api/blog-cron?token=${TOKEN}" >> /tmp/sitevibe-cron.log 2>&1
echo " blog-cron $(date)" >> /tmp/sitevibe-cron.log

# 解約自動処理チェック（1日1回で十分だが、冪等なので5分毎でもOK）
curl -s -o /dev/null -w "%{http_code}" "${SITE_URL}/api/cancel-cron?token=${TOKEN}" >> /tmp/sitevibe-cron.log 2>&1
echo " cancel-cron $(date)" >> /tmp/sitevibe-cron.log
