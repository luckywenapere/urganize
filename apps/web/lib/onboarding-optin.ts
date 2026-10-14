/**
 * "Stay on top of your next move": the push + email opt-in step in onboarding
 * (URG-251 Part 2, 2026-10-14; founder-approved).
 *
 * The person is still anonymous on this step, so nothing can be saved to their
 * profile yet. The two choices are held client-side and handed over once the
 * account exists, the way lib/referral-intent.ts carries a partner code:
 *
 *  - LOCALSTORAGE, so the choice survives the Google OAuth round trip (the
 *    browser leaves for Google and comes back to /onboarding), a reload, and a
 *    closed tab that signs up later.
 *  - BOTH OFF BY DEFAULT. Nothing is opted in unless the person taps it.
 *  - PUSH PERMISSION IS ASKED ONLY ON THE TOGGLE TAP, never on step load. A
 *    browser hands out one permission prompt per origin, forever, so it is
 *    spent only on a person who asked for it (see lib/push-prompt.ts). The tap
 *    asks the OS; the subscription itself is made after signup, when there is
 *    an account to attach it to, and only if the permission was granted.
 *  - Once this step has been shown, the in-app soft ask (PushPermissionPrompt)
 *    stays quiet on this device: the person already answered.
 *
 * Email consent is marketing email only (digest, tips, offers). Transactional
 * email (invites, password resets, deadline reminders) is unaffected.
 *
 * Everything here is best-effort and never throws.
 */

export type OnboardingOptInChoices = {
  push: boolean;
  email: boolean;
};

export const DEFAULT_OPT_IN_CHOICES: OnboardingOptInChoices = { push: false, email: false };

const OPT_IN_KEY = 'urganize.onboarding.opt-in';
const PUSH_ASKED_KEY = 'urganize.push-prompt.onboarding-shown';
/** Choices older than this are about a sign-up that never happened. */
export const OPT_IN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Pure: a stored record back to choices, or null when absent, stale or unreadable. */
export function parseOptInChoices(raw: string | null, now: number): OnboardingOptInChoices | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { push?: unknown; email?: unknown; at?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) return null;
    const age = now - parsed.at;
    if (age < 0 || age > OPT_IN_WINDOW_MS) return null;
    // Anything but a literal true is off: consent is never inferred.
    return { push: parsed.push === true, email: parsed.email === true };
  } catch {
    return null;
  }
}

export function readOptInChoices(now: number = Date.now()): OnboardingOptInChoices | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseOptInChoices(window.localStorage.getItem(OPT_IN_KEY), now);
  } catch {
    return null;
  }
}

export function saveOptInChoices(choices: OnboardingOptInChoices, now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      OPT_IN_KEY,
      JSON.stringify({ push: choices.push === true, email: choices.email === true, at: now })
    );
  } catch {
    // Blocked storage: the choice is lost and both stay off, the safe default.
  }
}

export function clearOptInChoices(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(OPT_IN_KEY);
  } catch {
    // Already gone or blocked.
  }
}

/** The opt-in step was shown on this device: the in-app soft ask stays away. */
export function markPushAskedInOnboarding(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PUSH_ASKED_KEY, String(now));
  } catch {
    // Blocked storage: the soft ask may show once later, which is harmless.
  }
}

export function wasPushAskedInOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage.getItem(PUSH_ASKED_KEY));
  } catch {
    return false;
  }
}

export type OptInAttachDeps = {
  /** Current permission on this device, read without prompting. */
  getPermission: () => Promise<'default' | 'granted' | 'denied'>;
  /** Subscribe this device and save it to the account. Never prompts when granted. */
  enablePush: () => Promise<unknown>;
  /** Save the email choice to the profile. */
  saveEmailConsent: (consent: boolean) => Promise<boolean>;
};

export type OptInAttachResult = {
  push: 'enabled' | 'skipped' | 'not_granted' | 'failed';
  email: 'saved' | 'skipped' | 'failed';
};

/**
 * Hand the held choices to the new account. Push is subscribed only when the
 * person turned it on AND the permission is already granted (their tap asked),
 * so this can never open a permission prompt by itself. Email is saved either
 * way once the step was shown, so an explicit "off" is recorded too.
 */
export async function attachOptInChoices(
  choices: OnboardingOptInChoices | null,
  deps: OptInAttachDeps
): Promise<OptInAttachResult> {
  const result: OptInAttachResult = { push: 'skipped', email: 'skipped' };
  if (!choices) return result;

  if (choices.push) {
    try {
      const permission = await deps.getPermission();
      if (permission !== 'granted') {
        result.push = 'not_granted';
      } else {
        await deps.enablePush();
        result.push = 'enabled';
      }
    } catch {
      result.push = 'failed';
    }
  }

  try {
    result.email = (await deps.saveEmailConsent(choices.email)) ? 'saved' : 'failed';
  } catch {
    result.email = 'failed';
  }
  return result;
}

/** POST the email choice. Never throws; false on any failure. */
export async function saveMarketingEmailConsent(token: string, consent: boolean): Promise<boolean> {
  try {
    const response = await fetch('/api/user/marketing-consent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consent, source: 'onboarding' }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
