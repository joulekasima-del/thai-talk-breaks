#!/usr/bin/env bash
# One-time Cloudflare setup + first deploy for Thai Talk Breaks.
# Run from a Terminal on your Mac:   bash scripts/deploy-cloudflare.sh
#
# It never prints a secret. It will:
#   1. install dependencies and log in to Cloudflare (opens your browser)
#   2. deploy the Worker, which gives you its URL
#   3. store the secrets in Cloudflare:
#        DATABASE_URL            read from .env.neon
#        TELEGRAM_WEBHOOK_SECRET generated here, also saved to .env.cloudflare (git-ignored)
#        CRON_SECRET             generated here, also saved to .env.cloudflare
#        TELEGRAM_BOT_TOKEN      you paste it (hidden input), from @BotFather -> /mybots -> API Token
#        ADMIN_TELEGRAM_USER_ID  optional, press Enter to skip
#        APP_URL                 the Worker URL from step 2
#   4. check the Neon connection with a read-only call (nothing is sent to learners)
# It does NOT point your Telegram bot at the Worker. That is a separate, deliberate step.

set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n== %s\n' "$1"; }

put_secret() { # name, value  (value goes through stdin, never the command line)
  printf '%s' "$2" | npx wrangler secret put "$1" >/dev/null
  echo "   set $1"
}

say "1/4  Dependencies and Cloudflare login"
npm install --no-audit --no-fund
if ! npx wrangler whoami 2>/dev/null | grep -qi "associated with the email"; then
  npx wrangler login
fi

say "2/4  Building and deploying the Worker"
# Wrangler writes a machine-readable record of the deploy (including the URL) to this
# file, so the deploy itself keeps a normal interactive terminal (it may ask you to
# pick a workers.dev subdomain the first time: just type a name you like).
DEPLOY_LOG="$(mktemp)"
WRANGLER_OUTPUT_FILE_PATH="$DEPLOY_LOG" npm run deploy:worker
WORKER_URL="$(grep -Eo 'https://[A-Za-z0-9.-]+\.workers\.dev' "$DEPLOY_LOG" | head -1 || true)"
rm -f "$DEPLOY_LOG"
if [ -z "$WORKER_URL" ]; then
  read -r -p "Could not find the Worker URL in the output. Paste it (https://....workers.dev): " WORKER_URL
fi
echo "   Worker URL: $WORKER_URL"

say "3/4  Secrets"
[ -f .env.neon ] || { echo "Missing .env.neon"; exit 1; }
DATABASE_URL_VALUE="$(grep -E '^DATABASE_URL=' .env.neon | head -1 | cut -d= -f2-)"
[ -n "$DATABASE_URL_VALUE" ] || { echo "DATABASE_URL not found in .env.neon"; exit 1; }
put_secret DATABASE_URL "$DATABASE_URL_VALUE"

if [ -f .env.cloudflare ] && grep -q '^TELEGRAM_WEBHOOK_SECRET=' .env.cloudflare; then
  WEBHOOK_SECRET="$(grep -E '^TELEGRAM_WEBHOOK_SECRET=' .env.cloudflare | cut -d= -f2-)"
  CRON_SECRET_VALUE="$(grep -E '^CRON_SECRET=' .env.cloudflare | cut -d= -f2-)"
else
  WEBHOOK_SECRET="$(openssl rand -hex 32)"
  CRON_SECRET_VALUE="$(openssl rand -hex 32)"
  umask 077
  printf 'TELEGRAM_WEBHOOK_SECRET=%s\nCRON_SECRET=%s\nWORKER_URL=%s\n' "$WEBHOOK_SECRET" "$CRON_SECRET_VALUE" "$WORKER_URL" > .env.cloudflare
fi
put_secret TELEGRAM_WEBHOOK_SECRET "$WEBHOOK_SECRET"
put_secret CRON_SECRET "$CRON_SECRET_VALUE"
put_secret APP_URL "$WORKER_URL"

read -r -s -p "Paste the Telegram bot token (hidden, then Enter): " BOT_TOKEN; echo
[ -n "$BOT_TOKEN" ] || { echo "No token entered. Run the script again."; exit 1; }
put_secret TELEGRAM_BOT_TOKEN "$BOT_TOKEN"
unset BOT_TOKEN

read -r -p "Your own numeric Telegram user id for /oops and /paysupport alerts (Enter to skip): " ADMIN_ID
if [ -n "$ADMIN_ID" ]; then put_secret ADMIN_TELEGRAM_USER_ID "$ADMIN_ID"; fi

say "4/4  Read-only check against Neon (nothing is sent to learners)"
sleep 5
curl -sS -m 60 -X POST -H "x-cron-secret: $CRON_SECRET_VALUE" "$WORKER_URL/api/cron/deliver" || true
echo
echo
echo "Expected: {\"checked\":1,\"due\":0,\"results\":[],\"stoppedEarly\":false}"
echo "Your Telegram bot is NOT connected to this Worker yet. Tell Claude when you are ready for that step."
