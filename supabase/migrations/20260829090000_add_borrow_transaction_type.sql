-- "borrow" represents cash borrowed from an individual (not a bank/card) --
-- wallet balance goes up AND an "own"-kind debt to that person grows at the
-- same time, a combination none of the existing types produce (card_charge
-- grows the debt with no wallet movement; debt_payment/debt_repayment only
-- ever shrink a debt). Kept distinct from card_charge/debt_payment so the
-- debtor_name convention can stay a person's name instead of a debt/card
-- bucket name.
alter table public.transactions
  drop constraint if exists transactions_transaction_type_check;

alter table public.transactions
  add constraint transactions_transaction_type_check
  check (transaction_type = any (array['income', 'personal_expense', 'lend', 'borrow', 'split_half', 'debt_repayment', 'debt_payment', 'card_charge', 'transfer', 'gift', 'investment_buy']));
