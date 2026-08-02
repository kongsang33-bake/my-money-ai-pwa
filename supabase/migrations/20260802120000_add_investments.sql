-- Portfolio tracking, separate from the wallets table: a wallet is a cash
-- balance, an investment is a position (units held + total cost paid) in a
-- fund/stock/etc. investment_prices stores NAV snapshots the user enters
-- manually over time, which is what lets the app show a P&L history chart
-- instead of just a single current number.
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text,
  units numeric not null default 0,
  cost_basis numeric not null default 0,
  icon text,
  icon_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investments_user_id_idx on public.investments (user_id);

alter table public.investments enable row level security;

grant select, insert, update, delete on table public.investments to authenticated;

drop policy if exists "investments_select_own" on public.investments;
create policy "investments_select_own" on public.investments
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "investments_insert_own" on public.investments;
create policy "investments_insert_own" on public.investments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "investments_update_own" on public.investments;
create policy "investments_update_own" on public.investments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "investments_delete_own" on public.investments;
create policy "investments_delete_own" on public.investments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.investment_prices (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nav numeric not null,
  recorded_at date not null,
  created_at timestamptz not null default now()
);

create index if not exists investment_prices_investment_id_idx on public.investment_prices (investment_id);
create unique index if not exists investment_prices_one_per_day on public.investment_prices (investment_id, recorded_at);

alter table public.investment_prices enable row level security;

grant select, insert, update, delete on table public.investment_prices to authenticated;

drop policy if exists "investment_prices_select_own" on public.investment_prices;
create policy "investment_prices_select_own" on public.investment_prices
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "investment_prices_insert_own" on public.investment_prices;
create policy "investment_prices_insert_own" on public.investment_prices
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "investment_prices_update_own" on public.investment_prices;
create policy "investment_prices_update_own" on public.investment_prices
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "investment_prices_delete_own" on public.investment_prices;
create policy "investment_prices_delete_own" on public.investment_prices
  for delete to authenticated
  using ((select auth.uid()) = user_id);
