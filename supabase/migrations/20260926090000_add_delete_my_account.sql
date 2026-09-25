-- Lets a signed-in user delete their own account from inside the app
-- ("ของฉัน" -> ลบบัญชี). The browser only holds the publishable key, which
-- cannot touch auth.users, so this runs as its owner (security definer) and
-- deletes exactly one row: the caller's own, taken from auth.uid() and never
-- from an argument. Every public table's user_id references auth.users with
-- on delete cascade, so that one delete removes all of the account's data,
-- privacy_acknowledgements included -- which is what the privacy policy says
-- happens.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

-- Supabase grants execute on new functions to anon as well; only a
-- signed-in user may call this.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
