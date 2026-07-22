-- Adds neutral, per-person debtor grouping while preserving existing transaction logic.
alter table public.transactions
  add column if not exists debtor_name text;

update public.transactions
set debtor_name = 'ไม่ระบุ'
where transaction_type in ('lend', 'split_half', 'debt_repayment')
  and (debtor_name is null or btrim(debtor_name) = '');

grant select, insert, update, delete on table public.transactions to authenticated;
