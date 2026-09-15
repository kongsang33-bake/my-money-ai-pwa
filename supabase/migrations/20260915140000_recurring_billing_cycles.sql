-- A recurring bill could only ever be monthly: it stored a day of the month,
-- so a yearly domain renewal or a quarterly plan had no way to be entered at
-- all, and the monthly total silently assumed every row was a monthly cost.
--
-- The schedule becomes an anchor date plus how often it repeats. One date and
-- a count of weeks or months describes every cycle a subscription actually
-- uses -- quarterly is three months, yearly is twelve -- and an anchor in the
-- future is a bill that has not started yet, which a day-of-month could not
-- express either.
alter table public.recurring_expenses
  add column if not exists anchor_date date,
  add column if not exists interval_unit text not null default 'month'
    check (interval_unit in ('week', 'month')),
  add column if not exists interval_count smallint not null default 1
    check (interval_count between 1 and 60);

-- Existing rows keep the schedule they already had: this month's billing day,
-- clamped to a month that may be shorter than the day asked for (the 31st of
-- September is the 30th), repeating monthly as before.
update public.recurring_expenses
set anchor_date = least(
  (date_trunc('month', current_date)::date + (billing_day - 1)),
  (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
)
where anchor_date is null;

alter table public.recurring_expenses
  alter column anchor_date set default current_date,
  alter column anchor_date set not null;

-- Dropped rather than left in place: two columns that both claim to say when
-- a bill falls due is exactly how one of them goes stale.
alter table public.recurring_expenses drop column if exists billing_day;
