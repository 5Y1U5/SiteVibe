#!/bin/bash
# Claude Code CLI ラッパー
# Usage: run-claude.sh <repo_path> <message>

REPO_PATH="$1"
MESSAGE="$2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_MD="$SCRIPT_DIR/AGENT.md"

cd "$REPO_PATH" || exit 1

claude -p \
  --dangerously-skip-permissions \
  --model sonnet \
  --append-system-prompt-file "$AGENT_MD" \
  "$MESSAGE" < /dev/null
