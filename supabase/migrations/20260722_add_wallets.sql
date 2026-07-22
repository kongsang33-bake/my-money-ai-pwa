-- Replaces the fixed opening_cash_balance/savings_balance/investment_balance
-- columns on profiles with a flexible wallets table: users can create any
-- number of named money pockets (e.g. "กระเป๋าหลัก", "ออมทรัพย์ SCB") and tag
-- each as cash/savings/investment/other, and the app aggregates by tag.
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tag text not null default 'cash' check (tag in ('cash', 'savings', 'investment', 'other')),
  balance numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallets_user_id_idx on public.wallets (user_id);

alter table public.wallets enable row level security;

grant select, insert, update, delete on table public.wallets to authenticated;

drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own" on public.wallets
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "wallets_insert_own" on public.wallets;
create policy "wallets_insert_own" on public.wallets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "wallets_update_own" on public.wallets;
create policy "wallets_update_own" on public.wallets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "wallets_delete_own" on public.wallets;
create policy "wallets_delete_own" on public.wallets
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Preserve any balances already entered under the old fixed fields as named
-- wallets before the columns disappear.
insert into public.wallets (user_id, name, tag, balance)
select user_id, 'เงินสดตั้งต้น', 'cash', opening_cash_balance
from public.profiles
where opening_cash_balance <> 0;

insert into public.wallets (user_id, name, tag, balance)
select user_id, 'ออมทรัพย์', 'savings', savings_balance
from public.profiles
where savings_balance <> 0;

insert into public.wallets (user_id, name, tag, balance)
select user_id, 'เงินลงทุน', 'investment', investment_balance
from public.profiles
where investment_balance <> 0;

alter table public.profiles
  drop column if exists opening_cash_balance,
  drop column if exists savings_balance,
  drop column if exists investment_balance;
