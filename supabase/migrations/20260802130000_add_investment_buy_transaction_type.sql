-- Lets logging an investment purchase debit a real wallet like any other
-- transaction, instead of only mutating investments.units/cost_basis in
-- isolation. investment_units is nullable because a DCA purchase debits
-- cash on the scheduled day but the fund house doesn't confirm the actual
-- unit allocation until a few days later — the row is created right away
-- with investment_units = null ("pending"), then filled in once known.
alter table public.transactions
  add column if not exists investment_id uuid references public.investments(id) on delete set null,
  add column if not exists investment_units numeric;

create index if not exists transactions_investment_id_idx
  on public.transactions (investment_id)
  where investment_id is not null;

alter table public.transactions
  drop constraint if exists transactions_transaction_type_check;

alter table public.transactions
  add constraint transactions_transaction_type_check
  check (transaction_type = any (array['income', 'personal_expense', 'lend', 'split_half', 'debt_repayment', 'debt_payment', 'card_charge', 'transfer', 'gift', 'investment_buy']));
