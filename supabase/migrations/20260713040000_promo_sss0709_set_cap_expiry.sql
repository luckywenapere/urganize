-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Set the real cap + expiry for the Sound Summer Surge code (SSS0709).
--
-- The seed in 20260713030000_partnership_promo_codes.sql used placeholders
-- (cap 300, expiry 2026-09-30). The program begins 20 July 2026; each
-- participant gets a full 60 days from when THEY redeem, so this only bounds
-- the enrollment window.
--
--   max_redemptions → 250   (headroom above expected attendance)
--   expires_at      → end of 20 Aug 2026 (a one-month grace after kickoff)
--
-- Runs after the seed regardless of apply order: if the row already exists it
-- updates it; if the seed runs first in the same batch, this corrects it.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

update public.promo_codes
   set max_redemptions = 250,
       expires_at      = '2026-08-20T23:59:59Z'
 where code = 'SSS0709';
