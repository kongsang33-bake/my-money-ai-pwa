-- Lets a user move money between their own wallets without it being
-- double-counted as income or an expense. A transfer is stored as two
-- linked transactions (one negative wallet_impact on the source wallet,
-- one positive on the destination wallet) sharing transfer_group_id, so
-- both legs can be found, displayed, and deleted together. Every income/
-- expense summation in the app must exclude transaction_type = 'transfer'
-- (handled in application code) — debt_impact/user_share/partner_share
-- stay 0 for both legs, same as card_charge already does for wallet_impact.
alter table public.transactions
  add column if not exists transfer_group_id uuid;

create index if not exists transactions_transfer_group_id_idx
  on public.transactions (transfer_group_id)
  where transfer_group_id is not null;

alter table public.transactions
  drop constraint if exists transactions_transaction_type_check;

alter table public.transactions
  add constraint transactions_transaction_type_check
  check (transaction_type = any (array['income', 'personal_expense', 'lend', 'split_half', 'debt_repayment', 'debt_payment', 'card_charge', 'transfer', 'gift']));
