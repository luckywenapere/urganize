import { describe, expect, it } from 'vitest';
import {
  MAX_OPEN_REQUESTS_PER_TEAM,
  RECIPIENT_REQUEST_FIELDS,
  WORK_REQUEST_STATUSES,
  canAnswerWorkRequest,
  describeRequestStatus,
  parseWorkRequestAnswer,
  parseWorkRequestInput,
  withinOpenRequestCap,
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

  it('lists exactly three statuses', () => {
    expect([...WORK_REQUEST_STATUSES]).toEqual(['new', 'interested', 'passed']);
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
  });
});
