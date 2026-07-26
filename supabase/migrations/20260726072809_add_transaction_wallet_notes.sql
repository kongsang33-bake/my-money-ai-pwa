-- Thread transactions through real wallet attribution and preserve optional
-- entry notes returned by AI analysis.
alter table public.wallets
  add column if not exists is_default boolean not null default false;

create unique index if not exists wallets_one_default_per_user_idx
  on public.wallets (user_id)
  where is_default;

update public.wallets w
set is_default = true,
    updated_at = now()
where w.id in (
  select distinct on (user_id) id
  from public.wallets
  where tag = 'cash'
  order by user_id, created_at asc
)
and not exists (
  select 1
  from public.wallets existing
  where existing.user_id = w.user_id
    and existing.is_default
);

update public.wallets w
set is_default = true,
    updated_at = now()
where w.id in (
  select distinct on (user_id) id
  from public.wallets
  order by user_id, created_at asc
)
and not exists (
  select 1
  from public.wallets existing
  where existing.user_id = w.user_id
    and existing.is_default
);

alter table public.transactions
  add column if not exists wallet_id uuid references public.wallets(id) on delete set null,
  add column if not exists note text;

create index if not exists transactions_wallet_id_idx
  on public.transactions (wallet_id);

update public.transactions t
set wallet_id = w.id
from public.wallets w
where t.wallet_id is null
  and w.user_id = t.user_id
  and w.is_default;

grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.wallets to authenticated;
