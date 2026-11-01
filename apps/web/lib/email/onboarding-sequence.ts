// The onboarding sequence: five short founder notes over a new signup's first
// week (founder call, 2026-09-30, from the "warm up the domain" meeting notes).
// Pure, React-free and I/O-free: the copy, the schedule and the queue rows. The
// server half is sequence-server.ts; the template is OnboardingStepEmail.tsx.
//
// WHY THESE EMAILS EXIST. Urganize had no email going out beyond transactional
// mail, and a young sending domain earns its reputation from people opening and
// REPLYING. So the sequence is written to be replied to: day 1 asks the reader
// to mark it important, day 3 asks a yes-or-no question, day 7 asks how it is
// going. Plain founder-note register throughout (no buttons, no banner), which
// also reads as personal mail to spam filters.
//
// ALL FIVE EMAILS' COPY LIVES IN THIS FILE, so it can be read and changed in one
// place. The body is note-text (see note-text.ts): a blank line starts a
// paragraph and [words](url) is a link. The greeting ("Hey Ada,") and the
// sign-off are added by the template, not written here. The positioning and
// rollout-vocabulary guards scan this file, so it is held to the house rules:
// "rollout" for the work, "release" only as a date, never "workspace", and no em
// dashes (a test below checks the last two directly).
//
// SWITCHED OFF UNTIL THE COPY IS APPROVED: EMAIL_ONBOARDING_SEQUENCE=on turns it
// on. With it off, signup sends the old welcome note exactly as before and
// nothing is queued. Turning it off later also pauses anything already queued,
// because the sender checks it too.

import { APP_URL, FOUNDER_WHATSAPP_URL } from './links';
import { settingsDeepLink } from '../settings-nav';

/** Opens the Settings pop-up on the team section (the old /settings page is a
 *  redirect now, and settings-links-guard.test.ts keeps it that way). */
const INVITE_URL = `${APP_URL}${settingsDeepLink({ segment: 'team', section: 'teammates' })}`;

export type OnboardingStepKey = 'day1' | 'day2' | 'day3' | 'day5' | 'day7';

/** One picture of the screen a note talks about (#974, mock approved by the
 *  founder 2026-11-01). Drawn with Stageshow at 2x (936px) and shown at the
 *  email's 468px text width. Hosted as a static file on the app, because mail
 *  clients only show images from a URL. Images are off by default in many
 *  clients, so the words around it must make sense without it and the alt text
 *  says what it shows. It links where the note's own link goes. */
export type OnboardingStill = {
  src: string;
  alt: string;
  href: string;
  width: number;
  height: number;
  /** The paragraph (0-based, after the greeting) it follows. */
  afterParagraph: number;
};

export type OnboardingStep = {
  key: OnboardingStepKey;
  /** Day 1 is the signup day. */
  day: number;
  subject: string;
  /** The inbox preheader. Never a repeat of the subject or the opening line. */
  preview: string;
  body: string;
  /** Short label for the admin dashboard. */
  label: string;
  still?: OnboardingStill;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    key: 'day1',
    day: 1,
    label: 'Welcome and the story',
    subject: 'Welcome to Urganize, a note from Wena',
    preview: 'Why I built Urganize, and what to expect this week.',
    body: `Wena here. I’m the founder of Urganize, and I want to say thank you for signing up.

Urganize started with a problem I had myself. I was managing an artist, and there was no software built for it. I needed one place to share tasks, keep us both accountable and see how my artist’s career was going. Somewhere I could open and see everything about the music and the management at once. That place didn’t exist, so I built it.

Over the next week I’ll send you four short emails: how to get set up, one quick question, a look at your assistant UrgAns and a check-in to see how it’s going.

One small favour: if this landed in Promotions or Spam, please move it to your main inbox or mark it as important. That way the next few reach you.

If you get stuck, just reply. This comes straight to me.

When you’re ready, [open Urganize](${APP_URL}).`,
  },
  {
    key: 'day2',
    day: 2,
    label: 'Get set up',
    subject: 'Two things to do first',
    preview: 'Bring your plan up to date, then bring your team in.',
    body: `Here are the two things that make the biggest difference in your first week.

1. Bring your plan up to date. Open your rollout and tick off anything that’s already done, so it shows where you really are. [Open your rollout](${APP_URL}/dashboard)

2. Invite your artist or a teammate. Everyone sees the same plan and knows what’s theirs, so nobody has to chase anyone in a group chat. [Invite someone](${INVITE_URL})

That’s it for today. If anything is unclear, reply and tell me.`,
    still: {
      src: `${APP_URL}/images/email/onboarding-day2-plan.png`,
      alt: 'Your rollout in Urganize: two activities ticked off, the next one due Thursday, and your team on the plan.',
      href: `${APP_URL}/dashboard`,
      width: 936,
      height: 528,
      afterParagraph: 0,
    },
  },
  {
    key: 'day3',
    day: 3,
    label: 'A yes or no question',
    subject: 'Quick question, yes or no',
    preview: 'One word is all I need.',
    body: `Quick one. You only need to reply yes or no.

Are you putting music out in the next 30 days?

Your answer helps me help you. If it’s a yes, I’ll make sure you have everything you need for release day.

Just hit reply.`,
  },
  {
    key: 'day5',
    day: 5,
    label: 'Meet UrgAns',
    subject: 'Meet UrgAns, your assistant',
    preview: 'Ask it anything about your rollout.',
    body: `Inside Urganize there’s an assistant called UrgAns. Think of it as a teammate who already knows your plan.

You can ask it things like:
“What’s overdue this week?”
“Write a status update I can send to my artist.”
“Add a task to book the studio for Friday.”

It answers, and it can make changes for you. You stay in charge: before it does anything big, it checks with you first.

[Try UrgAns](${APP_URL}/dashboard/urgans)`,
    still: {
      src: `${APP_URL}/images/email/onboarding-day5-urgans.png`,
      alt: 'UrgAns answering “What’s overdue this week?” with two late activities, then asking “Move both to Friday?” before it changes them.',
      href: `${APP_URL}/dashboard/urgans`,
      width: 936,
      height: 528,
      afterParagraph: 2,
    },
  },
  {
    key: 'day7',
    day: 7,
    label: 'How is it going?',
    subject: 'How’s it going so far?',
    preview: 'One question, and I read every answer.',
    body: `You’ve had Urganize for a week now, and I’d love to know how it’s going.

What’s one thing that’s working for you, and one thing that isn’t? A single line is plenty. Just reply to this email.

I read every reply, and I use what you tell me to decide what to build next.

If you’d rather talk, [message me on WhatsApp](${FOUNDER_WHATSAPP_URL}).

Thanks for giving Urganize a go.`,
  },
];

export const ONBOARDING_STEP_KEYS: readonly OnboardingStepKey[] = ONBOARDING_STEPS.map((step) => step.key);

/** Day 1 is sent the moment someone finishes signing up; the rest wait in the
 *  outbox for the morning cron. */
export const QUEUED_ONBOARDING_STEP_KEYS: readonly OnboardingStepKey[] = ONBOARDING_STEP_KEYS.filter(
  (key) => key !== 'day1'
);

export function isOnboardingStepKey(value: unknown): value is OnboardingStepKey {
  return typeof value === 'string' && (ONBOARDING_STEP_KEYS as readonly string[]).includes(value);
}

export function getOnboardingStep(key: OnboardingStepKey): OnboardingStep {
  const step = ONBOARDING_STEPS.find((candidate) => candidate.key === key);
  if (!step) throw new Error(`Unknown onboarding step: ${key}`);
  return step;
}

/** Server-only switch. Only the literal word "on" turns it on, so a habit from
 *  the NEXT_PUBLIC_ flags ("true") cannot start emailing people by accident. */
export function isOnboardingSequenceEnabled(): boolean {
  return process.env.EMAIL_ONBOARDING_SEQUENCE?.trim() === 'on';
}

export const ONBOARDING_TEMPLATE_ID = 'onboarding_step' as const;
export const ONBOARDING_TRIGGER = 'onboarding_sequence';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Lagos is UTC+1 all year (no daylight saving), so a fixed offset is exact. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** Midnight in Lagos at the start of the Lagos day `date` falls in. */
export function lagosDayStart(date: Date): Date {
  const shifted = date.getTime() + LAGOS_OFFSET_MS;
  return new Date(shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS) - LAGOS_OFFSET_MS);
}

/**
 * When day N becomes due: the start of the (N-1)th Lagos calendar day after
 * signup. The morning cron (09:00 Lagos) then sends it, so "day 2" arrives the
 * next morning whatever time someone signed up. Measuring 24 hours from the
 * signup instead would make a late-evening signup wait a day and a half.
 */
export function onboardingDueAt(startedAt: Date, day: number): Date {
  return new Date(lagosDayStart(startedAt).getTime() + (day - 1) * DAY_MS);
}

export function onboardingDedupeKey(userId: string, key: OnboardingStepKey): string {
  return `onboarding:${userId}:${key}`;
}

export type OnboardingStepProps = {
  step: OnboardingStepKey;
  recipientName: string;
};

export type OnboardingOutboxRow = {
  recipient: string;
  recipient_user_id: string;
  template: typeof ONBOARDING_TEMPLATE_ID;
  props: OnboardingStepProps;
  trigger: string;
  batch_id: null;
  dedupe_key: string;
  send_after: string;
};

/** The four queued rows for one new signup. Empty for a blank address. */
export function buildOnboardingOutboxRows(input: {
  userId: string;
  email: string;
  name: string;
  startedAt: Date;
}): OnboardingOutboxRow[] {
  const recipient = input.email.trim().toLowerCase();
  if (!recipient) return [];
  return QUEUED_ONBOARDING_STEP_KEYS.map((key) => ({
    recipient,
    recipient_user_id: input.userId,
    template: ONBOARDING_TEMPLATE_ID,
    props: { step: key, recipientName: input.name.trim() },
    trigger: ONBOARDING_TRIGGER,
    batch_id: null,
    dedupe_key: onboardingDedupeKey(input.userId, key),
    send_after: onboardingDueAt(input.startedAt, getOnboardingStep(key).day).toISOString(),
  }));
}
