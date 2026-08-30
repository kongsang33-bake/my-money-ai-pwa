-- Baseline for public.transactions -- every other migration in this folder
-- assumes this table already exists (the earliest one, 20260722_add_debtor_
-- name.sql, does `alter table public.transactions add column ...`), but the
-- table itself predates this migrations folder and was never captured here.
-- Without this, a fresh Supabase project can't be brought up from this repo
-- alone: every later migration in this folder already incrementally adds
-- exactly the column/constraint it needs (debtor_name, wallet_id,
-- transfer_group_id, investment_id, the transaction_type check, ...), so
-- this only needs to create the table in whatever minimal shape it had
-- *before* any of those existed -- not reconstruct the final schema.
--
-- Written idempotently (create table if not exists) so it safely no-ops
-- against a project that already has the table -- this file exists to let
-- a *new* project reach the same schema by replaying every migration in
-- order, not to change an existing one.
--
-- No transaction_type check constraint here on purpose: the first migration
-- to add one (20260723_add_debt_payment_transaction_type.sql) does
-- `drop constraint if exists` before `add constraint`, which only makes
-- sense if the column started with no named constraint at all.
--
-- IMPORTANT: verify this against the real production schema (e.g. `supabase
-- db dump` or the dashboard's table editor) before relying on it.
--
-- Dated 2026-07-21 (one day before the earliest migration that touches this
-- table) so `supabase db reset` / a fresh project applies it first, in
-- dependency order -- not because it was actually written then. On a
-- project that has already applied every other migration in this folder,
-- adding a file whose timestamp sorts *before* the latest applied one is
-- "out of order" for most Supabase CLI versions: since the table already
-- exists there, running this file's statements is still a safe no-op, but
-- you may need `supabase migration repair --status applied <version>` (or
-- applying it manually once via the SQL editor) to get the CLI's migration
-- history to accept it rather than refusing to proceed. Test on a branch/
-- staging project first.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  amount numeric not null default 0,
  kind text not null,
  transaction_type text not null,
  wallet_impact numeric not null default 0,
  debt_impact numeric not null default 0,
  user_share numeric not null default 0,
  partner_share numeric not null default 0,
  occurred_at timestamptz not null default now(),
  source_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

grant select, insert, update, delete on table public.transactions to authenticated;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated
  using ((select auth.uid()) = user_id);
