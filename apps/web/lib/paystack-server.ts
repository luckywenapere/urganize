/**
 * Paystack's REST API, for curator pitch payments. SERVER ONLY: it reads
 * PAYSTACK_SECRET_KEY, which must never reach a browser or the phone app.
 *
 * One small wrapper instead of a fetch per route, so every call gets the same
 * timeout, the same error shape and the same answer to the question that
 * decides whether to retry: was this a transient failure (network, timeout,
 * 429, 5xx) or Paystack telling us no?
 *
 * The subscription billing routes (app/api/billing/*) keep their own fetches.
 * They predate this, they work, and moving them is not this feature's job.
 *
 * ⚠️ PARAMETER SHAPES COME FROM PAYSTACK'S PUBLIC DOCS, not from answers Paystack
 * has given us. The spec lists the questions to put to Paystack support before
 * launch (dynamic multi-split on our account, partial refunds on a split
 * transaction, subaccount KYC). Test mode is where these shapes get proven.
 */

const PAYSTACK_API = 'https://api.paystack.co';
const DEFAULT_TIMEOUT_MS = 15_000;

export type PaystackResult<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> | null }
  | { ok: false; status: number; message: string; transient: boolean };

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
};

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY?.trim());
}

/** Exported for the tests; routes use the named calls below. */
export async function paystackRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<PaystackResult<T>> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: false, status: 500, message: 'Paystack is not configured.', transient: false };
  }

  const url = new URL(`${PAYSTACK_API}${path}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });

    const json = (await response.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: T;
      meta?: Record<string, unknown> | null;
    } | null;

    if (response.ok && json?.status === true) {
      return { ok: true, data: (json.data as T) ?? (null as T), meta: json.meta ?? null };
    }

    return {
      ok: false,
      status: response.status,
      message: (json?.message || `Paystack answered ${response.status}.`).slice(0, 300),
      transient: response.status === 429 || response.status >= 500,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      message: aborted ? 'Paystack took too long to answer.' : 'Could not reach Paystack.',
      transient: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── banks and accounts ──────────────────────────────────────────────────────

export type PaystackBank = { code: string; name: string };

/**
 * Nigerian banks that can receive a NUBAN transfer. Paginated with a cursor;
 * followed to the end, capped at ten pages so a bad cursor cannot loop.
 */
export async function listPaystackBanks(): Promise<PaystackResult<PaystackBank[]>> {
  const banks: PaystackBank[] = [];
  const seen = new Set<string>();
  let next: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const result = await paystackRequest<Array<Record<string, unknown>>>('/bank', {
      query: { country: 'nigeria', currency: 'NGN', use_cursor: 'true', perPage: 100, next },
    });
    if (!result.ok) return result;

    for (const row of Array.isArray(result.data) ? result.data : []) {
      const code = String(row.code || '').trim();
      const name = String(row.name || '').trim();
      const active = row.active !== false && row.is_deleted !== true;
      const nuban = !row.type || row.type === 'nuban';
      if (!code || !name || !active || !nuban || seen.has(code)) continue;
      seen.add(code);
      banks.push({ code, name });
    }

    const cursor = result.meta?.next;
    next = typeof cursor === 'string' && cursor ? cursor : undefined;
    if (!next) break;
  }

  banks.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, data: banks };
}

export async function resolvePaystackAccount(
  accountNumber: string,
  bankCode: string
): Promise<PaystackResult<{ accountName: string; accountNumber: string }>> {
  const result = await paystackRequest<{ account_name?: string; account_number?: string }>('/bank/resolve', {
    query: { account_number: accountNumber, bank_code: bankCode },
  });
  if (!result.ok) return result;
  const accountName = String(result.data?.account_name || '').trim();
  if (!accountName) {
    return { ok: false, status: 422, message: 'Paystack could not find that account.', transient: false };
  }
  return { ok: true, data: { accountName, accountNumber: String(result.data?.account_number || accountNumber) } };
}

/**
 * One subaccount per verified bank account. percentage_charge is required by
 * Paystack but only applies to charges made WITHOUT a split; every pitch
 * checkout passes a flat split that overrides it, so it is set to the platform
 * fee as a sane default rather than a number anything relies on.
 */
export async function createPaystackSubaccount(input: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge: number;
  contactEmail?: string | null;
  contactName?: string | null;
}): Promise<PaystackResult<{ subaccountCode: string }>> {
  const result = await paystackRequest<{ subaccount_code?: string }>('/subaccount', {
    method: 'POST',
    body: {
      business_name: input.businessName.slice(0, 100),
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: input.percentageCharge,
      ...(input.contactEmail ? { primary_contact_email: input.contactEmail } : {}),
      ...(input.contactName ? { primary_contact_name: input.contactName.slice(0, 100) } : {}),
    },
  });
  if (!result.ok) return result;
  const subaccountCode = String(result.data?.subaccount_code || '').trim();
  if (!subaccountCode) {
    return { ok: false, status: 502, message: 'Paystack did not return a subaccount.', transient: true };
  }
  return { ok: true, data: { subaccountCode } };
}

/** Switch a retired subaccount off at Paystack. Best effort: nothing routes
 *  money to a retired row anyway, because the split is built from our table. */
export async function setPaystackSubaccountActive(
  subaccountCode: string,
  active: boolean
): Promise<PaystackResult<null>> {
  const result = await paystackRequest<unknown>(`/subaccount/${encodeURIComponent(subaccountCode)}`, {
    method: 'PUT',
    body: { active },
  });
  if (!result.ok) return result;
  return { ok: true, data: null };
}

// ─── charging ────────────────────────────────────────────────────────────────

export type PaystackSplitInput = {
  type: 'flat';
  bearer_type: 'account';
  subaccounts: Array<{ subaccount: string; share: number }>;
};

/**
 * The spec's fallback for an account where dynamic splits are not switched on:
 * create a named split first and pass its code. Chosen with
 * PAYSTACK_SPLIT_MODE=split_code; the default passes the split inline.
 */
export async function createPaystackSplit(input: {
  name: string;
  split: PaystackSplitInput;
}): Promise<PaystackResult<{ splitCode: string }>> {
  const result = await paystackRequest<{ split_code?: string }>('/split', {
    method: 'POST',
    body: {
      name: input.name.slice(0, 100),
      type: input.split.type,
      currency: 'NGN',
      bearer_type: input.split.bearer_type,
      subaccounts: input.split.subaccounts,
    },
  });
  if (!result.ok) return result;
  const splitCode = String(result.data?.split_code || '').trim();
  if (!splitCode) return { ok: false, status: 502, message: 'Paystack did not return a split.', transient: true };
  return { ok: true, data: { splitCode } };
}

export function paystackSplitMode(): 'dynamic' | 'split_code' {
  return process.env.PAYSTACK_SPLIT_MODE?.trim() === 'split_code' ? 'split_code' : 'dynamic';
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  split?: PaystackSplitInput | null;
  splitCode?: string | null;
  /** Limit how the payer can pay, e.g. ['card'] when the card is to be saved. */
  channels?: string[];
}): Promise<PaystackResult<{ authorizationUrl: string; accessCode: string; reference: string }>> {
  const result = await paystackRequest<{ authorization_url?: string; access_code?: string; reference?: string }>(
    '/transaction/initialize',
    {
      method: 'POST',
      body: {
        email: input.email,
        amount: input.amountKobo,
        currency: 'NGN',
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
        ...(input.channels ? { channels: input.channels } : {}),
        ...(input.splitCode ? { split_code: input.splitCode } : input.split ? { split: input.split } : {}),
      },
    }
  );
  if (!result.ok) return result;
  const authorizationUrl = String(result.data?.authorization_url || '').trim();
  if (!authorizationUrl) {
    return { ok: false, status: 502, message: 'Paystack did not return a checkout link.', transient: true };
  }
  return {
    ok: true,
    data: {
      authorizationUrl,
      accessCode: String(result.data?.access_code || ''),
      reference: String(result.data?.reference || input.reference),
    },
  };
}

export type VerifiedPaystackTransaction = {
  status: string;
  reference: string;
  /** What the customer was charged, fee included when the account passes it on. */
  amountKobo: number;
  /**
   * What we asked for when the checkout started, before any fee Paystack adds.
   * Our account passes the fee on to the buyer, so a ₦1,500 pack is charged as
   * ₦1,522.85: compare prices against THIS, never against amountKobo (#1099).
   * Falls back to amountKobo when Paystack does not send it.
   */
  requestedAmountKobo: number;
  currency: string;
  feesKobo: number | null;
  transactionId: number | null;
  paidAt: string | null;
  metadata: Record<string, unknown> | null;
  /** The card, when it can be charged again later (add-on renewals, credits
   *  past the allowance). Null for transfers and one-off cards. */
  authorization: SavedCard | null;
};

/** A card Paystack lets us charge again without the payer. */
export type SavedCard = { authorizationCode: string; email: string; label: string };

function savedCardFrom(raw: unknown, email: unknown): SavedCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const auth = raw as Record<string, unknown>;
  const code = String(auth.authorization_code || '').trim();
  const reusable = auth.reusable === true || auth.reusable === 'true';
  const channel = String(auth.channel || 'card');
  const to = String(email || '').trim().toLowerCase();
  if (!code || !reusable || channel !== 'card' || !to) return null;
  const brand = String(auth.card_type || auth.brand || 'Card').trim();
  const last4 = String(auth.last4 || '').trim();
  return { authorizationCode: code, email: to, label: last4 ? `${brand} ending ${last4}` : brand };
}

/**
 * The only thing that ever marks a pitch paid. A webhook body is a claim; this
 * is Paystack confirming it.
 */
export async function verifyPaystackTransaction(
  reference: string
): Promise<PaystackResult<VerifiedPaystackTransaction>> {
  const result = await paystackRequest<Record<string, unknown>>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  if (!result.ok) return result;
  const data = result.data || {};
  const fees = Number(data.fees);
  const amount = Number(data.amount) || 0;
  const requested = Number(data.requested_amount);
  const id = Number(data.id);
  const metadata = data.metadata && typeof data.metadata === 'object' ? (data.metadata as Record<string, unknown>) : null;
  return {
    ok: true,
    data: {
      status: String(data.status || ''),
      reference: String(data.reference || reference),
      amountKobo: amount,
      requestedAmountKobo: Number.isFinite(requested) && requested > 0 ? requested : amount,
      currency: String(data.currency || ''),
      feesKobo: Number.isFinite(fees) ? fees : null,
      transactionId: Number.isFinite(id) && id > 0 ? id : null,
      paidAt: typeof data.paid_at === 'string' ? data.paid_at : typeof data.paidAt === 'string' ? data.paidAt : null,
      metadata,
      authorization: savedCardFrom(
        data.authorization,
        data.customer && typeof data.customer === 'object' ? (data.customer as Record<string, unknown>).email : null
      ),
    },
  };
}

/** A full or partial refund on one transaction. */
export async function createPaystackRefund(input: {
  reference: string;
  amountKobo: number;
  merchantNote?: string;
  customerNote?: string;
}): Promise<PaystackResult<{ refundId: number | null; status: string }>> {
  const result = await paystackRequest<Record<string, unknown>>('/refund', {
    method: 'POST',
    body: {
      transaction: input.reference,
      amount: input.amountKobo,
      currency: 'NGN',
      ...(input.merchantNote ? { merchant_note: input.merchantNote.slice(0, 200) } : {}),
      ...(input.customerNote ? { customer_note: input.customerNote.slice(0, 200) } : {}),
    },
  });
  if (!result.ok) return result;
  const id = Number(result.data?.id);
  return {
    ok: true,
    data: {
      refundId: Number.isFinite(id) && id > 0 ? id : null,
      status: String(result.data?.status || ''),
    },
  };
}

/**
 * Refunds already made on one transaction. Read before RETRYING a refund: if an
 * earlier attempt reached Paystack but our record of it failed to save, asking
 * again would refund the artist twice, and a partial refund on a multi-pitch
 * checkout would happily succeed a second time.
 */
export async function listPaystackRefunds(
  reference: string
): Promise<PaystackResult<Array<{ id: number | null; amountKobo: number; status: string }>>> {
  const result = await paystackRequest<Array<Record<string, unknown>>>('/refund', {
    query: { transaction: reference, currency: 'NGN' },
  });
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    ok: true,
    data: rows.map((row) => {
      const id = Number(row.id);
      return {
        id: Number.isFinite(id) && id > 0 ? id : null,
        amountKobo: Number(row.amount) || 0,
        status: String(row.status || ''),
      };
    }),
  };
}

export type ListedPaystackTransaction = {
  reference: string;
  status: string;
  amountKobo: number;
  currency: string;
  transactionId: number | null;
  paidAt: string | null;
};

/** Successful transactions in a window, one page at a time, for the daily
 *  reconcile. */
export async function listPaystackTransactions(input: {
  fromIso: string;
  toIso: string;
  page: number;
  perPage?: number;
}): Promise<PaystackResult<{ transactions: ListedPaystackTransaction[]; hasMore: boolean }>> {
  const perPage = input.perPage ?? 100;
  const result = await paystackRequest<Array<Record<string, unknown>>>('/transaction', {
    query: {
      status: 'success',
      from: input.fromIso,
      to: input.toIso,
      perPage,
      page: input.page,
    },
  });
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    ok: true,
    data: {
      transactions: rows.map((row) => {
        const id = Number(row.id);
        return {
          reference: String(row.reference || ''),
          status: String(row.status || ''),
          amountKobo: Number(row.amount) || 0,
          currency: String(row.currency || ''),
          transactionId: Number.isFinite(id) && id > 0 ? id : null,
          paidAt: typeof row.paid_at === 'string' ? row.paid_at : null,
        };
      }),
      hasMore: rows.length >= perPage,
    },
  };
}

// ─── saved cards ─────────────────────────────────────────────────────────────

/** The newest reusable card Paystack holds for a customer (by email), so a
 *  team that pays its plan by card can be charged for add-ons and credits
 *  without paying through a checkout again. Null when there is none. */
export async function findSavedCard(email: string): Promise<SavedCard | null> {
  const to = email.trim().toLowerCase();
  if (!to) return null;
  const result = await paystackRequest<{ email?: string; authorizations?: unknown[] }>(`/customer/${encodeURIComponent(to)}`);
  if (!result.ok) return null;
  const cards = Array.isArray(result.data?.authorizations) ? result.data.authorizations : [];
  for (const card of [...cards].reverse()) {
    const saved = savedCardFrom(card, result.data?.email || to);
    if (saved) return saved;
  }
  return null;
}

export type CardCharge = { status: string; reference: string; amountKobo: number };

/** Charge a saved card. 'success' is paid; anything else is not (yet). The
 *  answer is checked again with verifyPaystackTransaction before it counts. */
export async function chargeSavedCard(input: {
  card: SavedCard;
  amountKobo: number;
  reference: string;
  metadata: Record<string, unknown>;
}): Promise<PaystackResult<CardCharge>> {
  const result = await paystackRequest<{ status?: string; reference?: string; amount?: number }>(
    '/transaction/charge_authorization',
    {
      method: 'POST',
      body: {
        email: input.card.email,
        amount: input.amountKobo,
        currency: 'NGN',
        authorization_code: input.card.authorizationCode,
        reference: input.reference,
        metadata: input.metadata,
      },
      timeoutMs: 30_000,
    }
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      status: String(result.data?.status || ''),
      reference: String(result.data?.reference || input.reference),
      amountKobo: Number(result.data?.amount) || 0,
    },
  };
}
