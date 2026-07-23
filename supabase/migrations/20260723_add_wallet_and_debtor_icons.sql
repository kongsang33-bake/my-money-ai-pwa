-- Optional custom icon glyph + color for wallets and debtors, so users can
-- tell money buckets apart at a glance instead of relying only on an
-- auto-generated color/initial derived from the name. Both columns are
-- nullable; when unset the app falls back to the name-derived avatar.
alter table public.wallets
  add column if not exists icon text,
  add column if not exists icon_color text;

alter table public.debtors
  add column if not exists icon text,
  add column if not exists icon_color text;
