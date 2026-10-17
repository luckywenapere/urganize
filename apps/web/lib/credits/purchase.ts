import { findPack } from './packs';

/**
 * Buying credits, the rules and none of the plumbing. Pure: no IO, no env, so a
 * test can hold every decision.
 *
 * THE TRUST MODEL, because this is money. A checkout is started by our server,
 * which decides the price (it must be one of the four packs) and the credits (from
 * the account's state at that moment) and writes both into the transaction's
 * metadata. Paystack returns that metadata on the signed webhook and on a
 * verify call. But a webhook body is a CLAIM and the verify call is Paystack
 * saying so, so crediting happens only after `checkPurchase` has compared what
 * Paystack says was paid against what a pack can be: the amount to the kobo, the
 * currency, and that the credits are a number a pack really gives. A reference
 * that anyone forges cannot pass that, because the credits and the price must
 * agree with the table, not just with each other.
 */

export const CREDITS_REFERENCE_PREFIX = 'urgcredits-';

export function isCreditsReference(reference: unknown): reference is string {
  return typeof reference === 'string' && reference.startsWith(CREDITS_REFERENCE_PREFIX);
}

/** `token` is random bytes, hex, supplied by the caller so this stays pure. */
export function creditsReference(token: string): string {
  return `${CREDITS_REFERENCE_PREFIX}${token}`;
}

export const CREDITS_PURCHASE_SOURCE = 'credits_purchase';

export type PurchaseMetadata = {
  source: typeof CREDITS_PURCHASE_SOURCE;
  workspace_id: string;
  owner_user_id: string | null;
  user_id: string;
  price_naira: number;
  credits: number;
};

export function buildPurchaseMetadata(input: {
  workspaceId: string;
  ownerUserId: string | null;
  userId: string;
  priceNaira: number;
  credits: number;
}): PurchaseMetadata {
  return {
    source: CREDITS_PURCHASE_SOURCE,
    workspace_id: input.workspaceId,
    owner_user_id: input.ownerUserId,
    user_id: input.userId,
    price_naira: input.priceNaira,
    credits: input.credits,
  };
}

/** What Paystack reports for a transaction, reduced to what the decision reads. */
export type VerifiedPurchase = {
  status: string;
  currency: string;
  amountKobo: number;
  metadata: Record<string, unknown> | null;
};

export type PurchaseDecision =
  | { ok: true; workspaceId: string; ownerUserId: string | null; userId: string; priceNaira: number; credits: number }
  | { ok: false; reason: 'not_paid' | 'mismatch' };

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value));

/**
 * Whether to credit, and exactly how many. `not_paid` is a normal answer (the
 * person came back before paying, or paid and it has not landed yet) and is
 * retried. `mismatch` is not: money arrived that does not match any pack, and it
 * is logged for a person to look at rather than credited on a guess.
 */
export function checkPurchase(verified: VerifiedPurchase): PurchaseDecision {
  if (verified.status !== 'success') return { ok: false, reason: 'not_paid' };

  const meta = verified.metadata ?? {};
  if (meta.source !== CREDITS_PURCHASE_SOURCE) return { ok: false, reason: 'mismatch' };

  const workspaceId = str(meta.workspace_id);
  const userId = str(meta.user_id);
  const priceNaira = num(meta.price_naira);
  const credits = num(meta.credits);
  if (!workspaceId || !userId) return { ok: false, reason: 'mismatch' };

  const pack = findPack(priceNaira);
  if (!pack) return { ok: false, reason: 'mismatch' };

  // The amount Paystack took must be this pack's price, in naira, to the kobo.
  if (verified.currency !== 'NGN' || verified.amountKobo !== pack.priceNaira * 100) {
    return { ok: false, reason: 'mismatch' };
  }

  // And the credits must be one of the two numbers this pack gives. Which of the
  // two was right depended on the account when the checkout started; that cannot
  // be re-derived now, but it can be bounded, so a forged number cannot pass.
  if (credits !== pack.subscriberCredits && credits !== pack.creditsOnlyCredits) {
    return { ok: false, reason: 'mismatch' };
  }

  return {
    ok: true,
    workspaceId,
    ownerUserId: str(meta.owner_user_id) || null,
    userId,
    priceNaira: pack.priceNaira,
    credits,
  };
}

/** The ledger key that makes a purchase land once, however many times it is told about. */
export function purchaseDedupeKey(reference: string): string {
  return `topup:${reference}`;
}

/**
 * Where Paystack sends a buyer back to. The credits page is behind the wall, so
 * a team with no plan buys from the UrgAns page under /locked and must land
 * back there, or the wall would bounce it and the reference that settles the
 * purchase would be lost. Anything else asked for (a full URL, an unknown path)
 * answers the credits page: this ends up in a URL we hand to Paystack, so it is
 * a fixed list and never something the browser can choose freely.
 */
// '/dashboard/pitching' (Pitch on credits, URG-345): the top-up sheet in Pitch
// this! comes back through the pitching bridge, which forwards to the rollout's
// Pitch tab where the waiting pitches send themselves.
export const CREDITS_RETURN_PATHS = ['/dashboard/credits', '/locked/urgans', '/dashboard/pitching'] as const;
export type CreditsReturnPath = (typeof CREDITS_RETURN_PATHS)[number];

export function resolveCreditsReturnPath(value: unknown): CreditsReturnPath {
  return (CREDITS_RETURN_PATHS as readonly unknown[]).includes(value)
    ? (value as CreditsReturnPath)
    : '/dashboard/credits';
}
