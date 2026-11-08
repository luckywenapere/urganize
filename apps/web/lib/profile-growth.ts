import { shareOrigin } from './app-hosts';
/**
 * The profile growth loop (2026-10-11): credits, then a claim, then a public
 * page at /p/{slug} that the person shares to get work, and that sends the
 * people who read it to sign up.
 *
 * PURE AND CLIENT-SAFE. Copy, the attribution carried through sign-up, and
 * every analytics payload for the loop are built here, so each one is tested
 * once and the routes and components only call it.
 *
 * Rules worth not undoing:
 *
 *  - NO NAMES, NO TEXT, NO CONTACTS in any payload. A slug is sent only for a
 *    page the person published themselves (claimed). An unclaimed page is a
 *    name a team typed, and that person has agreed to nothing, so its slug is
 *    never sent (null), even though the page itself is public.
 *  - COUNTS ONLY on the page. Nothing here names a release (founder rule for
 *    /p/{slug}, 2026-09-05).
 *  - THE SIGN-UP PARAMETER IS `from`, NEVER `ref`. `?ref=` already means a
 *    partner's referral code (lib/referral-intent.ts), and "PROFILE" is a valid
 *    code shape, so `?ref=profile` would be sent to /api/referrals/attach as a
 *    partner code.
 *  - Every parser fails toward NO attribution. A value we cannot read is
 *    dropped, never guessed.
 */

/** Which of the two calls on the page was tapped. */
export const PROFILE_CTA_KINDS = ['collaborator', 'manager'] as const;
export type ProfileCtaKind = (typeof PROFILE_CTA_KINDS)[number];

/** Where a sign-up came from, when it came from this loop. */
export const SIGNUP_SOURCES = ['profile', 'claim'] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

/** Ways a person shared their own page. */
export const PROFILE_SHARE_METHODS = ['copy', 'share', 'whatsapp', 'story'] as const;
export type ProfileShareMethod = (typeof PROFILE_SHARE_METHODS)[number];

/** Where they shared it from. */
export const PROFILE_SHARE_SURFACES = ['claim_done', 'own_page'] as const;
export type ProfileShareSurface = (typeof PROFILE_SHARE_SURFACES)[number];

// The same shape the database enforces on person_profiles.slug
// (20260905200000_person_directory.sql), so a made-up value never reaches a query.
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidProfileSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 2 && value.length <= 60 && SLUG_SHAPE.test(value);
}

const normalizeSlug = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const slug = value.trim().toLowerCase();
  return isValidProfileSlug(slug) ? slug : null;
};

export const isProfileCtaKind = (value: unknown): value is ProfileCtaKind =>
  typeof value === 'string' && (PROFILE_CTA_KINDS as readonly string[]).includes(value);

export const isSignupSource = (value: unknown): value is SignupSource =>
  typeof value === 'string' && (SIGNUP_SOURCES as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Copy. Fifth-grade words, no em dashes, "rollout" for the thing a team runs,
// never "ship". lib/profile-growth.test.ts holds the bar.
// ---------------------------------------------------------------------------

export const PROFILE_GROWTH_COPY = {
  /** The mark /pitch and /k already carry. */
  mark: 'Made with Urganize',
  collaboratorLead: 'Work in music?',
  collaboratorCta: 'Get your own page',
  managerLead: 'Manage artists?',
  managerCta: 'Run your rollouts on Urganize',
  shareHeading: 'Share your page',
  shareHint: 'Send it to people who might hire you.',
  copyLink: 'Copy link',
  copied: 'Link copied',
  share: 'Share',
  whatsapp: 'Send on WhatsApp',
  copyFailed: 'Could not copy. Press and hold the link to copy it.',
} as const;

/** The text that goes with a shared page. No name: the page carries it. */
export function profileShareText(url: string): string {
  return `See the work I have delivered: ${url}`;
}

export function profileWhatsappHref(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(profileShareText(url))}`;
}

/** The public page's address, on go.urganize.app when made on a product host
 *  (lib/app-hosts.ts). Null for a bad slug. */
export function publicProfileUrl(origin: string, slug: string): string | null {
  const clean = normalizeSlug(slug);
  if (!clean) return null;
  return `${shareOrigin(origin)}/p/${clean}`;
}

// ---------------------------------------------------------------------------
// The call to action. A plain link (no script) to a route that records the tap
// and sends the reader on to sign up with the attribution in the address.
// ---------------------------------------------------------------------------

export const PROFILE_CTA_ROUTE = '/api/public-profile/cta';

export function profileCtaHref(slug: string, cta: ProfileCtaKind): string {
  const params = new URLSearchParams({ slug, cta });
  return `${PROFILE_CTA_ROUTE}?${params.toString()}`;
}

/** Reads the CTA route's query. Null unless both values are ones we made. */
export function parseProfileCtaQuery(params: URLSearchParams): { slug: string; cta: ProfileCtaKind } | null {
  const slug = normalizeSlug(params.get('slug'));
  const cta = params.get('cta');
  if (!slug || !isProfileCtaKind(cta)) return null;
  return { slug, cta };
}

/** Where the CTA route sends the reader: sign up, carrying where they came from. */
export function profileSignupPath(input: { slug: string | null; cta: ProfileCtaKind | null }): string {
  const params = new URLSearchParams({ from: 'profile' });
  const slug = normalizeSlug(input.slug);
  if (slug) params.set('slug', slug);
  if (input.cta && isProfileCtaKind(input.cta)) params.set('cta', input.cta);
  return `/onboarding?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Sign-up attribution.
// ---------------------------------------------------------------------------

export type SignupAttribution = {
  source: SignupSource;
  slug: string | null;
  cta: ProfileCtaKind | null;
};

/** The attribution a sign-up page's query string carries, or null. */
export function parseSignupAttribution(search: string): SignupAttribution | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const source = params.get('from');
  if (!isSignupSource(source)) return null;
  const cta = params.get('cta');
  return {
    source,
    slug: normalizeSlug(params.get('slug')),
    cta: isProfileCtaKind(cta) ? cta : null,
  };
}

/** Re-validates a stored or posted attribution. Anything off is dropped. */
export function normalizeSignupAttribution(raw: unknown): SignupAttribution | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (!isSignupSource(record.source)) return null;
  return {
    source: record.source,
    slug: normalizeSlug(record.slug),
    cta: isProfileCtaKind(record.cta) ? record.cta : null,
  };
}

export const SIGNUP_ATTRIBUTION_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Inside the window. An unreadable or future time is stale. */
export function isSignupAttributionFresh(atMs: unknown, now: number): boolean {
  if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return false;
  const age = now - atMs;
  return age >= 0 && age <= SIGNUP_ATTRIBUTION_WINDOW_DAYS * DAY_MS;
}

/** A sign-up only counts for an account this new, so an old account cannot be
 *  tagged by opening a link later. */
export const SIGNUP_ATTRIBUTION_ACCOUNT_MAX_AGE_DAYS = 7;

export function isNewAccount(createdAt: string | null | undefined, now: number): boolean {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= 0 && age <= SIGNUP_ATTRIBUTION_ACCOUNT_MAX_AGE_DAYS * DAY_MS;
}

// ---------------------------------------------------------------------------
// Who is reading. A link preview (WhatsApp, X, Slack) fetches the page on the
// server when a link is pasted, before any person has read it. Counting those
// would tell the founder somebody looked at a page nobody opened.
// ---------------------------------------------------------------------------

const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|vercel-screenshot|headless|lighthouse|curl|wget|python-requests|httpclient|okhttp|go-http-client|node-fetch|axios|undici/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent || '').trim();
  if (!ua) return true;
  return BOT_PATTERN.test(ua);
}

/** Next's router prefetch and browser speculative loads are not a visit. */
export function isPrefetchRequest(get: (name: string) => string | null): boolean {
  if (get('next-router-prefetch')) return true;
  const purpose = (get('purpose') || get('sec-purpose') || '').toLowerCase();
  return purpose.includes('prefetch') || purpose.includes('prerender');
}

// ---------------------------------------------------------------------------
// Event payloads. Allowlists: only the fields named here ever leave.
// ---------------------------------------------------------------------------

export type PublicProfileViewedProperties = {
  /** Only for a claimed page. Null for an unclaimed one (see the header). */
  slug: string | null;
  claimed: boolean;
};

export function publicProfileViewedProperties(input: { slug: unknown; claimed: boolean }): PublicProfileViewedProperties {
  return { slug: input.claimed ? normalizeSlug(input.slug) : null, claimed: Boolean(input.claimed) };
}

export type PublicProfileCtaClickedProperties = {
  slug: string | null;
  claimed: boolean;
  cta: ProfileCtaKind;
};

export function publicProfileCtaClickedProperties(input: {
  slug: unknown;
  claimed: boolean;
  cta: ProfileCtaKind;
}): PublicProfileCtaClickedProperties {
  return { ...publicProfileViewedProperties(input), cta: input.cta };
}

export type SignupFromProfileProperties = {
  source: SignupSource;
  slug: string | null;
  cta: ProfileCtaKind | null;
};

export function signupFromProfileProperties(attribution: SignupAttribution): SignupFromProfileProperties {
  return { source: attribution.source, slug: attribution.slug, cta: attribution.cta };
}

export type ProfileLinkSharedProperties = {
  method: ProfileShareMethod;
  surface: ProfileShareSurface;
};

export function profileLinkSharedProperties(input: {
  method: ProfileShareMethod;
  surface: ProfileShareSurface;
}): ProfileLinkSharedProperties {
  return { method: input.method, surface: input.surface };
}

export type ClaimPageViewedProperties = {
  /** 'open' when the link works, else the reason it is closed. */
  state: 'open' | 'used' | 'revoked' | 'expired' | 'locked' | 'unavailable';
  signed_in: boolean;
  credits: number;
};

const CLAIM_CLOSED_STATES = ['used', 'revoked', 'expired', 'locked', 'unavailable'] as const;

export function claimPageViewedProperties(input: {
  ok: boolean;
  reason?: unknown;
  signedIn: boolean;
  credits?: number;
}): ClaimPageViewedProperties {
  const reason = (CLAIM_CLOSED_STATES as readonly string[]).includes(String(input.reason))
    ? (input.reason as ClaimPageViewedProperties['state'])
    : 'unavailable';
  const credits = Number.isFinite(input.credits) ? Math.max(0, Math.floor(input.credits as number)) : 0;
  return { state: input.ok ? 'open' : reason, signed_in: Boolean(input.signedIn), credits: input.ok ? credits : 0 };
}

export type ClaimCompletedProperties = { merged: boolean; proof: 'account_email' | 'typed_contact' | 'unknown' };

export function claimCompletedProperties(input: { merged?: unknown; proof?: unknown }): ClaimCompletedProperties {
  const proof = input.proof === 'account_email' || input.proof === 'typed_contact' ? input.proof : 'unknown';
  return { merged: input.merged === true, proof };
}

export type ProfilePublishedProperties = {
  visibility: 'public' | 'directory';
  surface: 'claim';
  has_bio: boolean;
};

export function profilePublishedProperties(input: { visibility: unknown; hasBio: boolean }): ProfilePublishedProperties | null {
  if (input.visibility !== 'public' && input.visibility !== 'directory') return null;
  return { visibility: input.visibility, surface: 'claim', has_bio: Boolean(input.hasBio) };
}

/** True only for a move from not published to published. */
export function isPublishTransition(before: unknown, after: unknown): boolean {
  const published = (value: unknown) => value === 'public' || value === 'directory';
  return !published(before) && published(after);
}

export type CreditSubmittedProperties = {
  roles: number;
  updated: boolean;
  has_phone: boolean;
};

export function creditSubmittedProperties(input: {
  roles: readonly unknown[];
  updated: boolean;
  phone: unknown;
}): CreditSubmittedProperties {
  return {
    roles: Array.isArray(input.roles) ? input.roles.length : 0,
    updated: Boolean(input.updated),
    has_phone: typeof input.phone === 'string' && input.phone.trim().length > 0,
  };
}

export type CreditLinkOpenedProperties = { state: 'open' | 'closed' };

export function creditLinkOpenedProperties(input: { closed: boolean }): CreditLinkOpenedProperties {
  return { state: input.closed ? 'closed' : 'open' };
}

// ---------------------------------------------------------------------------
// The growth events table (profile_growth_events). The kinds the admin funnel
// counts, written by the server only.
// ---------------------------------------------------------------------------

export const PROFILE_GROWTH_EVENT_KINDS = ['profile_view', 'cta_click', 'signup'] as const;
export type ProfileGrowthEventKind = (typeof PROFILE_GROWTH_EVENT_KINDS)[number];
