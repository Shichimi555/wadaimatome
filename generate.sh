#!/bin/bash
# トレンド記事を生成・公開して push する。cron から毎時実行する想定。
#
# 2026-09-04 に GitHub Actions から移設した。Actions の schedule は毎時のはずが
# 1日2〜9回しか発火せず（:00 と :30 は最も混雑する分）、速報が数時間遅れていた。
# ワークフローは workflow_dispatch 用に残してある（手動実行の逃げ道）。
#
# cron は環境変数をほとんど引き継がないので、ここで揃える。
set -u

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
# このホストの既定は Node 18 で、Astro 7 / vitest 4 が動かない。
# 既定は他のプロジェクトが使っているので変えず、ここでだけ 22 に切り替える。
nvm use 22 >/dev/null || exit 1

cd "$(dirname "$0")" || exit 1

# GEMINI_API_KEY と DISCORD_WEBHOOK_URL。.gitignore 済み。
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# generate.ts は自分の失敗を Discord に流すが、その手前と後ろ（git 操作）で
# 転ぶと誰も気づかない。ログを読みに行かないと分からない失敗を作らない。
abort() {
  echo "[ERROR] $1"
  if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
    printf '%s' "⚠️ 記事生成 (lwyse): $1" \
      | python3 -c 'import json,sys; print(json.dumps({"content": sys.stdin.read()}))' \
      | curl -sS -m 15 -H 'Content-Type: application/json' -d @- "$DISCORD_WEBHOOK_URL" >/dev/null \
      || echo "[WARN] Discord への通知にも失敗しました"
  fi
  exit 1
}

# ログが太りすぎたら1世代だけ回す（logrotate は sudo が要るのでここで済ませる）
LOG="$PWD/generate.log"
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 10485760 ]; then
  mv -f "$LOG" "$LOG.1"
fi

echo "--- $(date '+%Y-%m-%d %H:%M:%S %Z') ---"

# 手元の記事を最新にしてから重複判定する。取り込めないまま生成すると、
# 既出のトレンドをもう一度書いてしまう。
git pull --ff-only --quiet \
  || abort "git pull に失敗しました。履歴が分岐している可能性があります（GitHub 上で記事を編集した場合など）。生成は中止しました。"

# 依存は lockfile が変わったときだけ入れ直す（毎時 npm install は無駄）。
STAMP=.git/npm-install-stamp
if [ ! -f "$STAMP" ] || [ package-lock.json -nt "$STAMP" ]; then
  echo "[INFO] installing dependencies"
  npm install --no-audit --no-fund || abort "npm install に失敗しました。"
  touch "$STAMP"
fi

# 失敗時の通知は generate.ts 側が出すので、ここでは黙って終わる。
npm run generate || exit 1

git add src/content/articles/
if git diff --staged --quiet; then
  echo "[INFO] No new articles"
  exit 0
fi

git commit -q -m "chore: auto-generate trending articles $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  || abort "git commit に失敗しました。"

# コミットは残す。push だけ落ちたなら次回の実行がまとめて押し上げる。
# ここで巻き戻すと、公開通知を出した記事が消える。
git push --quiet || abort "git push に失敗しました。記事はローカルにコミット済みで、次回の実行で再送を試みます。"
echo "[INFO] Pushed"
