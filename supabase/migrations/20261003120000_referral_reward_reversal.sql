-- Referral reward clawback. A referral reward (user_referrals) is paid when the
-- invited team makes its first payment. If that payment is then refunded in
-- full, the reward is taken back: the payment webhook sees the refund, writes a
-- negative row in credit_ledger (keyed 'referral-clawback:<invited team>', so it
-- can only happen once) and stamps the referral row here.
--
-- Two columns, both nullable, nothing backfilled (no reward has ever been
-- reversed):
--
--   reversed_at       when the reward was taken back. A reversed reward no
--                     longer counts as earned or against the inviting team's
--                     cap of rewards, but rewarded_at is left set so the SAME
--                     invited team can never be rewarded twice (refund, pay
--                     again, collect again).
--   reversed_credits  what was actually taken back. It can be less than
--                     reward_credits: the balance is never pushed below zero,
--                     so credits the inviter already spent are not recovered.
--
-- Apply this BEFORE the code that reads it ships: the Settings referral stats and
-- the reward cap both select reversed_at.

alter table public.user_referrals
  add column if not exists reversed_at timestamptz null,
  add column if not exists reversed_credits integer null;

alter table public.user_referrals drop constraint if exists user_referrals_reversed_check;
alter table public.user_referrals
  add constraint user_referrals_reversed_check
  check (
    (reversed_at is null and reversed_credits is null)
    or (reversed_at is not null and reversed_credits is not null and reversed_credits >= 0)
  );

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_referrals' and column_name = 'reversed_at'
  ) then
    raise exception 'user_referrals.reversed_at was not created';
  end if;
end $$;
