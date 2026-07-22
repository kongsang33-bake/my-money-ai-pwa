alter table public.profiles
  add column if not exists app_icon_image text,
  add column if not exists month_start_day integer not null default 1;

alter table public.profiles
  drop constraint if exists profiles_month_start_day_check;

alter table public.profiles
  add constraint profiles_month_start_day_check check (month_start_day between 1 and 28);
