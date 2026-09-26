-- The card pocket takes any card or ticket now, not only ways to be paid.
--
-- What a card IS (kind) is split from what code it carries (code_format):
-- "barcode" used to be both, and said nothing about what the barcode was for.
-- The new kinds are membership (loyalty and member cards), ticket (films,
-- concerts, events) and other. Their code is a QR, a barcode or none, read
-- from a photo on the device or typed. 'barcode' stays allowed as a kind so a
-- cached older build can still save; the app reads it as a membership card
-- with a barcode, and the update below moves any such row across.
--
-- details holds what is printed on a ticket -- title, venue, when, seat --
-- typed by the user or read off the ticket by AI when they ask for it
-- (/api/analyze-ticket). No picture is stored here or anywhere.
--
-- value may now be empty: a ticket with no code is still a ticket.
alter table public.pocket_cards drop constraint if exists pocket_cards_kind_check;
alter table public.pocket_cards add constraint pocket_cards_kind_check
  check (kind in ('promptpay', 'qr', 'account', 'membership', 'ticket', 'other', 'barcode'));

alter table public.pocket_cards drop constraint if exists pocket_cards_value_check;
alter table public.pocket_cards add constraint pocket_cards_value_check
  check (char_length(value) <= 1024);

alter table public.pocket_cards
  add column if not exists code_format text
    check (code_format is null or code_format in ('qr', 'barcode', 'none')),
  add column if not exists details jsonb
    check (details is null or (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 2048));

update public.pocket_cards set kind = 'membership', code_format = 'barcode' where kind = 'barcode';
