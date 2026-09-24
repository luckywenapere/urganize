-- Brand colors for share images (2026-09-24, founder call).
--
-- Two optional colors per artist, a background and an accent, used ONLY by the
-- share-to-socials posters (apps/web/lib/social-share-card.tsx). Everything
-- else a poster draws is derived from these two in
-- apps/web/lib/social-share-colors.ts (the text color is picked for contrast),
-- so there is nothing else to store.
--
-- Per ARTIST, not per team, because a manager's roster is several artists and
-- each has their own look. Nullable, and NULL means "use Urganize's colors",
-- which is what every existing artist gets: no backfill.
--
-- Stored as '#RRGGBB', uppercase. The API normalizes before writing and the
-- CHECK refuses anything a future writer forgets to, so one color can never be
-- stored two ways.
--
-- No policy changes. A color is not a secret and grants nothing; the columns
-- inherit the table's existing RLS, and every write goes through the
-- service-role route after a roster check.
--
-- Additive and safe to apply before or after the code ships: the code reads
-- these columns only behind NEXT_PUBLIC_FEATURE_BRAND_COLORS, and even then a
-- missing column falls back to Urganize's colors rather than failing an image.

alter table public.artists
  add column if not exists brand_background text,
  add column if not exists brand_accent text;

alter table public.artists drop constraint if exists artists_brand_background_hex;
alter table public.artists
  add constraint artists_brand_background_hex
  check (brand_background is null or brand_background ~ '^#[0-9A-F]{6}$');

alter table public.artists drop constraint if exists artists_brand_accent_hex;
alter table public.artists
  add constraint artists_brand_accent_hex
  check (brand_accent is null or brand_accent ~ '^#[0-9A-F]{6}$');
