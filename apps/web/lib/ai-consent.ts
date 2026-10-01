/**
 * Permission to send a person's words to an outside AI (2026-10-01).
 *
 * Apple's rule 5.1.2(i) says an app must say clearly, and ask first, before it
 * sends personal data to a third-party AI. UrgAns, voice, rollout planning,
 * status updates and press-kit drafting all do. This is the shared, client-safe
 * half: the flag, what counts as "agreed", the refusal a route sends, and the
 * one line that recognises it. Nothing here touches the database.
 *
 * The server is the gate (lib/ai-consent-server.ts); the screen only collects
 * the answer. A route that refuses sends 403 with `code: 'ai_consent_required'`,
 * and the browser's fetch hook turns that into the consent screen.
 */
export const AI_CONSENT_ERROR_CODE = 'ai_consent_required';
export const AI_CONSENT_REFUSAL_MESSAGE = 'Turn on AI to use this.';

/** The browser event the 403 hook fires so the consent screen opens. */
export const AI_CONSENT_EVENT = 'urganize:ai-consent-required';

/**
 * Off by default, so nothing changes for anyone until it is switched on. Read
 * as a literal `process.env` access: Next only inlines `NEXT_PUBLIC_*` when it
 * can see the whole name.
 */
export function isAiConsentEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_AI_CONSENT === 'true';
}

/** True only for a real timestamp. Null, empty and junk all mean "not agreed". */
export function hasAiConsent(consentAt: string | null | undefined): boolean {
  if (typeof consentAt !== 'string') return false;
  const trimmed = consentAt.trim();
  if (!trimmed) return false;
  return !Number.isNaN(Date.parse(trimmed));
}

export function aiConsentRefusalBody(): { error: string; code: typeof AI_CONSENT_ERROR_CODE } {
  return { error: AI_CONSENT_REFUSAL_MESSAGE, code: AI_CONSENT_ERROR_CODE };
}

/**
 * Is this response the server saying "ask for AI permission first"? 403 is the
 * status on purpose: 402 would redirect the whole page to the paywall (the
 * fetch hook in lib/access-redirect.ts), and this is not about payment.
 */
export function isAiConsentRefusal(status: number, payload: unknown): boolean {
  if (status !== 403) return false;
  if (typeof payload !== 'object' || payload === null) return false;
  return (payload as { code?: unknown }).code === AI_CONSENT_ERROR_CODE;
}

/** What the consent screen says. One place, so the screen and the Settings row agree. */
export const AI_CONSENT_COPY = {
  title: 'Turn on AI in Urganize?',
  intro:
    'UrgAns, voice, rollout planning and status updates use AI from outside companies.',
  sends:
    'When you use them, Urganize sends the words you type or say, and details of the rollouts you ask about, to our AI partners. Today that is OpenAI, through a service called RodiumAi.',
  limits:
    'They use it only to answer you, and they do not train their models on it. Your uploaded files are never sent.',
  choice: 'You can say no. The rest of Urganize works without AI. You can change this any time in Settings.',
  agree: 'Agree',
  decline: 'Not now',
  settingsTitle: 'AI features',
  settingsOn: 'UrgAns and other AI features are on. They send what you ask about to our AI partners.',
  settingsOff: 'AI features are off. Turn them on to use UrgAns, voice and rollout planning.',
  declined: 'AI is off, so I can only run quick commands. You can turn it on in Settings.',
} as const;
