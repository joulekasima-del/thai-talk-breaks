-- Reuse Telegram's file_id for lesson pictures instead of uploading the same
-- file again on every delivery.
--
-- Telegram returns a file_id for every uploaded photo; sending that id again
-- shows the same picture without re-uploading the bytes. That keeps a delivery
-- well inside the Cloudflare Workers free plan's 10 ms CPU per run (a fresh
-- upload measured 16 ms). A file_id only works for the bot that uploaded it,
-- so the key includes the bot's numeric id (the part of the token before ":").
-- A stale or rejected id just falls back to a fresh upload, which overwrites
-- the row (see src/lib/telegram.ts).

create table telegram_file_ids (
  bot_id bigint not null,
  media_path text not null,
  file_id text not null,
  updated_at timestamptz not null default now(),
  primary key (bot_id, media_path)
);

comment on table telegram_file_ids is
  'Cache of Telegram file_ids per bot and curriculum media path (e.g. week2-images/week2_day09_female.png), so a picture is uploaded once per bot and resent by id afterwards.';

alter table telegram_file_ids enable row level security;
