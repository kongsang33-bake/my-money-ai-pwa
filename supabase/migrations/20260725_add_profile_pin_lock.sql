alter table public.profiles
  add column if not exists pin_hash text,
  add column if not exists pin_salt text,
  add column if not exists pin_failed_attempts integer not null default 0,
  add column if not exists pin_blocked_until timestamptz;

alter table public.profiles
  drop constraint if exists profiles_pin_failed_attempts_check;

alter table public.profiles
  add constraint profiles_pin_failed_attempts_check
  check (pin_failed_attempts between 0 and 5);

grant select, insert, update, delete on table public.profiles to authenticated;
