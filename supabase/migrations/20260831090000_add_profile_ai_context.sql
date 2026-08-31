-- Free-text, per-account context the user writes once and the AI parsing
-- prompt (/api/analyze) and the finance chat (/api/ask) both inject.
--
-- The parsing prompt can only ship rules the app's authors thought of in
-- advance; a user whose money has its own vocabulary (an apartment manager
-- whose "ลูกบ้านแลกเหรียญ" is a coin-for-notes swap, not income) had no way
-- to teach the model that short of a code change. This column is that way.
alter table public.profiles
  add column if not exists ai_context text;
