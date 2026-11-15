#!/usr/bin/env bash
# Point a Telegram bot at the Cloudflare Worker.
# Run from a Terminal on your Mac:   bash scripts/connect-bot.sh
#
# Works for the test bot now and for the real bot later. It never prints the token. It will:
#   1. ask for the bot token (hidden input) and check it with Telegram
#   2. store it in Cloudflare as TELEGRAM_BOT_TOKEN (the Worker then talks as this bot)
#   3. set the bot's webhook to <Worker URL>/api/webhook with the webhook secret
#   4. show Telegram's webhook status
# Setting the webhook moves the bot's messages away from wherever they went before (e.g. Vercel).

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.cloudflare ] || { echo "Missing .env.cloudflare. Run scripts/deploy-cloudflare.sh first."; exit 1; }
WORKER_URL="$(grep -E '^WORKER_URL=' .env.cloudflare | cut -d= -f2-)"
WEBHOOK_SECRET="$(grep -E '^TELEGRAM_WEBHOOK_SECRET=' .env.cloudflare | cut -d= -f2-)"
[ -n "$WORKER_URL" ] && [ -n "$WEBHOOK_SECRET" ] || { echo ".env.cloudflare is incomplete."; exit 1; }

tg() { # method, [form fields...]   token goes through curl's stdin config, never the command line
  local method="$1"; shift
  printf 'url = "https://api.telegram.org/bot%s/%s"\n' "$BOT_TOKEN" "$method" | curl -sS -m 30 -K - "$@"
}

read -r -s -p "Paste the bot token from @BotFather (hidden, then Enter): " BOT_TOKEN; echo
[ -n "$BOT_TOKEN" ] || { echo "No token entered."; exit 1; }

echo "== 1/4  Checking the token"
ME="$(tg getMe)"
echo "$ME" | grep -q '"ok":true' || { echo "Telegram rejected the token: $ME"; exit 1; }
echo "   Bot: @$(echo "$ME" | sed -E 's/.*"username":"([^"]+)".*/\1/')"

echo "== 2/4  Storing the token in Cloudflare"
printf '%s' "$BOT_TOKEN" | npx wrangler secret put TELEGRAM_BOT_TOKEN >/dev/null
echo "   set TELEGRAM_BOT_TOKEN"

echo "== 3/4  Setting the webhook to $WORKER_URL/api/webhook"
tg setWebhook --data-urlencode "url=$WORKER_URL/api/webhook" --data-urlencode "secret_token=$WEBHOOK_SECRET"; echo

echo "== 4/4  Webhook status"
tg getWebhookInfo; echo
unset BOT_TOKEN
echo
echo "Done. Open the bot in Telegram and send /start. Then tell Claude what happened."
