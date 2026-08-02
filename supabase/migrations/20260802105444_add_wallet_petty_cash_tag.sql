-- Adds "petty" as a wallet tag for cash kept aside for a purpose (making
-- change, small operational spending, etc.) rather than parked in savings
-- or investment. Unlike "cash", petty-tagged wallets are NOT folded into
-- the main wallet total shown on the home hero card — they stay visible
-- as their own balance, since the whole point is checking that balance
-- separately before you need it.
alter table public.wallets
  drop constraint if exists wallets_tag_check;

alter table public.wallets
  add constraint wallets_tag_check
  check (tag in ('cash', 'savings', 'investment', 'other', 'petty'));
