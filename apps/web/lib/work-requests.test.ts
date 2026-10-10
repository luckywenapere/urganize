import { describe, expect, it } from 'vitest';
import {
  LEGACY_RECIPIENT_REQUEST_FIELDS,
  LEGACY_SENDER_REQUEST_FIELDS,
  MAX_HIRES_PER_TEAM,
  MAX_OPEN_REQUESTS_PER_TEAM,
  RECIPIENT_REQUEST_FIELDS,
  SENDER_REQUEST_FIELDS,
  WORK_REQUEST_EXPIRY_DAYS,
  WORK_REQUEST_LINKS_MAX,
  WORK_REQUEST_LINK_MAX_CHARS,
  WORK_REQUEST_NEXT_RELEASE_MAX_CHARS,
  WORK_REQUEST_STATUSES,
  canAnswerWorkRequest,
  canReceiveRequests,
  describeRequestStatus,
  effectiveRequestStatus,
  isWorkRequestStale,
  parseWorkRequestAnswer,
  parseWorkRequestInput,
  refusalForClosedAvailability,
  requiresNextRelease,
  revealsContact,
  startKindFor,
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
        nextRelease: null,
        links: [],
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
      answer: { status: 'interested', reply: 'Send the brief.', start: false },
    });
  });

  // ACCEPT AND START puts somebody on a team, which is a bigger yes than
  // "interested", so it has to be asked for outright and can never ride on a pass.
  it('only honours start on a yes, and only when it is exactly true', () => {
    const yes = parseWorkRequestAnswer({ status: 'interested', start: true });
    expect('answer' in yes && yes.answer.start).toBe(true);

    const pass = parseWorkRequestAnswer({ status: 'passed', start: true });
    expect('answer' in pass && pass.answer.start).toBe(false);

    for (const loose of ['true', 1, 'yes', {}, [], null]) {
      const parsed = parseWorkRequestAnswer({ status: 'interested', start: loose });
      expect('answer' in parsed && parsed.answer.start).toBe(false);
    }
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

describe('the fuller request (directory spec, step 2)', () => {
  const base = { recipientUserId: 'u1', role: 'graphic_designer', note: 'Cover art.' };

  it('carries a next release as text and trims it', () => {
    const parsed = parseWorkRequestInput({ ...base, nextRelease: '  Midnight EP  ' });
    expect('input' in parsed && parsed.input.nextRelease).toBe('Midnight EP');
  });

  it('refuses a next release past its cap rather than cutting it', () => {
    const parsed = parseWorkRequestInput({
      ...base,
      nextRelease: 'x'.repeat(WORK_REQUEST_NEXT_RELEASE_MAX_CHARS + 1),
    });
    expect(parsed).toHaveProperty('error');
    expect(
      parseWorkRequestInput({ ...base, nextRelease: 'x'.repeat(WORK_REQUEST_NEXT_RELEASE_MAX_CHARS) })
    ).toHaveProperty('input');
  });

  // An artist asking a MANAGER is the case the spec leads with, and a manager
  // cannot judge a request that does not say what is being released.
  it('requires a next release when the job is a manager, and only then', () => {
    expect(requiresNextRelease('manager')).toBe(true);
    for (const role of ['producer', 'graphic_designer', 'pr', 'booking_agent'] as const) {
      expect(requiresNextRelease(role)).toBe(false);
    }
    const missing = parseWorkRequestInput({ recipientUserId: 'u1', role: 'manager', note: 'Hi.' });
    expect(missing).toEqual({ error: 'Say what you are releasing next.' });
    expect(
      parseWorkRequestInput({ recipientUserId: 'u1', role: 'manager', note: 'Hi.', nextRelease: '   ' })
    ).toHaveProperty('error');
    expect(
      parseWorkRequestInput({ recipientUserId: 'u1', role: 'manager', note: 'Hi.', nextRelease: 'My EP' })
    ).toHaveProperty('input');
  });

  describe('links', () => {
    it('keeps up to three http and https links, trimmed and without repeats', () => {
      const parsed = parseWorkRequestInput({
        ...base,
        links: [' https://a.example/demo ', 'http://b.example', 'https://a.example/demo', ''],
      });
      expect('input' in parsed && parsed.input.links).toEqual([
        'https://a.example/demo',
        'http://b.example',
      ]);
    });

    it('takes a single link given as a string', () => {
      const parsed = parseWorkRequestInput({ ...base, links: 'https://a.example' });
      expect('input' in parsed && parsed.input.links).toEqual(['https://a.example']);
    });

    // A link is something somebody else's browser will follow. javascript: and
    // data: are the two that could hurt a reader rather than merely look wrong.
    it('refuses any link that is not http or https', () => {
      for (const link of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.example', 'mailto:a@b.co', 'not a url']) {
        expect(parseWorkRequestInput({ ...base, links: [link] })).toHaveProperty('error');
      }
    });

    it('refuses a fourth link and an overlong one', () => {
      const four = ['https://a.example', 'https://b.example', 'https://c.example', 'https://d.example'];
      expect(parseWorkRequestInput({ ...base, links: four })).toEqual({
        error: `Add up to ${WORK_REQUEST_LINKS_MAX} links.`,
      });
      expect(parseWorkRequestInput({ ...base, links: four.slice(0, 3) })).toHaveProperty('input');
      const long = `https://a.example/${'x'.repeat(WORK_REQUEST_LINK_MAX_CHARS)}`;
      expect(parseWorkRequestInput({ ...base, links: [long] })).toHaveProperty('error');
    });

    it('refuses a link that is not text', () => {
      expect(parseWorkRequestInput({ ...base, links: [42] })).toHaveProperty('error');
    });

    it('does not count a blank line as a link', () => {
      const parsed = parseWorkRequestInput({ ...base, links: ['', '  ', ''] });
      expect('input' in parsed && parsed.input.links).toEqual([]);
    });
  });

  it('keeps an activity only when there is a rollout to put it on', () => {
    // A task id means something on a rollout and nothing without one. Carrying it
    // alone would let a request point at work it cannot name.
    const withRelease = parseWorkRequestInput({ ...base, releaseId: 'r1', taskId: 't1' });
    expect('input' in withRelease && withRelease.input.taskId).toBe('t1');
    const without = parseWorkRequestInput({ ...base, taskId: 't1' });
    expect('input' in without && without.input.taskId).toBeNull();
  });

  describe('what a yes can start', () => {
    it('starts a rollout for a manager, whether or not a release is attached', () => {
      expect(startKindFor({ role: 'manager', releaseId: null })).toBe('manager_rollout');
      expect(startKindFor({ role: 'manager', releaseId: 'r1' })).toBe('manager_rollout');
    });

    it('puts a creative on the rollout they were asked about', () => {
      expect(startKindFor({ role: 'producer', releaseId: 'r1' })).toBe('hire_join');
    });

    it('starts nothing for a plain ask with no rollout behind it', () => {
      expect(startKindFor({ role: 'producer', releaseId: null })).toBeNull();
    });
  });

  describe('the recipient never sees the rollout', () => {
    it('carries what the sender chose to write, and still no rollout or team id', () => {
      expect(RECIPIENT_REQUEST_FIELDS).toContain('next_release');
      expect(RECIPIENT_REQUEST_FIELDS).toContain('links');
      for (const forbidden of ['release_id', 'task_id', 'shared_release_id', 'workspace_id', 'sender_user_id', 'started_at']) {
        expect(RECIPIENT_REQUEST_FIELDS).not.toContain(forbidden);
      }
    });

    it('lets the sender see the rollout their yes started', () => {
      for (const field of ['next_release', 'links', 'task_id', 'shared_release_id', 'started_at', 'release_id']) {
        expect(SENDER_REQUEST_FIELDS).toContain(field);
      }
    });
  });

  describe('falling back before the migration is applied', () => {
    it('drops exactly the new columns and keeps every old one', () => {
      const added = ['next_release', 'links', 'task_id', 'shared_release_id', 'started_at'];
      for (const field of LEGACY_RECIPIENT_REQUEST_FIELDS) {
        expect(RECIPIENT_REQUEST_FIELDS).toContain(field);
        expect(added).not.toContain(field);
      }
      for (const field of LEGACY_SENDER_REQUEST_FIELDS) {
        expect(SENDER_REQUEST_FIELDS).toContain(field);
        expect(added).not.toContain(field);
      }
      expect(RECIPIENT_REQUEST_FIELDS.length - LEGACY_RECIPIENT_REQUEST_FIELDS.length).toBe(2);
      expect(SENDER_REQUEST_FIELDS.length - LEGACY_SENDER_REQUEST_FIELDS.length).toBe(5);
    });
  });

  it('caps how many hires one team can have', () => {
    expect(MAX_HIRES_PER_TEAM).toBe(10);
  });
});