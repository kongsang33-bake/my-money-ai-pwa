create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  app_icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debtors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists debtors_user_name_key on public.debtors (user_id, lower(btrim(name)));
create index if not exists debtors_user_id_idx on public.debtors (user_id);

alter table public.profiles enable row level security;
alter table public.debtors enable row level security;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.debtors to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "debtors_select_own" on public.debtors;
create policy "debtors_select_own" on public.debtors
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "debtors_insert_own" on public.debtors;
create policy "debtors_insert_own" on public.debtors
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "debtors_update_own" on public.debtors;
create policy "debtors_update_own" on public.debtors
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "debtors_delete_own" on public.debtors;
create policy "debtors_delete_own" on public.debtors
  for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into public.debtors (user_id, name)
select distinct user_id, btrim(debtor_name)
from public.transactions
where transaction_type in ('lend', 'split_half', 'debt_repayment')
  and debtor_name is not null
  and btrim(debtor_name) <> ''
  and btrim(debtor_name) <> 'ไม่ระบุ'
on conflict do nothing;
