import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home reads only this team's rows from the tables every team shares
 * (2026-10-09, v1.92.10).
 *
 * The Shows read that started this guard was removed with Shows (2026-10-17).
 * The pitches read keeps the rule: scope by owner inside the query, never by
 * filtering a platform-wide capped read in memory.
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
  it('scopes the pitches read the same way', () => {
    const body = bodyOf('loadTeamPitches');
    expect(body).toContain(".in('owner_user_id', ownerIds)");
  });

  it('uses the team’s owner ids, falling back to the caller', () => {
    const body = bodyOf('loadTeamPitches');
    expect(body).toMatch(/access\.releaseOwnerIds\.length\s*\?\s*access\.releaseOwnerIds\s*:\s*\[user\.id\]/);
  });
});
