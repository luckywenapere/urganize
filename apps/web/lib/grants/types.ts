// The shapes the grant finder passes between its steps.
//
// A FetchedPage is what Exa (or any fetcher) handed back. ExtractedFields is what
// a model SAID about that page and is never trusted as it stands. A VerifiedGrant
// is what is left after every field has been checked against the page text.

import type { GrantCurrency } from './money';

export type FetchedPage = {
  url: string;
  title: string;
  text: string;
};

/** What the model proposed. Every value is unchecked, so every value is `unknown`. */
export type ExtractedFields = Record<string, unknown>;

export type GrantStatus = 'open' | 'closed' | 'unknown';

/** A field the model claimed that the page does not hold, so it was emptied. */
export type BlankedField = 'funder' | 'deadline' | 'amount' | 'eligibility' | 'lastClosedOn';

export type VerifiedGrant = {
  title: string;
  funder: string | null;
  /** From the fetched page, never from the model. No fragment, no credentials. */
  link: string;
  /** The day the page was read, passed in by the caller, never from the model. */
  readOn: string;
  status: GrantStatus;
  /** `YYYY-MM-DD`. Only ever today or later, and only if the page holds that date. */
  deadline: string | null;
  /** Set only when the round is closed and the page holds the date it closed. */
  lastClosedOn: string | null;
  /** True only when the page itself says applications are taken all the time. */
  rolling: boolean;
  amount: number | null;
  currency: GrantCurrency | null;
  /** A figure in a currency we cannot save, kept as text, for example `CAD 20,000`. */
  figureNote: string | null;
  /** Quoted from the page, at most five lines of at most 200 characters. */
  eligibility: string[];
  blanked: BlankedField[];
};

export type VerifyRefusal = 'no_link' | 'no_title' | 'not_a_grant';

export type VerifyResult = { ok: true; grant: VerifiedGrant } | { ok: false; reason: VerifyRefusal };
