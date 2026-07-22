-- Opening balances: lets a user record money that already existed before they
-- started logging transactions in the app (starting cash, savings, investment
-- holdings, and pre-existing debts owed to them), so totals reflect reality
-- instead of only what's been logged since day one.
alter table public.profiles
  add column if not exists opening_cash_balance numeric not null default 0,
  add column if not exists savings_balance numeric not null default 0,
  add column if not exists investment_balance numeric not null default 0;

alter table public.debtors
  add column if not exists opening_balance numeric not null default 0;
