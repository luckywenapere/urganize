import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home reads only this team's rows from the tables every team shares
 * (2026-10-09, v1.92.10).
 *
 * `loadVisibleShows` read the events table with no owner filter, took the first
 * 100 shows in the 30-day window across EVERY team, and only then filtered by
 * access in memory. So the cap was shared by the whole platform: once other
 * teams held 100 shows between them, a team's own next show and its waiting DJ
 * links silently fell off Home. `GET /api/events` and the pitches read already
 * scoped in the query; this holds Home to the same rule.
 */

const source = readFileSync(join(process.cwd(), 'lib/home-server.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The source of one top-level async function, by name. */
function bodyOf(name: string): string {
  const start = source.indexOf(`async function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const next = source.indexOf('\nasync function ', start + 10);
  const other = source.indexOf('\nexport async function ', start + 10);
  const ends = [next, other].filter((i) => i > -1);
  return source.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('Home reads only the team’s own rows from shared tables', () => {
  it('scopes the shows read by owner inside the query', () => {
    const body = bodyOf('loadVisibleShows');
    const read = body.slice(body.indexOf('.from(EVENTS_TABLE)'));
    expect(read).toContain(".in('owner_user_id', ownerIds)");
    // The scope comes before the cap, so the cap applies to this team's shows.
    expect(read.indexOf(".in('owner_user_id'")).toBeLessThan(read.indexOf('.limit('));
  });

  it('keeps the in-memory access check on top of the scope', () => {
    expect(bodyOf('loadVisibleShows')).toContain('decideReleaseAccess(');
  });

  it('scopes the pitches read the same way', () => {
    const body = bodyOf('loadTeamPitches');
    expect(body).toContain(".in('owner_user_id', ownerIds)");
  });

  it('uses the team’s owner ids, falling back to the caller', () => {
    const body = bodyOf('loadVisibleShows');
    expect(body).toMatch(/access\.releaseOwnerIds\.length\s*\?\s*access\.releaseOwnerIds\s*:\s*\[user\.id\]/);
  });
});
