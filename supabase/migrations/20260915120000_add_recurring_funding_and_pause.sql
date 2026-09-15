-- Two things a recurring bill could not say before.
--
-- 1. What pays it. The table was a pure tracking list, so one-tap logging had
--    to guess: every bill came out of the default wallet. A subscription that
--    really is charged to a credit card then moved money that the bank had
--    not taken yet, and the card's own balance never heard about it. The two
--    columns mirror the two funding shapes an entry already has -- a wallet,
--    or a name from the debtors table (a card, or the person who fronts it) --
--    and are named after the draft fields that carry the same meaning, so the
--    save path is the one that already exists (expandDraftForSave).
--
-- 2. Whether it is still running. Cancelling Netflix used to mean deleting the
--    row, which is also the only record that it was ever a monthly cost. A
--    paused bill keeps its history and its place in the list; it just stops
--    counting towards the monthly total and stops asking to be logged.
alter table public.recurring_expenses
  add column if not exists wallet_id uuid references public.wallets(id) on delete set null,
  add column if not exists funding_card_name text,
  add column if not exists is_active boolean not null default true;
