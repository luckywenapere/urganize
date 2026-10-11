import { describe, expect, it } from 'vitest';
import type { LimitVerdict } from './entitlements';
import {
  decideSharedRollout,
  decideTaskLink,
  sharedRolloutTitle,
} from './work-request-collab';
import {
  ASK_RELEASE_NOTE_MAX_CHARS,
  MAX_ASK_LINKS,
  RECIPIENT_REQUEST_FIELDS,
  SENDER_REQUEST_FIELDS,
  decideAnswerEffect,
  parseAskLinks,
  parseWorkRequestInput,
  revealsAskReleaseNote,
} from './work-requests';

const ok: LimitVerdict = { allowed: true, limit: null, current: 0, remaining: null };
const blocked = (key: 'seats' | 'artists' | 'active_releases', message: string): LimitVerdict => ({
  allowed: false,
  key,
  limit: 1,
  current: 1,
  message,
  upgradeTo: 'manager',
});

const base = {
  teamRole: 'owner',
  existingMember: null,
  rosterArtistId: null,
  seats: ok,
  artists: ok,
  releases: ok,
} as const;

describe('decideSharedRollout', () => {
  it('adds the artist, the roster entry and the rollout when nothing is there yet', () => {
    expect(decideSharedRollout({ ...base })).toEqual({ ok: true, addMember: true, createArtist: true });
  });

  it('lets an admin take somebody on, and refuses a plain member and a guest', () => {
    expect(decideSharedRollout({ ...base, teamRole: 'admin' }).ok).toBe(true);
    for (const teamRole of ['member', 'guest', null]) {
      const plan = decideSharedRollout({ ...base, teamRole });
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.block.code).toBe('not_team_manager');
    }
  });

  it('refuses when the team has no seat, with the existing plain message plus a next step', () => {
    const plan = decideSharedRollout({
      ...base,
      seats: blocked('seats', 'Your Solo plan has 1 seat.'),
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.block.code).toBe('seat_limit');
      expect(plan.block.message).toContain('Your Solo plan has 1 seat.');
      expect(plan.block.message).toContain('Upgrade');
    }
  });

  it('does not charge a second seat for somebody already on the team', () => {
    const plan = decideSharedRollout({
      ...base,
      existingMember: { scopeArtistId: null },
      seats: blocked('seats', 'full'),
    });
    expect(plan).toEqual({ ok: true, addMember: false, createArtist: true });
  });

  it('does not touch the artist ceiling when the roster already has them', () => {
    const plan = decideSharedRollout({
      ...base,
      rosterArtistId: 'a1',
      artists: blocked('artists', 'full'),
    });
    expect(plan).toEqual({ ok: true, addMember: true, createArtist: false });
  });

  it('refuses a new roster artist past the ceiling, and a new rollout past its own', () => {
    const artist = decideSharedRollout({ ...base, artists: blocked('artists', 'x') });
    expect(!artist.ok && artist.block.code).toBe('artist_limit');
    const rollout = decideSharedRollout({ ...base, releases: blocked('active_releases', 'x') });
    expect(!rollout.ok && rollout.block.code).toBe('rollout_limit');
  });

  it('will not move somebody already limited to a different artist', () => {
    const plan = decideSharedRollout({
      ...base,
      existingMember: { scopeArtistId: 'other' },
      rosterArtistId: 'a1',
    });
    expect(!plan.ok && plan.block.code).toBe('scoped_elsewhere');
  });

  it('accepts somebody already limited to this same artist', () => {
    const plan = decideSharedRollout({
      ...base,
      existingMember: { scopeArtistId: 'a1' },
      rosterArtistId: 'a1',
    });
    expect(plan).toEqual({ ok: true, addMember: false, createArtist: false });
  });

  it('fails OPEN on a check that could not be made', () => {
    expect(
      decideSharedRollout({ ...base, seats: null, artists: null, releases: null }).ok
    ).toBe(true);
  });
});

describe('decideTaskLink', () => {
  const task = { releaseId: 'r1', assignedPersonId: null };
  it('links an open task on the release the ask was made for', () => {
    expect(decideTaskLink({ task, requestReleaseId: 'r1' })).toBe('link');
  });
  it('leaves a missing task, a moved task and a taken task alone', () => {
    expect(decideTaskLink({ task: null, requestReleaseId: 'r1' })).toBe('task_missing');
    expect(decideTaskLink({ task, requestReleaseId: 'r2' })).toBe('task_mismatch');
    expect(decideTaskLink({ task, requestReleaseId: null })).toBe('task_mismatch');
    expect(
      decideTaskLink({ task: { ...task, assignedPersonId: 'p9' }, requestReleaseId: 'r1' })
    ).toBe('already_taken');
  });
});

describe('sharedRolloutTitle', () => {
  it('names the rollout for the artist, and survives a blank name', () => {
    expect(sharedRolloutTitle('  Dorian ')).toBe('Dorian rollout');
    expect(sharedRolloutTitle('   ')).toBe('Untitled rollout');
  });
});

describe('parseAskLinks', () => {
  it('keeps up to three links, adds https to a bare one and drops duplicates', () => {
    expect(parseAskLinks(['open.spotify.com/artist/1', 'https://a.fm/x', 'https://a.fm/x'])).toEqual({
      links: ['https://open.spotify.com/artist/1', 'https://a.fm/x'],
    });
  });
  it('refuses scripts and other schemes, because these render as links in an inbox', () => {
    expect(parseAskLinks(['javascript:alert(1)'])).toHaveProperty('error');
    expect(parseAskLinks(['data:text/html,x'])).toHaveProperty('error');
    expect(parseAskLinks(['mailto:a@b.co'])).toHaveProperty('error');
    // Has a real host, so only the scheme check can refuse it.
    expect(parseAskLinks(['ftp://files.example.com/a'])).toHaveProperty('error');
  });
  it('refuses a fourth link and a link that is not a web address', () => {
    expect(parseAskLinks(['a.co', 'b.co', 'c.co', 'd.co'])).toHaveProperty('error');
    expect(MAX_ASK_LINKS).toBe(3);
    expect(parseAskLinks(['not a url'])).toHaveProperty('error');
    expect(parseAskLinks(['https://localhost'])).toHaveProperty('error');
  });
  it('treats nothing as no links', () => {
    expect(parseAskLinks(undefined)).toEqual({ links: [] });
    expect(parseAskLinks(['', '  '])).toEqual({ links: [] });
  });
});

describe('parseWorkRequestInput: the artist to manager ask', () => {
  const manager = {
    recipientUserId: 'u1',
    role: 'manager',
    kind: 'manager',
    note: 'I need somebody to run my next single.',
    askLinks: ['open.spotify.com/artist/1'],
    askReleaseNote: 'A single, out in spring',
  };
  it('carries links and the next release line', () => {
    const parsed = parseWorkRequestInput(manager);
    expect('input' in parsed && parsed.input.kind).toBe('manager');
    expect('input' in parsed && parsed.input.askLinks).toEqual(['https://open.spotify.com/artist/1']);
    expect('input' in parsed && parsed.input.askReleaseNote).toBe('A single, out in spring');
  });
  it('is only for the manager role, like the CHECK on the table', () => {
    expect(parseWorkRequestInput({ ...manager, role: 'producer' })).toHaveProperty('error');
  });
  it('refuses a next release line past its cap', () => {
    expect(
      parseWorkRequestInput({ ...manager, askReleaseNote: 'x'.repeat(ASK_RELEASE_NOTE_MAX_CHARS + 1) })
    ).toHaveProperty('error');
  });
  it('drops the structured ask and the task from a crew request', () => {
    const parsed = parseWorkRequestInput({
      recipientUserId: 'u1',
      role: 'graphic_designer',
      note: 'Cover art.',
      askLinks: ['a.co'],
      askReleaseNote: 'secret',
      taskId: 't1',
    });
    expect('input' in parsed && parsed.input.askLinks).toEqual([]);
    expect('input' in parsed && parsed.input.askReleaseNote).toBeNull();
    expect('input' in parsed && parsed.input.taskId).toBe('t1');
  });
  it('never lets a manager ask carry a task', () => {
    const parsed = parseWorkRequestInput({ ...manager, taskId: 't1' });
    expect('input' in parsed && parsed.input.taskId).toBeNull();
  });
});

describe('the release privacy rule survives the new columns', () => {
  it('keeps the next release line, the task and the rollout off the recipient side', () => {
    for (const field of ['ask_release_note', 'task_id', 'accepted_release_id', 'release_id']) {
      expect(RECIPIENT_REQUEST_FIELDS).not.toContain(field);
    }
  });
  it('puts them on the sender side, and the links on both', () => {
    for (const field of ['ask_release_note', 'task_id', 'accepted_release_id']) {
      expect(SENDER_REQUEST_FIELDS).toContain(field);
    }
    expect(RECIPIENT_REQUEST_FIELDS).toContain('ask_links');
  });
  it('reveals the next release line only once they said yes', () => {
    expect(revealsAskReleaseNote('interested')).toBe(true);
    for (const status of ['new', 'passed', 'expired'] as const) {
      expect(revealsAskReleaseNote(status)).toBe(false);
    }
  });
});

describe('decideAnswerEffect', () => {
  it('starts a shared rollout for a manager ask and links a task for a crew ask with one', () => {
    expect(decideAnswerEffect({ kind: 'manager', taskId: null, status: 'interested' })).toBe('start_share');
    expect(decideAnswerEffect({ kind: 'crew', taskId: 't1', status: 'interested' })).toBe('assign_task');
  });
  it('does nothing for a pass or a plain crew ask', () => {
    expect(decideAnswerEffect({ kind: 'manager', taskId: null, status: 'passed' })).toBe('none');
    expect(decideAnswerEffect({ kind: 'crew', taskId: 't1', status: 'passed' })).toBe('none');
    expect(decideAnswerEffect({ kind: 'crew', taskId: null, status: 'interested' })).toBe('none');
  });
});
