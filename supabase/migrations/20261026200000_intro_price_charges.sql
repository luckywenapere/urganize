-- Starting price for a team's first 6 monthly payments (founder, 2026-10-26).
--
-- One flag per payment row: was this charge at the starting price? The app
-- counts these to know how many starting-price months a team has left
-- (lib/intro-price.ts), and the Paystack webhook switches a card subscription
-- to the full-price Plan after the 6th. Rows written before today are false,
-- which is right: nobody paid a starting price before it existed.
alter table public.subscription_charges
  add column if not exists intro boolean not null default false;

create index if not exists subscription_charges_intro_idx
  on public.subscription_charges (user_id)
  where intro;
