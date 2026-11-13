import { describe, expect, it } from 'vitest';
import {
  curatorInitials,
  earningsStatusLabel,
  isPitchDecided,
  isPitchWaiting,
  isProfileDirty,
  lagosMonthKey,
  monthEarnings,
  pitchMoneyLabel,
  pitchTimeLeft,
  playlistTag,
  publicPageLink,
  replyWindowLine,
  waitingCount,
  waitingOnReplies,
} from './curator-desk';
import type { CuratorPitch } from '@/types/pitching';
import type { CuratorEarningsRow } from '@/types/pitch-payments';

const NOW = new Date('2026-11-12T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString();

function pitch(over: Partial<CuratorPitch> & { id: string }): CuratorPitch {
  return {
    playlistName: 'Lagos After Dark',
    songTitle: 'Night Bus Home',
    artistName: 'Kemi Ade',
    pitcherName: 'Nadia',
    songUrl: 'https://example.com/song',
    songPlatform: 'spotify',
    note: '',
    status: 'new',
    reply: null,
    createdAt: '2026-11-10T12:00:00Z',
    updatedAt: '2026-11-10T12:00:00Z',
    ...over,
  };
}

function row(over: Partial<CuratorEarningsRow> & { id: string }): CuratorEarningsRow {
  return {
    songTitle: 'Lagos Rain',
    artistName: 'Kemi Ade',
    priceKobo: 500_000,
    shareKobo: 400_000,
    recoveryAppliedKobo: 0,
    sentToBankKobo: 400_000,
    status: 'paid',
    paidAt: '2026-11-06T10:00:00Z',
    ...over,
  };
}

describe('pitchMoneyLabel', () => {
  it('shows the share in naira for a paid pitch', () => {
    expect(pitchMoneyLabel(pitch({ id: 'a', paymentKind: 'paid', shareKobo: 425_000 }))).toBe('₦4,250');
  });
  it('says Free for a free pitch, never ₦0', () => {
    expect(pitchMoneyLabel(pitch({ id: 'a' }))).toBe('Free');
    expect(pitchMoneyLabel(pitch({ id: 'b', paymentKind: 'paid', shareKobo: 0 }))).toBe('Free');
    expect(pitchMoneyLabel(pitch({ id: 'c', paymentKind: 'paid', shareKobo: null }))).toBe('Free');
  });
});

describe('pitchTimeLeft', () => {
  it('is null for a pitch with no deadline', () => {
    expect(pitchTimeLeft(null, NOW)).toBeNull();
  });
  it('counts days when a day or more is left, not urgent', () => {
    expect(pitchTimeLeft(inHours(48), NOW)).toEqual({ label: '2 days left', urgent: false, closed: false });
    expect(pitchTimeLeft(inHours(24), NOW)).toEqual({ label: '1 day left', urgent: false, closed: false });
  });
  it('counts hours and is urgent under a day', () => {
    expect(pitchTimeLeft(inHours(23.5), NOW)).toEqual({ label: '23 hours left', urgent: true, closed: false });
    expect(pitchTimeLeft(inHours(1.2), NOW)).toEqual({ label: '1 hour left', urgent: true, closed: false });
    expect(pitchTimeLeft(inHours(0.5), NOW)).toEqual({ label: 'Under 1 hour left', urgent: true, closed: false });
  });
  it('says time ran out once the deadline passes', () => {
    expect(pitchTimeLeft(inHours(-1), NOW)).toEqual({ label: 'Time ran out', urgent: false, closed: true });
  });
});

describe('waiting pitches', () => {
  it('a decided pitch is not waiting', () => {
    expect(isPitchDecided(pitch({ id: 'a', status: 'added' }))).toBe(true);
    expect(isPitchWaiting(pitch({ id: 'a', status: 'passed' }), NOW)).toBe(false);
  });
  it('a free undecided pitch is waiting, listened or not', () => {
    expect(isPitchWaiting(pitch({ id: 'a' }), NOW)).toBe(true);
    expect(isPitchWaiting(pitch({ id: 'b', status: 'listened' }), NOW)).toBe(true);
  });
  it('a paid pitch whose window closed is not waiting', () => {
    expect(isPitchWaiting(pitch({ id: 'a', paymentKind: 'paid', responseDueAt: inHours(-2) }), NOW)).toBe(false);
    expect(isPitchWaiting(pitch({ id: 'b', paymentKind: 'paid', responseDueAt: inHours(5) }), NOW)).toBe(true);
  });
  it('waitingCount counts only waiting ones', () => {
    const list = [
      pitch({ id: 'a' }),
      pitch({ id: 'b', status: 'added' }),
      pitch({ id: 'c', paymentKind: 'paid', responseDueAt: inHours(-2) }),
    ];
    expect(waitingCount(list, NOW)).toBe(1);
  });
});

describe('waitingOnReplies', () => {
  it('adds the share of paid pitches still open', () => {
    const list = [
      pitch({ id: 'a', paymentKind: 'paid', shareKobo: 425_000, responseDueAt: inHours(10) }),
      pitch({ id: 'b', paymentKind: 'paid', shareKobo: 425_000, responseDueAt: inHours(30) }),
      pitch({ id: 'c', paymentKind: 'paid', shareKobo: 425_000, responseDueAt: inHours(-1) }),
      pitch({ id: 'd', paymentKind: 'paid', shareKobo: 425_000, status: 'added', responseDueAt: inHours(10) }),
      pitch({ id: 'e' }),
    ];
    expect(waitingOnReplies(list, NOW)).toEqual({ kobo: 850_000, count: 2 });
  });
});

describe('monthEarnings', () => {
  it('adds what reached the bank this Lagos month', () => {
    const rows = [
      row({ id: 'a', sentToBankKobo: 400_000, paidAt: '2026-11-06T10:00:00Z' }),
      row({ id: 'b', sentToBankKobo: 300_000, paidAt: '2026-11-01T00:30:00Z' }),
      row({ id: 'c', sentToBankKobo: 999_000, paidAt: '2026-10-31T22:00:00Z' }),
      row({ id: 'd', sentToBankKobo: 0, status: 'refunded', paidAt: '2026-11-07T10:00:00Z' }),
    ];
    // 2026-10-31T23:30Z is already 1 November in Lagos (UTC+1).
    rows.push(row({ id: 'e', sentToBankKobo: 100_000, paidAt: '2026-10-31T23:30:00Z' }));
    expect(monthEarnings(rows, NOW)).toEqual({ kobo: 800_000, count: 3 });
  });
  it('lagosMonthKey reads the month in Lagos', () => {
    expect(lagosMonthKey('2026-10-31T23:30:00Z')).toBe('2026-11');
    expect(lagosMonthKey('nope')).toBe('');
  });
});

describe('earningsStatusLabel', () => {
  it('names a paid row and a refunded row', () => {
    expect(earningsStatusLabel('paid')).toBe('Sent to your bank');
    expect(earningsStatusLabel('refunded')).toBe('Refunded');
    expect(earningsStatusLabel('refund_pending')).toBe('Refunded');
  });
});

describe('playlistTag', () => {
  it('writes a genre in sentence case', () => {
    expect(playlistTag('afrobeats')).toBe('Afrobeats');
    expect(playlistTag('alté soul')).toBe('Alté soul');
    expect(playlistTag('')).toBe('');
  });
});

describe('curatorInitials', () => {
  it('takes up to two initials, with a fallback', () => {
    expect(curatorInitials('Lagos After Dark')).toBe('LA');
    expect(curatorInitials('kemi')).toBe('K');
    expect(curatorInitials('   ')).toBe('?');
  });
});

describe('publicPageLink', () => {
  it('always uses the public host, never the page origin', () => {
    expect(publicPageLink('ayo-kalu')).toEqual({
      href: 'https://go.urganize.app/pitch/ayo-kalu',
      display: 'go.urganize.app/pitch/ayo-kalu',
    });
  });
  it('is null without a slug', () => {
    expect(publicPageLink('')).toBeNull();
    expect(publicPageLink(null)).toBeNull();
  });
});

describe('replyWindowLine', () => {
  it('names the real window in days', () => {
    expect(replyWindowLine(168)).toBe('Reply within 7 days or the artist gets their money back.');
    expect(replyWindowLine(24)).toBe('Reply within 1 day or the artist gets their money back.');
  });
});

describe('isProfileDirty', () => {
  const saved = { displayName: 'Ayo', bio: 'Hi' };
  it('is clean with no drafts or drafts that match', () => {
    expect(isProfileDirty(saved, null, null)).toBe(false);
    expect(isProfileDirty(saved, 'Ayo', 'Hi')).toBe(false);
  });
  it('is dirty once a field differs', () => {
    expect(isProfileDirty(saved, 'Ayo K', null)).toBe(true);
    expect(isProfileDirty(saved, null, 'Hello')).toBe(true);
  });
  it('is dirty when there is no saved profile and something was typed', () => {
    expect(isProfileDirty(null, 'Ayo', null)).toBe(true);
    expect(isProfileDirty(null, null, null)).toBe(false);
  });
});
