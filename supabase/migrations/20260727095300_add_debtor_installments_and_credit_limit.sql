-- Lets an "own" debt track installment progress explicitly (paid/total
-- installments instead of only a derived months-left estimate) and lets a
-- credit-card-style debt carry a credit limit. Also adds the card_charge
-- transaction_type: logging a purchase charged to a credit card increases
-- that debt's balance without touching any wallet (the cash hasn't left
-- yet), as opposed to debt_payment which pays the balance down from a
-- wallet.
alter table public.debtors
  add column if not exists total_installments integer,
  add column if not exists paid_installments integer,
  add column if not exists credit_limit numeric;

alter table public.transactions
  drop constraint if exists transactions_transaction_type_check;

alter table public.transactions
  add constraint transactions_transaction_type_check
  check (transaction_type = any (array['income', 'personal_expense', 'lend', 'split_half', 'debt_repayment', 'debt_payment', 'card_charge', 'gift']));
