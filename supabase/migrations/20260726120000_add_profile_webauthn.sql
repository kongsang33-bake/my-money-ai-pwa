alter table public.profiles
  add column if not exists webauthn_credential_id text,
  add column if not exists webauthn_enabled boolean not null default false;
