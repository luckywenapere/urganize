// One email, the next morning, to a person who made an account and stopped
// before adding their music (#1429, 28 Nov 2026; Oyin picked these words,
// "Option A", on 27 Nov). Pure: the words, who gets it, and the queue row.
// The server half is signup-nudge-server.ts; the template is
// templates/SignupNudgeEmail.tsx.
//
// WHY. Of 16 real accounts made from 3 to 26 Nov, 15 were seen on one day
// only, and the ones who stopped before finishing sign-up got no email at all:
// the onboarding sequence only starts when sign-up is finished. This is the
// way back for someone who stopped.
//
// WHO. Only an account made YESTERDAY (Lagos) that has still not finished
// sign-up. The words say "yesterday", so the window is exactly that day, and
// deploying this does not email anyone from before. Someone who finished
// sign-up, even by skipping, already gets the onboarding sequence the same
// morning, so they are left out: one email a morning, never two.
//
// ONCE. The queue row's dedupe_key is the person, so a second run, or a second
// morning, queues nothing.

import { APP_URL } from './links';
import { lagosDayStart } from './onboarding-sequence';

export const SIGNUP_NUDGE_TEMPLATE_ID = 'signup_nudge' as const;
export const SIGNUP_NUDGE_TRIGGER = 'signup_nudge';

export const SIGNUP_NUDGE_SUBJECT = 'I saw you made an account yesterday';
/** The inbox preheader. Not a repeat of the subject or the opening line. */
export const SIGNUP_NUDGE_PREVIEW = 'You stopped before adding your music.';

/** An unfinished account that opens this lands on "What are you working on?". */
export const SIGNUP_NUDGE_URL = `${APP_URL}/onboarding`;

/** Note-text (see note-text.ts). The greeting and the sign-off are the template's. */
export const SIGNUP_NUDGE_BODY = `You made your Urganize account yesterday but did not add what you are working on.

It is one short form. Type the song and say where it is now. If it is ready to come out, your plan is made at once.

[Add my music](${SIGNUP_NUDGE_URL})

If something stopped you, reply and tell me. This comes straight to me.`;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Yesterday in Lagos: from its midnight up to (not including) today's. */
export function signupNudgeWindow(now: Date): { from: Date; to: Date } {
  const to = lagosDayStart(now);
  return { from: new Date(to.getTime() - DAY_MS), to };
}

export type SignupNudgeFacts = {
  email: string | null | undefined;
  role: string | null | undefined;
  createdAt: string | null | undefined;
  onboardingCompleted: boolean;
  /** Invited to, or already in, a team somebody else owns. */
  inSomeoneElsesTeam: boolean;
};

/** Does this account get the email this morning? */
export function shouldNudgeSignup(facts: SignupNudgeFacts, now: Date): boolean {
  if (!String(facts.email || '').trim()) return false;
  // Finished sign-up (with music, or by skipping): the onboarding sequence has them.
  if (facts.onboardingCompleted) return false;
  // A playlist owner has no music to add.
  if (String(facts.role || '').trim().toLowerCase() === 'curator') return false;
  // Their next step is joining that team, not starting their own.
  if (facts.inSomeoneElsesTeam) return false;
  const created = Date.parse(String(facts.createdAt || ''));
  if (!Number.isFinite(created)) return false;
  const { from, to } = signupNudgeWindow(now);
  return created >= from.getTime() && created < to.getTime();
}

export function signupNudgeDedupeKey(userId: string): string {
  return `signup-nudge:${userId}`;
}

export type SignupNudgeOutboxRow = {
  recipient: string;
  recipient_user_id: string;
  template: typeof SIGNUP_NUDGE_TEMPLATE_ID;
  props: { recipientName: string };
  trigger: string;
  batch_id: null;
  dedupe_key: string;
  send_after: string;
};

/** The queue row for one person, or null for a blank address. */
export function buildSignupNudgeRow(input: { userId: string; email: string; name: string; now: Date }): SignupNudgeOutboxRow | null {
  const recipient = input.email.trim().toLowerCase();
  if (!recipient || !input.userId) return null;
  return {
    recipient,
    recipient_user_id: input.userId,
    template: SIGNUP_NUDGE_TEMPLATE_ID,
    props: { recipientName: input.name.trim() },
    trigger: SIGNUP_NUDGE_TRIGGER,
    batch_id: null,
    dedupe_key: signupNudgeDedupeKey(input.userId),
    send_after: input.now.toISOString(),
  };
}

/**
 * The words say "yesterday". A row the daily email limit held back to a later
 * morning would say something untrue, so it is dropped, not sent late.
 */
export function isSignupNudgeTooLate(row: { template: string; send_after: string }, now: Date): boolean {
  if (row.template !== SIGNUP_NUDGE_TEMPLATE_ID) return false;
  const queued = Date.parse(row.send_after);
  return Number.isFinite(queued) && lagosDayStart(now).getTime() > queued;
}
