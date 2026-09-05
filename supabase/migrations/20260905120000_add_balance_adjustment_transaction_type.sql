-- "balance_adjustment" is the row that makes a wallet in the app equal the
-- balance in real life: the difference between the two, written once, so a
-- drift the user cannot account for line by line stops being carried forward
-- into every number the app shows.
--
-- It is not income and not spending -- nothing was earned or bought -- so it
-- is its own type rather than a personal_expense with a special title, which
-- would land in a category's spending and in the month's เงินเข้า/เงินออก.
-- Like a transfer, it carries its own signed wallet_impact (amount is
-- constrained >= 0, and the adjustment can go either way).
alter table public.transactions
  drop constraint if exists transactions_transaction_type_check;

alter table public.transactions
  add constraint transactions_transaction_type_check
  check (transaction_type = any (array['income', 'personal_expense', 'lend', 'borrow', 'split_half', 'debt_repayment', 'debt_payment', 'card_charge', 'transfer', 'gift', 'investment_buy', 'balance_adjustment']));
