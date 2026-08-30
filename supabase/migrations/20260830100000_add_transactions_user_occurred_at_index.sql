-- Covers the one query every page load makes: entries ordered by
-- occurred_at for the signed-in user (loadEntries in app/page.tsx). No
-- index existed for this before -- only wallet_id/transfer_group_id/
-- investment_id had one -- so it was a full table scan per load, which
-- will only get slower as transaction history grows.
create index if not exists transactions_user_occurred_at_idx
  on public.transactions (user_id, occurred_at desc);
