-- paid_installments was a manually-entered counter that never updated when
-- an actual debt_payment transaction was logged, so it drifted from reality
-- (e.g. showing "10/48 paid" on a debt whose real outstanding balance was
-- already 0). Progress is now derived from outstanding ÷ monthly_installment
-- instead, making the stored counter unnecessary.
alter table public.debtors
  drop column if exists paid_installments;

-- Credit card minimum payments are a percentage of the outstanding balance,
-- not a fixed amount like a loan installment, so they need their own field
-- rather than reusing monthly_installment.
alter table public.debtors
  add column if not exists credit_card_min_payment_percent numeric;
