-- Covers the one query every page load makes: entries ordered by
-- occurred_at for the signed-in user (loadEntries in app/page.tsx).
--
-- Written from a guess that no such index existed -- checking the real
-- production schema (via the Supabase MCP connection, once available)
-- found transactions_user_occurred_idx already covering the exact same
-- columns. Renamed to match it exactly, purely so this stays a genuine
-- idempotent no-op on that project instead of creating a second, redundant
-- index under a different name -- a fresh project still ends up with the
-- same index either way.
create index if not exists transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc);
