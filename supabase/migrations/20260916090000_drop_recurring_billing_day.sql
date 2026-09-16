-- The second half of the billing-cycle change (20260915140000), run only once
-- the code that reads anchor_date/interval_unit/interval_count is deployed.
--
-- Splitting it this way is what keeps the rollout from having a broken window:
-- the first migration only adds, so the old code carries on reading
-- billing_day while the new columns fill up behind it; this one removes the
-- old column once nothing is asking for it any more. Two columns that both
-- claim to say when a bill falls due is exactly how one of them goes stale,
-- so it does come out -- just not while something still selects it.
alter table public.recurring_expenses drop column if exists billing_day;
