-- A daily ceiling on AI requests per account, counted across every AI
-- feature together (parsing, slips, investments, tickets, Ask AI). The API
-- routes only check that a caller is signed in, and anyone with a Google
-- account can sign in -- so without this one account could spend the whole
-- app's Gemini quota.
--
-- One row per user per Bangkok day. The routes never write it directly: they
-- call consume_ai_quota() with the caller's own token, which counts against
-- auth.uid() (never an argument) in a single statement, so two requests
-- landing together cannot both slip in under the limit.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

-- RLS on, and only a read policy: nobody can lower their own count through
-- the API. Writes go through the security-definer function below.
alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated
  using (user_id = auth.uid());

-- Counts one request if the caller is under p_limit today and reports
-- whether it was allowed. The limit is an argument so the number lives in
-- one place (AI_DAILY_LIMIT, lib/constants.ts); a user calling this directly
-- with a bigger limit only spends their own count, never anyone else's, and
-- the route still passes its own limit on every request.
create or replace function public.consume_ai_quota(p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Bangkok')::date;
  next_count integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.ai_usage as u (user_id, day, count)
  values (uid, today, 1)
  on conflict (user_id, day) do update
    set count = u.count + 1
    where u.count < p_limit
  returning u.count into next_count;

  -- The conflict branch's WHERE failing means the row exists at the limit:
  -- nothing was written and nothing returned.
  if next_count is null then
    select u.count into next_count from public.ai_usage u where u.user_id = uid and u.day = today;
    return query select false, coalesce(next_count, p_limit);
  else
    return query select true, next_count;
  end if;
end;
$$;

revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;

-- Past days are a few bytes each and nothing reads them; they go with the
-- account (on delete cascade). No cleanup job is worth a cron here.
