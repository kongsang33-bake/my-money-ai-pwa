-- The record that a user read and acknowledged the privacy policy, one row
-- per user per policy version (components/privacy.tsx, PRIVACY_POLICY_VERSION
-- in lib/constants.ts). It is evidence, so it is append-only from the app:
-- the authenticated role may insert and read its own rows but has no update
-- or delete grant, and the time comes from the database, not the client.
--
-- source says where the acknowledgement was given: 'landing' (on the sign-in
-- screen before signing in, written right after sign-in) or 'in_app' (the
-- gate shown to a signed-in user with no acknowledgement of this version).
create table if not exists public.privacy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null,
  source text not null check (source in ('landing', 'in_app')),
  user_agent text,
  acknowledged_at timestamptz not null default now(),
  unique (user_id, policy_version)
);

alter table public.privacy_acknowledgements enable row level security;

-- Supabase's default privileges hand anon and authenticated every privilege
-- on a new public table; take them back so only select and insert remain.
revoke all on table public.privacy_acknowledgements from anon, authenticated;
grant select, insert on table public.privacy_acknowledgements to authenticated;

drop policy if exists "privacy_acknowledgements_select_own" on public.privacy_acknowledgements;
create policy "privacy_acknowledgements_select_own" on public.privacy_acknowledgements
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "privacy_acknowledgements_insert_own" on public.privacy_acknowledgements;
create policy "privacy_acknowledgements_insert_own" on public.privacy_acknowledgements
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
