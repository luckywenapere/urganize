import { describe, expect, it } from 'vitest';
import {
  SIGNUP_NUDGE_BODY,
  SIGNUP_NUDGE_PREVIEW,
  SIGNUP_NUDGE_SUBJECT,
  SIGNUP_NUDGE_URL,
  buildSignupNudgeRow,
  isSignupNudgeTooLate,
  shouldNudgeSignup,
  signupNudgeDedupeKey,
  signupNudgeWindow,
  type SignupNudgeFacts,
} from './signup-nudge';
import { planOutboxRun, readOutboxTemplate } from './outbox';

// The morning job runs at 09:00 Lagos, which is 08:00 UTC.
const NOW = new Date('2026-11-28T08:00:00Z');

function facts(over: Partial<SignupNudgeFacts> = {}): SignupNudgeFacts {
  return {
    email: 'tunde@example.com',
    role: 'artist-manager',
    // 27 Nov, 15:00 Lagos.
    createdAt: '2026-11-27T14:00:00Z',
    onboardingCompleted: false,
    inSomeoneElsesTeam: false,
    ...over,
  };
}

describe('who gets the email', () => {
  it('someone who made an account yesterday and has not finished sign-up', () => {
    expect(shouldNudgeSignup(facts(), NOW)).toBe(true);
  });

  it('yesterday is the Lagos day, from its midnight to the next', () => {
    const { from, to } = signupNudgeWindow(NOW);
    // Lagos is one hour ahead of UTC, so its midnight is 23:00 UTC the day before.
    expect(from.toISOString()).toBe('2026-11-26T23:00:00.000Z');
    expect(to.toISOString()).toBe('2026-11-27T23:00:00.000Z');
    expect(shouldNudgeSignup(facts({ createdAt: '2026-11-26T23:00:00Z' }), NOW)).toBe(true);
    expect(shouldNudgeSignup(facts({ createdAt: '2026-11-27T22:59:59Z' }), NOW)).toBe(true);
  });

  // The words say "yesterday". Nobody older is emailed, so turning this on
  // does not reach back to accounts made before it existed.
  it('nobody from before yesterday, and nobody from today', () => {
    expect(shouldNudgeSignup(facts({ createdAt: '2026-11-26T22:59:59Z' }), NOW)).toBe(false);
    expect(shouldNudgeSignup(facts({ createdAt: '2026-11-10T10:00:00Z' }), NOW)).toBe(false);
    expect(shouldNudgeSignup(facts({ createdAt: '2026-11-27T23:00:00Z' }), NOW)).toBe(false);
  });

  it('not someone who finished sign-up: the onboarding emails already reach them that morning', () => {
    expect(shouldNudgeSignup(facts({ onboardingCompleted: true }), NOW)).toBe(false);
  });

  it('not a playlist owner, and not someone invited to another person\'s team', () => {
    expect(shouldNudgeSignup(facts({ role: 'curator' }), NOW)).toBe(false);
    expect(shouldNudgeSignup(facts({ inSomeoneElsesTeam: true }), NOW)).toBe(false);
  });

  it('not an account with no address or no date', () => {
    expect(shouldNudgeSignup(facts({ email: '  ' }), NOW)).toBe(false);
    expect(shouldNudgeSignup(facts({ createdAt: null }), NOW)).toBe(false);
  });
});

describe('once per person', () => {
  it('the queue row is keyed by the person, so a second run queues nothing', () => {
    const first = buildSignupNudgeRow({ userId: 'u1', email: ' Tunde@Example.com ', name: ' Tunde Bello ', now: NOW });
    const again = buildSignupNudgeRow({ userId: 'u1', email: 'tunde@example.com', name: 'Tunde', now: new Date('2026-11-29T08:00:00Z') });
    expect(first?.dedupe_key).toBe(signupNudgeDedupeKey('u1'));
    expect(again?.dedupe_key).toBe(first?.dedupe_key);
    expect(first).toMatchObject({
      recipient: 'tunde@example.com',
      recipient_user_id: 'u1',
      template: 'signup_nudge',
      props: { recipientName: 'Tunde Bello' },
      batch_id: null,
      send_after: NOW.toISOString(),
    });
  });

  it('queues nothing for a blank address', () => {
    expect(buildSignupNudgeRow({ userId: 'u1', email: ' ', name: 'Tunde', now: NOW })).toBeNull();
  });
});

describe('the queue sends it', () => {
  it('reads the row as a signup_nudge', () => {
    expect(readOutboxTemplate({ template: 'signup_nudge', props: { recipientName: 'Tunde Bello' } })).toEqual({
      templateId: 'signup_nudge',
      props: { recipientName: 'Tunde Bello' },
    });
  });

  it('sends it the same morning, even while the onboarding sequence is switched off', () => {
    const row = { id: 'r1', recipient: 'tunde@example.com', batch_id: null, template: 'signup_nudge', send_after: NOW.toISOString() };
    const plan = planOutboxRun({ due: [row], sequenceEnabled: false, now: NOW, sentToday: 0, dailyLimit: 100, maxSends: 80 });
    expect(plan.send).toEqual([row]);
    expect(plan.cancelStale).toEqual([]);
  });

  // "You made your account yesterday" is only true on the morning it was queued.
  it('drops a row held back to a later morning, so it never says something untrue', () => {
    const row = { id: 'r1', recipient: 'tunde@example.com', batch_id: null, template: 'signup_nudge', send_after: NOW.toISOString() };
    const nextMorning = new Date('2026-11-29T08:00:00Z');
    expect(isSignupNudgeTooLate(row, NOW)).toBe(false);
    expect(isSignupNudgeTooLate(row, new Date('2026-11-28T22:00:00Z'))).toBe(false);
    expect(isSignupNudgeTooLate(row, nextMorning)).toBe(true);
    const plan = planOutboxRun({ due: [row], sequenceEnabled: true, now: nextMorning, sentToday: 0, dailyLimit: 100, maxSends: 80 });
    expect(plan.send).toEqual([]);
    expect(plan.cancelStale).toEqual([row]);
    // Other queued mail keeps its own, longer, rule.
    expect(isSignupNudgeTooLate({ template: 'onboarding_step', send_after: NOW.toISOString() }, nextMorning)).toBe(false);
  });
});

describe('the words Oyin picked (Option A, 27 Nov 2026)', () => {
  it('are the approved subject, preview and body', () => {
    expect(SIGNUP_NUDGE_SUBJECT).toBe('I saw you made an account yesterday');
    expect(SIGNUP_NUDGE_PREVIEW).toBe('You stopped before adding your music.');
    expect(SIGNUP_NUDGE_BODY.split('\n\n')).toEqual([
      'You made your Urganize account yesterday but did not add what you are working on.',
      'It is one short form. Type the song and say where it is now. If it is ready to come out, your plan is made at once.',
      `[Add my music](${SIGNUP_NUDGE_URL})`,
      'If something stopped you, reply and tell me. This comes straight to me.',
    ]);
  });

  it('link to the sign-up page, which opens the project form for an unfinished account', () => {
    expect(SIGNUP_NUDGE_URL.endsWith('/onboarding')).toBe(true);
  });

  it('keep the house rules: no em dash, no "get started", no "start free"', () => {
    const all = [SIGNUP_NUDGE_SUBJECT, SIGNUP_NUDGE_PREVIEW, SIGNUP_NUDGE_BODY].join('\n');
    expect(all).not.toMatch(/—|–/);
    expect(all).not.toMatch(/get started|start free/i);
  });
});
