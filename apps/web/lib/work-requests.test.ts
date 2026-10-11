import { describe, expect, it } from 'vitest';
import {
  MAX_OPEN_REQUESTS_PER_TEAM,
  RECIPIENT_REQUEST_FIELDS,
  SENDER_REQUEST_FIELDS,
  WORK_REQUEST_EXPIRY_DAYS,
  WORK_REQUEST_STATUSES,
  canAnswerWorkRequest,
  canReceiveRequests,
  describeRequestStatus,
  effectiveRequestStatus,
  isWorkRequestStale,
  parseWorkRequestAnswer,
  parseWorkRequestInput,
  refusalForClosedAvailability,
  revealsContact,
  withEffectiveStatus,
  withinOpenRequestCap,
  workRequestCutoff,
} from './work-requests';

describe('parseWorkRequestInput', () => {
  it('takes a role, a note and an optional release', () => {
    expect(
      parseWorkRequestInput({
        recipientUserId: 'u1',
        role: 'graphic_designer',
        note: 'Cover art for a single, out in six weeks.',
        releaseId: 'r1',
      })
    ).toEqual({
      input: {
        recipientUserId: 'u1',
        role: 'graphic_designer',
        note: 'Cover art for a single, out in six weeks.',
        releaseId: 'r1',
        kind: 'crew',
        askLinks: [],
        askReleaseNote: null,
        taskId: null,
      },
    });
  });

  it('treats a missing release as no release rather than an error', () => {
    // A manager can reach out from the directory itself, with no release in
    // hand. That is a legitimate ask, not a malformed one.
    const parsed = parseWorkRequestInput({ recipientUserId: 'u1', role: 'pr', note: 'Hello.' });
    expect('input' in parsed && parsed.input.releaseId).toBeNull();
  });

  it('refuses a role outside the vocabulary', () => {
    expect(parseWorkRequestInput({ recipientUserId: 'u1', role: 'wizard', note: 'Hi.' })).toHaveProperty('error');
  });

  it('refuses an empty note, because the ask IS the note', () => {
    expect(parseWorkRequestInput({ recipientUserId: 'u1', role: 'pr', note: '   ' })).toHaveProperty('error');
  });

  it('refuses a note past the cap rather than truncating one', () => {
    // Silently cutting somebody's sentence in half is worse than saying no.
    const parsed = parseWorkRequestInput({ recipientUserId: 'u1', role: 'pr', note: 'x'.repeat(301) });
    expect(parsed).toHaveProperty('error');
  });

  it('refuses a request with no recipient', () => {
    expect(parseWorkRequestInput({ role: 'pr', note: 'Hi.' })).toHaveProperty('error');
  });
});

describe('RECIPIENT_REQUEST_FIELDS', () => {
  it('does not carry the release', () => {
    // THE RULE THIS WHOLE TABLE IS SHAPED AROUND. An unannounced release title
    // must never reach somebody who is about to say no. The recipient sees who
    // asked, which role, and the note the sender chose to write.
    expect(RECIPIENT_REQUEST_FIELDS).not.toContain('release_id');
  });

  it('does not carry the sending team’s ids', () => {
    expect(RECIPIENT_REQUEST_FIELDS).not.toContain('workspace_id');
    expect(RECIPIENT_REQUEST_FIELDS).not.toContain('sender_user_id');
  });

  it('carries what the card actually renders', () => {
    for (const field of ['id', 'role', 'note', 'status', 'sender_name', 'sender_team', 'created_at']) {
      expect(RECIPIENT_REQUEST_FIELDS).toContain(field);
    }
  });
});

describe('canAnswerWorkRequest', () => {
  it('lets the recipient answer', () => {
    expect(canAnswerWorkRequest({ recipientUserId: 'u1', status: 'new' }, 'u1')).toBe(true);
  });

  it('refuses the sender, who must never move a status', () => {
    expect(canAnswerWorkRequest({ recipientUserId: 'u1', status: 'new' }, 'sender')).toBe(false);
  });

  it('refuses a second answer', () => {
    // One ask, one answer. Re-answering would rewrite history the sender has
    // already acted on.
    expect(canAnswerWorkRequest({ recipientUserId: 'u1', status: 'passed' }, 'u1')).toBe(false);
    expect(canAnswerWorkRequest({ recipientUserId: 'u1', status: 'interested' }, 'u1')).toBe(false);
  });
});

describe('parseWorkRequestAnswer', () => {
  it('takes a decision and an optional line back', () => {
    expect(parseWorkRequestAnswer({ status: 'interested', reply: 'Send the brief.' })).toEqual({
      answer: { status: 'interested', reply: 'Send the brief.' },
    });
  });

  it('allows an answer with no reply', () => {
    const parsed = parseWorkRequestAnswer({ status: 'passed' });
    expect('answer' in parsed && parsed.answer.reply).toBeNull();
  });

  it('refuses moving a request back to new', () => {
    // `new` is the state a request is born in, not an answer.
    expect(parseWorkRequestAnswer({ status: 'new' })).toHaveProperty('error');
  });

  it('refuses a status outside the vocabulary', () => {
    expect(parseWorkRequestAnswer({ status: 'maybe' })).toHaveProperty('error');
  });

  it('refuses closing a request as an answer', () => {
    // `expired` is something that happens to a request, never something a
    // person says. Letting a client send it would let the sender (or anybody
    // with a request id) close a waiting ask on the recipient's behalf.
    expect(parseWorkRequestAnswer({ status: 'expired' })).toHaveProperty('error');
  });

  it('lists exactly four statuses', () => {
    expect([...WORK_REQUEST_STATUSES]).toEqual(['new', 'interested', 'passed', 'expired']);
  });
});

describe('withinOpenRequestCap', () => {
  it('allows a team under the cap', () => {
    expect(withinOpenRequestCap(MAX_OPEN_REQUESTS_PER_TEAM - 1)).toBe(true);
  });

  it('refuses a team at the cap', () => {
    expect(withinOpenRequestCap(MAX_OPEN_REQUESTS_PER_TEAM)).toBe(false);
  });

  it('FAILS OPEN on a count it could not read', () => {
    // Every other counter in this codebase does the same. Wrongly refusing
    // somebody's first approach is worse than wrongly allowing an extra one.
    expect(withinOpenRequestCap(null)).toBe(true);
  });
});

describe('describeRequestStatus', () => {
  it('says what happened in plain words', () => {
    expect(describeRequestStatus('new')).toBe('Waiting');
    expect(describeRequestStatus('interested')).toBe('Interested');
    expect(describeRequestStatus('passed')).toBe('Passed');
    expect(describeRequestStatus('expired')).toBe('Closed');
  });
});

describe('revealsContact', () => {
  it('reveals on interested, which is the consent', () => {
    // Saying yes to working on somebody's release IS the permission to be
    // contacted. There is no separate opt-in, because a second question after
    // "I am interested" is a question nobody expects and most would ignore.
    expect(revealsContact('interested')).toBe(true);
  });

  it('reveals nothing on passed', () => {
    // Somebody who said no has agreed to nothing. This is the whole reason
    // contact is not simply attached to every profile.
    expect(revealsContact('passed')).toBe(false);
  });

  it('reveals nothing while a request is still waiting', () => {
    expect(revealsContact('new')).toBe(false);
  });

  it('reveals nothing once a request has closed unanswered', () => {
    // Nobody agreed to anything. A closed ask is not a yes.
    expect(revealsContact('expired')).toBe(false);
  });

  it('covers every status, so a new one cannot default to revealing', () => {
    for (const status of WORK_REQUEST_STATUSES) {
      expect(typeof revealsContact(status)).toBe('boolean');
    }
  });
});

describe('SENDER_REQUEST_FIELDS', () => {
  it('carries the release, unlike the recipient’s list', () => {
    // The asymmetry is the design: the sender needs to know which release they
    // asked for, and the recipient must never see it.
    expect(SENDER_REQUEST_FIELDS).toContain('release_id');
    expect(RECIPIENT_REQUEST_FIELDS).not.toContain('release_id');
  });

  it('carries the recipient so their answer can be attributed', () => {
    expect(SENDER_REQUEST_FIELDS).toContain('recipient_user_id');
    expect(SENDER_REQUEST_FIELDS).toContain('status');
    expect(SENDER_REQUEST_FIELDS).toContain('reply');
  });

  it('carries no contact column, because contact is not stored on the row', () => {
    // Contact is resolved at read time and only for an answered-interested
    // request. A column here would mean a stored copy that outlives the
    // consent that revealed it.
    expect(SENDER_REQUEST_FIELDS.some((field) => /email|phone|contact/.test(field))).toBe(false);
  });
});

const NOW = new Date('2026-10-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe('the 7 day close', () => {
  it('is seven days', () => {
    expect(WORK_REQUEST_EXPIRY_DAYS).toBe(7);
  });

  it('puts the cutoff exactly seven days back', () => {
    expect(workRequestCutoff(NOW)).toBe('2026-10-13T12:00:00.000Z');
  });

  it('leaves a request younger than seven days open', () => {
    expect(isWorkRequestStale({ status: 'new', createdAt: daysAgo(6.9) }, NOW)).toBe(false);
  });

  it('closes a request older than seven days', () => {
    expect(isWorkRequestStale({ status: 'new', createdAt: daysAgo(7.1) }, NOW)).toBe(true);
  });

  it('treats exactly seven days as still open', () => {
    // The sweep and the routes both write `created_at < cutoff`, so a request
    // made exactly seven days ago is the last moment it can still be answered.
    expect(isWorkRequestStale({ status: 'new', createdAt: daysAgo(7) }, NOW)).toBe(false);
  });

  it('never closes an answered request, however old', () => {
    expect(isWorkRequestStale({ status: 'interested', createdAt: daysAgo(40) }, NOW)).toBe(false);
    expect(isWorkRequestStale({ status: 'passed', createdAt: daysAgo(40) }, NOW)).toBe(false);
  });

  it('does not close a request whose date it cannot read', () => {
    // An unreadable date is not evidence the request is old. Closing somebody's
    // ask on a guess is the wrong way to be wrong.
    expect(isWorkRequestStale({ status: 'new', createdAt: 'not a date' }, NOW)).toBe(false);
    expect(isWorkRequestStale({ status: 'new', createdAt: null }, NOW)).toBe(false);
  });

  it('reads a stale waiting request as closed before the sweep has run', () => {
    // So the product is right the moment this ships, and between sweeps, and
    // while the migration is not yet applied.
    expect(effectiveRequestStatus('new', daysAgo(8), NOW)).toBe('expired');
    expect(effectiveRequestStatus('new', daysAgo(2), NOW)).toBe('new');
  });

  it('leaves every other status as it is', () => {
    expect(effectiveRequestStatus('interested', daysAgo(40), NOW)).toBe('interested');
    expect(effectiveRequestStatus('passed', daysAgo(40), NOW)).toBe('passed');
    expect(effectiveRequestStatus('expired', daysAgo(1), NOW)).toBe('expired');
  });

  it('stops the recipient answering a request that has closed', () => {
    const base = { recipientUserId: 'u1', status: 'new' as const };
    expect(canAnswerWorkRequest({ ...base, createdAt: daysAgo(3) }, 'u1', NOW)).toBe(true);
    expect(canAnswerWorkRequest({ ...base, createdAt: daysAgo(8) }, 'u1', NOW)).toBe(false);
    expect(canAnswerWorkRequest({ recipientUserId: 'u1', status: 'expired' }, 'u1', NOW)).toBe(false);
  });
});

describe('Not taking work', () => {
  it('refuses a request to somebody who has closed their availability', () => {
    expect(canReceiveRequests('closed')).toBe(false);
  });

  it('allows a request to open and selective people', () => {
    expect(canReceiveRequests('open')).toBe(true);
    expect(canReceiveRequests('selective')).toBe(true);
  });

  it('fails open on a value it does not recognise', () => {
    // Availability is a free-text column with a CHECK. An unknown value is a
    // data problem, and refusing every request to that person is the wrong
    // way to handle one.
    expect(canReceiveRequests(null)).toBe(true);
    expect(canReceiveRequests('on holiday')).toBe(true);
  });

  it('says why in plain words', () => {
    const copy = refusalForClosedAvailability('Ada');
    expect(copy).toContain('Ada');
    expect(copy.toLowerCase()).toContain('not taking work');
    expect(copy).not.toMatch(/\u2014/);
  });
});

describe('withEffectiveStatus', () => {
  it('rewrites a stale waiting row to closed and leaves the rest alone', () => {
    const rows = [
      { id: 'a', status: 'new', created_at: daysAgo(8) },
      { id: 'b', status: 'new', created_at: daysAgo(1) },
      { id: 'c', status: 'interested', created_at: daysAgo(30) },
    ];
    const out = withEffectiveStatus(rows, NOW);
    expect(out.map((row) => row.status)).toEqual(['expired', 'new', 'interested']);
  });

  it('does not change the rows it was given', () => {
    const rows = [{ id: 'a', status: 'new', created_at: daysAgo(8) }];
    withEffectiveStatus(rows, NOW);
    expect(rows[0].status).toBe('new');
  });

  it('keeps every other field on the row', () => {
    const out = withEffectiveStatus([{ id: 'a', status: 'new', created_at: daysAgo(9), note: 'Hi.' }], NOW);
    expect(out[0]).toMatchObject({ id: 'a', note: 'Hi.' });
  });
});
