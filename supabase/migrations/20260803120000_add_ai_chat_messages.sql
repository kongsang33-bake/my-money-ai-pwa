-- Persists the "ถาม AI เรื่องเงิน" chat so it survives closing the app or
-- switching devices, instead of living only in component state. One
-- continuous thread per user (no separate conversation/session id) since
-- the feature is a single ongoing chat, not multiple named chats.
create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_user_id_idx on public.ai_chat_messages (user_id, created_at);

alter table public.ai_chat_messages enable row level security;

grant select, insert, delete on table public.ai_chat_messages to authenticated;

drop policy if exists "ai_chat_messages_select_own" on public.ai_chat_messages;
create policy "ai_chat_messages_select_own" on public.ai_chat_messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_chat_messages_insert_own" on public.ai_chat_messages;
create policy "ai_chat_messages_insert_own" on public.ai_chat_messages
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_chat_messages_delete_own" on public.ai_chat_messages;
create policy "ai_chat_messages_delete_own" on public.ai_chat_messages
  for delete to authenticated
  using ((select auth.uid()) = user_id);
