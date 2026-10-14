// Curator pitch payments: the shapes the routes return.
//
// Split by who reads them, and that split is the privacy model. A curator sees
// their own payout account, price, earnings, recoveries and strikes. A paying
// team sees its own quotes and receipts, which name each curator's NOMINAL
// share and nothing about what that curator owes or was actually sent. No shape
// here carries a full account number or any card data: Paystack holds those.

import type { ArtistQuoteView } from '@/lib/pitch-payments';

export type PayoutAccountStatus = 'pending' | 'needs_review' | 'active' | 'retired' | 'disabled';

export interface CuratorPayoutAccount {
  id: string;
  bankName: string;
  accountLast4: string;
  resolvedAccountName: string;
  status: PayoutAccountStatus;
  createdAt: string;
  activatedAt: string | null;
}

export interface CuratorPricing {
  priceKobo: number;
  responseWindowHours: number;
  /** The curator switched paid pitches on. Whether it is actually charging is
   *  CuratorEarnings.livePriceKobo, which also needs an active payout account. */
  isLive: boolean;
}

export interface CuratorEarningsRow {
  id: string;
  songTitle: string;
  artistName: string;
  priceKobo: number;
  /** Their share before any recovery. */
  shareKobo: number;
  /** The part of the share that went to an earlier missed pitch. */
  recoveryAppliedKobo: number;
  /** What Paystack sent to their bank for this pitch. */
  sentToBankKobo: number;
  status: 'paid' | 'refund_pending' | 'refunded' | 'refund_failed';
  paidAt: string;
}

export interface CuratorEarnings {
  payoutAccount: CuratorPayoutAccount | null;
  pricing: CuratorPricing | null;
  /** The price artists are charged right now, or null when this curator takes
   *  free pitches (no price, paid pitches off, account not active, or paused). */
  livePriceKobo: number | null;
  paused: boolean;
  strikeCount: number;
  /** What they still owe back from missed windows. */
  recoveryOwedKobo: number;
  earnings: CuratorEarningsRow[];
  config: {
    feeBps: number;
    priceMinKobo: number;
    priceMaxKobo: number;
    responseWindowHours: number;
    strikeLimit: number;
    strikeWindowDays: number;
    termsVersion: string;
  };
}

/** A quote or a receipt, as the paying team sees it. */
export type PitchQuote = ArtistQuoteView;

/** One paid checkout in the team's payment history. */
export type PitchReceipt = ArtistQuoteView & {
  /** The song the checkout pitched. */
  songTitle: string;
  /** The rollout it was for, or null when that rollout was deleted. */
  releaseTitle: string | null;
  /** That rollout's id, or null when it was deleted. Lets a rollout's own
   *  Pitch tab show just its receipts. */
  releaseId: string | null;
};
