-- Allows the new debt_payment transaction_type (paying down the user's own
-- debts, as opposed to debt_repayment which is someone repaying the user).
alter table public.transactions
  drop constraint if exists transactions_transaction_type_check;

alter table public.transactions
  add constraint transactions_transaction_type_check
  check (transaction_type = any (array['income', 'personal_expense', 'lend', 'split_half', 'debt_repayment', 'debt_payment', 'gift']));
