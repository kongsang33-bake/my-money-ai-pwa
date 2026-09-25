-- The card pocket on the back of Home's billboard (components/pocket.tsx,
-- lib/pocket.ts): the user's own PromptPay numbers, QR codes read out of a
-- bank app's screenshot, membership barcodes and bank accounts, kept so they
-- can be shown for someone else to scan.
--
-- No picture is stored. A PromptPay QR is rebuilt from the number, a bank
-- app's QR is read to text on the device and only that text is kept, and a
-- barcode is its code -- `value` holds whichever of those the kind needs.
--
-- sort_order is the order the pocket swipes through, set by the manage
-- sheet's up/down buttons.
create table if not exists public.pocket_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('promptpay', 'qr', 'barcode', 'account')),
  label text not null check (char_length(label) between 1 and 60),
  holder text check (holder is null or char_length(holder) <= 80),
  bank text check (bank is null or char_length(bank) <= 60),
  value text not null check (char_length(value) between 1 and 1024),
  hue text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pocket_cards_user_id_idx on public.pocket_cards (user_id, sort_order);

alter table public.pocket_cards enable row level security;

revoke all on table public.pocket_cards from anon, authenticated;
grant select, insert, update, delete on table public.pocket_cards to authenticated;

drop policy if exists "pocket_cards_select_own" on public.pocket_cards;
create policy "pocket_cards_select_own" on public.pocket_cards
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "pocket_cards_insert_own" on public.pocket_cards;
create policy "pocket_cards_insert_own" on public.pocket_cards
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "pocket_cards_update_own" on public.pocket_cards;
create policy "pocket_cards_update_own" on public.pocket_cards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "pocket_cards_delete_own" on public.pocket_cards;
create policy "pocket_cards_delete_own" on public.pocket_cards
  for delete to authenticated
  using ((select auth.uid()) = user_id);
