import { describe, expect, it } from 'vitest';
import { latestSeenByUser, sortTeamPresence, teamPresenceLabel, type TeamPresenceMember } from './team-presence';

const now = new Date('2026-10-15T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60 * 1000;

const member = (name: string, lastSeenAt: string | null): TeamPresenceMember => ({
  userId: name.toLowerCase(),
  name,
  initials: name.slice(0, 2).toUpperCase(),
  lastSeenAt,
});

describe('teamPresenceLabel', () => {
  it('says online inside the five minute window', () => {
    expect(teamPresenceLabel(ago(2 * MIN), now)).toBe('Online now');
  });
  it('says how long ago after that', () => {
    expect(teamPresenceLabel(ago(20 * MIN), now)).toBe('Active 20 min ago');
    expect(teamPresenceLabel(ago(3 * 60 * MIN), now)).toBe('Active 3 h ago');
    expect(teamPresenceLabel(ago(30 * 60 * MIN), now)).toBe('Active yesterday');
  });
  it('says not seen yet with no ping or a bad time', () => {
    expect(teamPresenceLabel(null, now)).toBe('Not seen yet');
    expect(teamPresenceLabel('nonsense', now)).toBe('Not seen yet');
  });
});

describe('latestSeenByUser', () => {
  it('keeps the newest row per person and skips empty ones', () => {
    const latest = latestSeenByUser([
      { user_id: 'a', last_seen_at: ago(60 * MIN) },
      { user_id: 'a', last_seen_at: ago(5 * MIN) },
      { user_id: 'b', last_seen_at: null },
      { user_id: null, last_seen_at: ago(MIN) },
    ]);
    expect(latest.get('a')).toBe(ago(5 * MIN));
    expect(latest.has('b')).toBe(false);
    expect(latest.size).toBe(1);
  });
});

describe('sortTeamPresence', () => {
  it('puts online people first, then most recent, then never seen by name', () => {
    const sorted = sortTeamPresence(
      [
        member('Zed', null),
        member('Ada', ago(3 * 60 * MIN)),
        member('Bola', ago(MIN)),
        member('Chi', ago(30 * MIN)),
        member('Ayo', null),
      ],
      now
    );
    expect(sorted.map((m) => m.name)).toEqual(['Bola', 'Chi', 'Ada', 'Ayo', 'Zed']);
  });
});
