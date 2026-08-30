-- Moves per-category budgets, money goals, and the net-worth display
-- setting off localStorage and onto the account, so they sync across
-- devices/browsers like everything else in the app instead of living only
-- on whichever browser last set them.
--
-- NOT wired up in application code yet -- see the app's own follow-up
-- commit/PR for that. This migration only needs to be applied to a project
-- before that follow-up ships; until then it's inert (no code reads or
-- writes these tables/columns).
create table if not exists public.budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.budgets enable row level security;

grant select, insert, update, delete on table public.budgets to authenticated;

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own" on public.budgets
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own" on public.budgets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own" on public.budgets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own" on public.budgets
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- "target"/"saved" are plain baht amounts the user types in -- no cents
-- tracking, no currency conversion, this is a simple visual progress goal
-- (see MoneyGoal in lib/types.ts).
create table if not exists public.money_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target numeric not null,
  saved numeric not null default 0,
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists money_goals_user_id_idx on public.money_goals (user_id);

alter table public.money_goals enable row level security;

grant select, insert, update, delete on table public.money_goals to authenticated;

drop policy if exists "money_goals_select_own" on public.money_goals;
create policy "money_goals_select_own" on public.money_goals
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "money_goals_insert_own" on public.money_goals;
create policy "money_goals_insert_own" on public.money_goals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "money_goals_update_own" on public.money_goals;
create policy "money_goals_update_own" on public.money_goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "money_goals_delete_own" on public.money_goals;
create policy "money_goals_delete_own" on public.money_goals
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The "full vs. obligation" net-worth formula and "hide the net-worth card"
-- toggle (NetWorthDisplaySettings in lib/types.ts) are a per-account display
-- preference, same tier as month_start_day already on this table.
alter table public.profiles
  add column if not exists net_worth_formula text not null default 'full'
    check (net_worth_formula in ('full', 'obligation')),
  add column if not exists net_worth_hide_card boolean not null default false;
