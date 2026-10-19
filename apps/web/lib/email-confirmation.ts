// Email confirmation for email/password sign-ups (URG-386, Oct 18, 2026).
//
// When the Supabase project requires confirmation (mailer_autoconfirm off),
// supabase.auth.signUp returns a user and NO session. Everything a sign-up
// would have done next (the onboarding rollout, a team invite, a curator
// link) has to wait until the person taps the link in the email, which very
// often opens in another tab, the Gmail app's own browser, or another device.
//
// This module is the browser half that survives that trip, and is pure enough
// to test without a DOM:
//
//   - the pending confirmation (which address, when it was sent, the first
//     name and rollout title the screens greet with, and the onboarding
//     answers to resume) lives in localStorage, so a reload or a new tab in
//     the same browser still knows it;
//   - a compact copy of the onboarding answers rides in the sign-up's
//     user_metadata (`onboarding_draft`), so a confirmation opened anywhere
//     can still build the rollout;
//   - the claim that decides which tab runs that build is taken once per
//     account (see claimEmailResume in email-confirmation-client.ts).
//
// With autoconfirm on (today's production) none of this runs: signUp returns
// a session and the old in-page hand-off carries on unchanged.

import type { OnboardingDraft } from './onboarding-draft';
import {
  isOnboardingPersona,
  isOnboardingPlanningPreference,
  isOnboardingWhereStuck,
} from './onboarding';
import { deriveOnboardingStage, normalizeReadyToday } from './onboarding-readiness';

/** Supabase's default per-address send interval (smtp_max_frequency = 60 s). */
export const RESEND_COOLDOWN_MS = 60_000;

/** How long a pending confirmation is remembered. The link itself lasts an hour; a resend makes a new one. */
export const PENDING_CONFIRMATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PENDING_KEY = 'urganize.email_confirmation.pending';

/** One-shot (sessionStorage): the callback just confirmed an email, so /onboarding shows "You're in". */
export const EMAIL_CONFIRMED_FLAG_KEY = 'urg:email-confirmed';

/** Query flag the callback adds when it hands a confirmed sign-up to /onboarding. */
export const EMAIL_CONFIRMED_PARAM = 'confirmed';

/** The Gmail search that finds the confirmation email, wherever it was filed. */
export const GMAIL_CONFIRMATION_SEARCH_URL =
  'https://mail.google.com/mail/u/0/#search/from%3Averify%40urganize.app+in%3Aanywhere';

export type PendingConfirmationKind = 'onboarding' | 'invite' | 'curator' | 'login';

export type OnboardingRoleForResume = 'artist' | 'artist-manager' | 'manager';

export type PendingConfirmation = {
  email: string;
  /** Epoch ms of the last send (sign-up or resend). Drives the resend cooldown. */
  sentAt: number;
  kind: PendingConfirmationKind;
  firstName?: string;
  releaseTitle?: string;
  /** Onboarding only: what the hand-off needs once the account is confirmed. */
  onboarding?: {
    role: OnboardingRoleForResume;
    draft: OnboardingDraft;
  };
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function local(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeEmail(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

/** Only Gmail gets an app button (v2 design): every other address gets the live-waiting line. */
export function isGmailAddress(email: string | null | undefined): boolean {
  const domain = normalizeEmail(email).split('@')[1] || '';
  return domain === 'gmail.com' || domain === 'googlemail.com';
}

/** "Ada Obi" -> "Ada". Empty when there is no usable name, so the hero drops it. */
export function firstNameOf(name: string | null | undefined): string {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first.slice(0, 40);
}

/** Milliseconds left before another link may be sent. */
export function resendCooldownLeft(sentAt: number | null | undefined, now: number): number {
  if (!sentAt || !Number.isFinite(sentAt)) return 0;
  return Math.max(0, RESEND_COOLDOWN_MS - (now - sentAt));
}

/** "0:42" */
export function formatCooldown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Where the confirmation link sends the browser. Must be on the Supabase redirect allow-list. */
export function emailRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/auth/callback`;
}

const isRole = (value: unknown): value is OnboardingRoleForResume =>
  value === 'artist' || value === 'artist-manager' || value === 'manager';

const isReleaseType = (value: unknown): value is NonNullable<OnboardingDraft['releaseType']> =>
  value === 'single' || value === 'ep' || value === 'album' || value === 'music_video';

/**
 * The onboarding answers in a compact, validated shape, short enough for
 * user_metadata (which also rides inside every access token). Unknown values
 * are dropped rather than trusted: this is read back from the account later.
 */
export type MetadataDraft = {
  v: 1;
  p?: string; // persona
  rt?: string; // releaseType
  t?: string; // title
  d?: string; // releaseDate
  a?: string; // artistName
  pp?: string; // planningPreference
  ws?: string[]; // whereStuck
  rd?: string[]; // readyToday
  r?: string; // role
};

export function toMetadataDraft(draft: OnboardingDraft, role: OnboardingRoleForResume): MetadataDraft {
  return {
    v: 1,
    ...(draft.persona ? { p: draft.persona } : {}),
    ...(draft.releaseType ? { rt: draft.releaseType } : {}),
    t: draft.title.trim().slice(0, 200),
    d: draft.releaseDate,
    a: draft.artistName.trim().slice(0, 120),
    pp: draft.planningPreference,
    ws: draft.whereStuck.slice(0, 10),
    rd: draft.readyToday.slice(0, 20),
    r: role,
  };
}

export function fromMetadataDraft(
  value: unknown
): { draft: OnboardingDraft; role: OnboardingRoleForResume } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MetadataDraft>;
  if (raw.v !== 1) return null;
  const title = typeof raw.t === 'string' ? raw.t.trim() : '';
  const releaseDate = typeof raw.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.d) ? raw.d : '';
  if (!title || !releaseDate || !isReleaseType(raw.rt)) return null;
  const readyToday = Array.isArray(raw.rd) ? normalizeReadyToday(raw.rd) : [];
  return {
    role: isRole(raw.r) ? raw.r : 'artist-manager',
    draft: {
      persona: isOnboardingPersona(raw.p) ? raw.p : null,
      releaseType: raw.rt,
      whereStuck: Array.isArray(raw.ws) ? raw.ws.filter(isOnboardingWhereStuck) : [],
      readyToday,
      stage: readyToday.length ? deriveOnboardingStage(readyToday) : null,
      title,
      releaseDate,
      artistName: typeof raw.a === 'string' ? raw.a.trim().slice(0, 120) : '',
      planningPreference: isOnboardingPlanningPreference(raw.pp) ? raw.pp : 'ai_recommendations',
    },
  };
}

function isDraftLike(value: unknown): value is OnboardingDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<OnboardingDraft>;
  return typeof draft.title === 'string' && typeof draft.releaseDate === 'string';
}

export function readPendingConfirmation(now = Date.now(), storage = local()): PendingConfirmation | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingConfirmation> | null;
    const email = normalizeEmail(parsed?.email);
    const sentAt = typeof parsed?.sentAt === 'number' ? parsed.sentAt : 0;
    if (!parsed || !email.includes('@') || !sentAt || now - sentAt > PENDING_CONFIRMATION_TTL_MS) {
      storage.removeItem(PENDING_KEY);
      return null;
    }
    const kind: PendingConfirmationKind =
      parsed.kind === 'invite' || parsed.kind === 'curator' || parsed.kind === 'login' ? parsed.kind : 'onboarding';
    const onboarding =
      parsed.onboarding && isRole(parsed.onboarding.role) && isDraftLike(parsed.onboarding.draft)
        ? { role: parsed.onboarding.role, draft: parsed.onboarding.draft }
        : undefined;
    return {
      email,
      sentAt,
      kind,
      ...(typeof parsed.firstName === 'string' && parsed.firstName ? { firstName: parsed.firstName } : {}),
      ...(typeof parsed.releaseTitle === 'string' && parsed.releaseTitle ? { releaseTitle: parsed.releaseTitle } : {}),
      ...(onboarding ? { onboarding } : {}),
    };
  } catch {
    return null;
  }
}

export function writePendingConfirmation(value: PendingConfirmation, storage = local()): void {
  if (!storage) return;
  try {
    storage.setItem(PENDING_KEY, JSON.stringify({ ...value, email: normalizeEmail(value.email) }));
  } catch {
    // Blocked or full: the screen still works for this page view.
  }
}

/** A resend restarts the cooldown without losing the rest of the record. */
export function markConfirmationResent(email: string, now = Date.now(), storage = local()): PendingConfirmation {
  const current = readPendingConfirmation(now, storage);
  const next: PendingConfirmation =
    current && current.email === normalizeEmail(email)
      ? { ...current, sentAt: now }
      : { email: normalizeEmail(email), sentAt: now, kind: current?.kind ?? 'login' };
  writePendingConfirmation(next, storage);
  return next;
}

export function clearPendingConfirmation(storage = local()): void {
  if (!storage) return;
  try {
    storage.removeItem(PENDING_KEY);
  } catch {
    // Already gone.
  }
}

/**
 * The error Supabase puts on a confirmation redirect it could not honour
 * (expired, already used). Read from the hash (implicit flow) or the query.
 */
export function readAuthRedirectError(href: string): { code: string; description: string } | null {
  try {
    const url = new URL(href);
    const hash = url.hash.startsWith('#') ? new URLSearchParams(url.hash.slice(1)) : new URLSearchParams();
    const pick = (key: string) => url.searchParams.get(key) || hash.get(key) || '';
    const code = pick('error_code');
    const error = pick('error');
    const description = pick('error_description');
    // Our own /auth?error=callback_* codes never reach the callback page, but
    // be strict anyway: only Supabase's shape (error + error_code, or a
    // description) counts.
    if (!code && !description) return null;
    if (!code && !error) return null;
    return { code: code || error, description };
  } catch {
    return null;
  }
}

/** Expired, already used, or otherwise dead confirmation links all read as "This link has expired." */
export function isDeadLinkError(error: { code: string; description: string } | null): boolean {
  if (!error) return false;
  const code = error.code.toLowerCase();
  const description = error.description.toLowerCase();
  // Supabase: error=access_denied&error_code=otp_expired&error_description=
  // "Email link is invalid or has expired". A cancelled Google consent is also
  // access_denied, so the generic code alone never counts.
  return code === 'otp_expired' || description.includes('email link') || description.includes('has expired');
}

/**
 * Did this session come from a confirmation link (rather than Google or a
 * password)? `type=signup` in the hash is the direct signal; auth-js clears
 * the hash as it stores the session, so the token's amr claim (otp) for an
 * email account is the fallback.
 */
export function isEmailLinkSignIn(input: {
  hashType: string | null | undefined;
  provider: string | null | undefined;
  amrMethods: string[];
}): boolean {
  if (input.hashType === 'signup' || input.hashType === 'email') return true;
  if (input.provider && input.provider !== 'email') return false;
  return input.amrMethods.includes('otp') || input.amrMethods.includes('email/signup');
}

/** Methods from a Supabase access token's amr claim. Never throws. */
export function amrMethodsFromAccessToken(accessToken: string | null | undefined): string[] {
  const claims = decodeJwtClaims(accessToken);
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return [];
  return amr
    .map((entry) => (entry && typeof entry === 'object' ? String((entry as { method?: unknown }).method || '') : String(entry || '')))
    .filter(Boolean);
}

export function decodeJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(
            Array.from(atob(padded))
              .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
              .join('')
          )
        : Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A `next` that stays on this site: one leading slash, no scheme-relative or backslash tricks. */
export function isSafeNextPath(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  // Control characters (tab/newline) are stripped by URL parsers and can turn "/\t/evil" into "//evil".
  if (/[\u0000-\u001f\\]/.test(value)) return false;
  return true;
}
