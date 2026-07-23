-- Adds an optional "own debt" mode to debtors, so a user can track
-- installment loans they owe (e.g. ผ่อนบ้าน, ผ่อนรถ) in the same screen as
-- people who owe them money, distinguished by `kind`.
alter table public.debtors
  add column if not exists kind text not null default 'lend' check (kind in ('lend', 'own')),
  add column if not exists monthly_installment numeric;
