-- Referral credits (strategy doc: "Referral credits | Credits for users who
-- invite another team"). A team shares a personal link; when a team signs up
-- through it and makes its first payment, the team that invited it earns
-- credits. Two tables:
--
--   referral_codes   one personal code per team, created the first time the
--                    team opens "Invite another team" in Settings
--   user_referrals   which team was invited by which team, and whether the
--                    reward for it has been paid
--
-- The reward itself is a row in credit_ledger (kind 'adjust', never expires),
-- keyed 'referral:<invited team>' so it can only ever be paid once. Nothing
-- about the amount is stored here: it is a constant in code, so changing it is
-- a deploy and never a migration.
--
-- Both tables have row level security on and NO policies. Every read and write
-- is a service-role route, so nothing a signed-in person does can touch them.

create table if not exists public.referral_codes (
  -- One code per team. The primary key is the guard.
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  -- Upper case, letters and digits. Shares a namespace with referral_partners.code
  -- (the code on a signup link can be either), so the application refuses to
  -- create one that matches the other.
  code text not null,
  created_at timestamptz not null default now(),
  constraint referral_codes_code_shape check (code ~ '^[A-Z0-9_-]{3,40}$')
);

create unique index if not exists referral_codes_code_idx
  on public.referral_codes (code);

create table if not exists public.user_referrals (
  -- A team can be invited once, ever.
  referred_workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  -- If the inviting team is deleted before the reward is paid, there is nobody
  -- to pay, so the row goes with it.
  referrer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code_used text not null,
  attached_at timestamptz not null default now(),
  -- Set when the reward has been paid. Null means the invited team has not made
  -- a first payment yet (or the inviting team had reached its cap).
  rewarded_at timestamptz null,
  reward_credits integer null,
  constraint user_referrals_not_self check (referred_workspace_id <> referrer_workspace_id),
  constraint user_referrals_reward_check check (reward_credits is null or reward_credits > 0)
);

create index if not exists user_referrals_referrer_idx
  on public.user_referrals (referrer_workspace_id);

alter table public.referral_codes enable row level security;
alter table public.user_referrals enable row level security;
