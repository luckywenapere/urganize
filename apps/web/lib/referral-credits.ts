/**
 * Referral credits: a team invites another team and earns credits when that team
 * makes its first payment. Pure: no database, no React. The reads and writes are
 * in `referrals-server.ts`.
 *
 * The strategy doc names the idea ("Credits for users who invite another team",
 * the "Refer" stage, a "referred signups" metric) and nothing else, so the
 * numbers here are DEFAULTS that can be changed in one place:
 *
 *   - The reward is REFERRAL_REWARD_CREDITS, paid to the inviting team.
 *   - It is paid on the invited team's FIRST PAYMENT, not on signup. A signup
 *     costs nothing to fake with a throwaway email; a payment does, and a team
 *     that pays has already covered the reward many times over (100 credits cost
 *     us a few cents; the cheapest plan is ₦5,000 a year).
 *   - A team can earn at most REFERRAL_REWARD_CAP rewards, so one link cannot
 *     turn into unlimited credits if something is gamed.
 *   - The invited team gets no bonus of its own. Add one here if wanted.
 *
 * Credits are a separate thing from partner commission (referrals.ts): a partner
 * is a business paid in naira, a team is a customer paid in credits. They share
 * the `?ref=` link and the tagging step, and a team can be tagged to one or the
 * other, never both.
 */

/** Credits the inviting team earns when the team it invited first pays. */
export const REFERRAL_REWARD_CREDITS = 100;

/** The most rewards one team can earn. */
export const REFERRAL_REWARD_CAP = 20;

/** NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS, default off. Needs NEXT_PUBLIC_FEATURE_REFERRALS
 *  as well: personal codes ride the same signup link and tagging step. With it off no
 *  personal code works, the Settings section is hidden and no reward is paid. */
export function isReferralCreditsEnabled(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS: process.env.NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS,
  }
): boolean {
  return String(env.NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS ?? '').trim().toLowerCase() === 'true';
}

/** Letters and digits with the look-alikes (0 O 1 I L) taken out, so a code read
 *  aloud or off a screenshot is typed back correctly. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PERSONAL_CODE_LENGTH = 8;

/**
 * A personal code: a leading "U" and seven characters, e.g. "UK7M2PQX". The
 * random source is passed in so this stays pure and a test can steer it; the
 * server hands it `crypto.randomInt`.
 */
export function generatePersonalCode(randomInt: (maxExclusive: number) => number): string {
  let code = 'U';
  for (let i = 0; i < PERSONAL_CODE_LENGTH - 1; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export type RewardRefusal = 'not_referred' | 'already_rewarded' | 'cap_reached';

export type RewardInput = {
  /** The invited team's referral row, or null when it was not invited by a team. */
  referral: { rewardedAt: string | null } | null;
  /** Rewards the inviting team has already earned. Null when it could not be read,
   *  which is treated as none: wrongly paying one reward costs a few cents, and
   *  wrongly withholding one costs a customer the thing they were promised. */
  rewardsAlreadyPaid: number | null;
};

export function decideReward(
  input: RewardInput
): { reward: true; credits: number } | { reward: false; reason: RewardRefusal } {
  if (!input.referral) return { reward: false, reason: 'not_referred' };
  if (input.referral.rewardedAt) return { reward: false, reason: 'already_rewarded' };
  if ((input.rewardsAlreadyPaid ?? 0) >= REFERRAL_REWARD_CAP) return { reward: false, reason: 'cap_reached' };
  return { reward: true, credits: REFERRAL_REWARD_CREDITS };
}

/** The ledger key that makes a reward payable once. Names the INVITED team, so
 *  a redelivered payment webhook cannot pay it twice. */
export function rewardDedupeKey(referredWorkspaceId: string): string {
  return `referral:${referredWorkspaceId}`;
}

export type ReferralStats = {
  /** Teams that signed up through the link. */
  invited: number;
  /** Of those, how many have paid and earned the reward. */
  rewarded: number;
  creditsEarned: number;
  capReached: boolean;
};

export function buildReferralStats(
  rows: ReadonlyArray<{ rewardedAt: string | null; rewardCredits: number | null }>
): ReferralStats {
  const rewarded = rows.filter((row) => row.rewardedAt);
  return {
    invited: rows.length,
    rewarded: rewarded.length,
    creditsEarned: rewarded.reduce((sum, row) => sum + (row.rewardCredits ?? 0), 0),
    capReached: rewarded.length >= REFERRAL_REWARD_CAP,
  };
}
