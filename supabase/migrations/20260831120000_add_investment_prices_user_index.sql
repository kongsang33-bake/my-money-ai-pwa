-- investment_prices.user_id is a foreign key with no covering index, which
-- Supabase's performance linter flags: every cascade check and every
-- user-scoped read has to scan the table. Same shape as the index the
-- transactions table already has for its own user-scoped reads.
create index if not exists investment_prices_user_id_idx
  on public.investment_prices (user_id);
