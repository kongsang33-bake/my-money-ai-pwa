-- Tracks recurring monthly costs (subscriptions, memberships, etc.) the user
-- wants visibility into, e.g. Netflix, Claude Pro, YouTube Premium. This is
-- a pure tracking list: it has no link to `transactions` -- actual payments
-- are still logged the normal way through the Add tab.
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  billing_day smallint not null default 1 check (billing_day between 1 and 31),
  icon text,
  icon_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_expenses_user_id_idx on public.recurring_expenses (user_id);

alter table public.recurring_expenses enable row level security;

grant select, insert, update, delete on table public.recurring_expenses to authenticated;

drop policy if exists "recurring_expenses_select_own" on public.recurring_expenses;
create policy "recurring_expenses_select_own" on public.recurring_expenses
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "recurring_expenses_insert_own" on public.recurring_expenses;
create policy "recurring_expenses_insert_own" on public.recurring_expenses
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "recurring_expenses_update_own" on public.recurring_expenses;
create policy "recurring_expenses_update_own" on public.recurring_expenses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "recurring_expenses_delete_own" on public.recurring_expenses;
create policy "recurring_expenses_delete_own" on public.recurring_expenses
  for delete to authenticated
  using ((select auth.uid()) = user_id);
