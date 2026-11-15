# Deploying Thai Talk Breaks on Cloudflare (Workers + Neon)

What runs where:

- **Cloudflare Worker** (`worker/index.ts`, config in `wrangler.jsonc`): the Telegram webhook, the Web App APIs, the static Web App pages and lesson media, and an **every-minute cron trigger** that delivers due lessons (this replaces the Supabase `pg_cron` + `pg_net` job).
- **Neon Postgres**: all data. Schema = `supabase/migrations/*` (minus the pg_cron one), loaded already.

## One-time setup

Easiest: in a Terminal on your Mac run `cd ~/Documents/GitHub/thai-talk-breaks && bash scripts/deploy-cloudflare.sh`. It does everything below (login, deploy, secrets, Neon check) and never prints a secret. The manual steps are listed here for reference.

1. `npm install`
2. `npx wrangler login` (opens a browser; sign in to the Cloudflare account).
3. Set the secrets (each command asks for the value; nothing goes in a file):
   ```
   npx wrangler secret put DATABASE_URL            # Neon pooled connection string
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler secret put CRON_SECRET
   npx wrangler secret put ADMIN_TELEGRAM_USER_ID  # optional, for /oops and /paysupport DMs
   ```
4. Deploy: `npm run deploy:worker`. Wrangler prints the Worker URL
   (`https://thai-talk-breaks.<your-subdomain>.workers.dev`).
5. Set `APP_URL` to that URL: `npx wrangler secret put APP_URL` (or add it under `vars` in `wrangler.jsonc`), then deploy again. The lesson, Day 29 and Day 30 buttons use it.

## Check it before switching the real bot

- Read-only database check (no learner is due, nothing is sent):
  `curl -X POST -H "x-cron-secret: <CRON_SECRET>" https://<worker-url>/api/cron/deliver`
  should answer `{"checked":1,"due":0,...}`.
- Use a **separate test bot** (new token from @BotFather) first: put its token and a new webhook secret in the secrets above, then point Telegram at the Worker:
  `curl "https://api.telegram.org/bot<TEST_TOKEN>/setWebhook" -d url=https://<worker-url>/api/webhook -d secret_token=<WEBHOOK_SECRET>`
- Live logs: `npx wrangler tail`. The cron run logs one JSON line per minute with `spentRequests`.

## Switching the real bot

Put the real bot token and webhook secret in the secrets, run `setWebhook` for the real bot with the Worker URL, send `/start` from your own account. The old Vercel deployment can be switched off afterwards.

## Free-plan limits the code is built around

- 50 outgoing requests per invocation: the cron run stops taking new learners after 36 (database, Telegram and media reads all count) and the next minute's run continues. Deliveries are guarded by a unique row, so nothing is sent twice.
- 10 ms CPU per invocation (waiting on the network is free), 100,000 requests/day, 5 cron triggers per account.
- Neon sleeps after 5 minutes idle; the first query of a run can take about a second longer.

## Local use

- `npm run build:worker` builds `./out` (static pages + `out/media`).
- `npm run dev:worker` runs the Worker locally with wrangler (secrets from a `.dev.vars` file, which is git-ignored).
- `npm test` runs the unit tests (a real in-process Postgres, no network).
