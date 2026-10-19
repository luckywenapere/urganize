// Browser-only side of email confirmation (URG-386): resend, and the one-tab
// claim on the onboarding resume. The pure parts live in email-confirmation.ts.

import { supabase } from '@/lib/supabase/client';
import {
  emailRedirectUrl,
  fromMetadataDraft,
  markConfirmationResent,
  normalizeEmail,
  readPendingConfirmation,
  type OnboardingRoleForResume,
  type PendingConfirmation,
} from './email-confirmation';
import type { OnboardingDraft } from './onboarding-draft';

export type ResendOutcome = 'sent' | 'rate_limited' | 'failed';

/** Sends a fresh confirmation link. A rate limit is not an error the person needs to read. */
export async function resendConfirmationEmail(email: string): Promise<{ outcome: ResendOutcome; pending: PendingConfirmation | null }> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) return { outcome: 'failed', pending: null };
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalized,
      options: { emailRedirectTo: emailRedirectUrl(window.location.origin) },
    });
    if (error) {
      const status = (error as { status?: number }).status;
      const code = String((error as { code?: string }).code || '');
      if (status === 429 || code === 'over_email_send_rate_limit' || /rate limit|seconds/i.test(error.message)) {
        // Keep the cooldown running from now; nothing alarming to show.
        return { outcome: 'rate_limited', pending: markConfirmationResent(normalized) };
      }
      return { outcome: 'failed', pending: null };
    }
    return { outcome: 'sent', pending: markConfirmationResent(normalized) };
  } catch {
    return { outcome: 'failed', pending: null };
  }
}

const CLAIM_KEY = 'urganize.email_resume.claimed';
const LOCK_NAME = 'urg-email-resume';

type LockManagerLike = {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
};

async function withResumeLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManagerLike }).locks : undefined;
  if (locks && typeof locks.request === 'function') {
    try {
      return await locks.request(LOCK_NAME, fn);
    } catch {
      // Fall through to an unlocked run; the claim marker below still guards.
    }
  }
  return fn();
}

function readClaim(): string {
  try {
    return window.localStorage.getItem(CLAIM_KEY) || '';
  } catch {
    return '';
  }
}

function writeClaim(userId: string): void {
  try {
    window.localStorage.setItem(CLAIM_KEY, userId);
  } catch {
    // Blocked storage: the metadata clear below is the cross-tab guard then.
  }
}

/** True when another tab (or an earlier visit) in this browser already took this account's resume. */
export function emailResumeClaimedHere(userId: string): boolean {
  return Boolean(userId) && readClaim() === userId;
}

export type EmailResume = { draft: OnboardingDraft; role: OnboardingRoleForResume; firstName?: string };

/**
 * Takes the onboarding resume for a just-confirmed account, at most once.
 * Exactly one tab, in one browser, gets a non-null answer: the Web Locks API
 * serialises the tabs, the localStorage marker remembers the winner, and the
 * draft copy in user_metadata is cleared (another device reading it later
 * finds nothing). Null means there is nothing to build, or someone else is
 * building it.
 */
export async function claimEmailResume(userId: string): Promise<EmailResume | null> {
  if (!userId) return null;
  return withResumeLock(async () => {
    if (readClaim() === userId) return null;

    const pending = readPendingConfirmation();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.id !== userId) return null;
    const metadata = (user.user_metadata || {}) as Record<string, unknown>;

    const local = pending?.onboarding && pending.email === normalizeEmail(user.email) ? pending.onboarding : null;
    const fromMetadata = fromMetadataDraft(metadata.onboarding_draft);
    // The metadata copy is the account's own record of an unfinished
    // onboarding: when another device already consumed it, it is null, and a
    // local copy alone must not build a second rollout.
    const metadataConsumed = metadata.onboarding_draft === null;
    const source = metadataConsumed ? null : local ?? fromMetadata;
    if (!source) return null;

    writeClaim(userId);
    if (metadata.onboarding_draft !== undefined && metadata.onboarding_draft !== null) {
      await Promise.race([
        supabase.auth.updateUser({ data: { onboarding_draft: null } }).catch(() => undefined),
        new Promise((resolve) => window.setTimeout(resolve, 3000)),
      ]);
    }
    const firstName = pending?.firstName;
    return { draft: source.draft, role: source.role, ...(firstName ? { firstName } : {}) };
  });
}

/**
 * The in-page (autoconfirm) path never needs the metadata copy, so it is
 * dropped as soon as the hand-off starts. Best-effort and bounded.
 */
export async function dropMetadataDraft(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const metadata = (data.session?.user?.user_metadata || {}) as Record<string, unknown>;
    if (metadata.onboarding_draft === undefined || metadata.onboarding_draft === null) return;
    await Promise.race([
      supabase.auth.updateUser({ data: { onboarding_draft: null } }).catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Harmless if it stays: the resume also requires an unfinished onboarding.
  }
}
