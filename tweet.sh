#!/bin/bash
# 速報記事を X (@wadaiimatome) に投稿する。cron から毎時実行する想定。
#
# 記事の生成・公開は GitHub Actions 側で走っているので、投稿対象を決める前に
# git pull で最新の記事を取り込む。投稿先の選定と件数制限は scripts/tweet.ts。
#
# cron は環境変数をほとんど引き継がないので、ここで揃える。
set -u

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
# このホストの既定は Node 18 で、Astro 7 / vitest 4 が動かない。
# 既定は他のプロジェクトが使っているので変えず、ここでだけ 22 に切り替える。
nvm use 22 >/dev/null || exit 1

# playwright 1.58 は ubuntu26.04 を知らず 24.04 向けビルドで動かす
# (popular-videos-ranking の tweet.sh と同じ理由)。
# ブラウザは chromium を使う。firefox は contenteditable への日本語入力が通らない。
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64

cd "$(dirname "$0")" || exit 1

export X_COOKIE_PATH="${X_COOKIE_PATH:-$PWD/twitter_cookies.txt}"

# ログが太りすぎたら1世代だけ回す（logrotate は sudo が要るのでここで済ませる）
LOG="$PWD/tweet.log"
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 10485760 ]; then
  mv -f "$LOG" "$LOG.1"
fi

echo "--- $(date '+%Y-%m-%d %H:%M:%S %Z') ---"

# 公開済み記事は Actions が push してくるので取り込む。失敗しても
# 手元のコピーで投稿は続ける（投稿が1周期遅れるだけ）。
git pull --ff-only --quiet || echo "[WARN] git pull failed, using the working copy"

exec npm run tweet
