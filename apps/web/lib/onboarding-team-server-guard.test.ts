import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { escapeLike } from './access-gate-server';

// #854 review: onboarding matches invites to the signed-in email with ILIKE.
// Unescaped, `_` and `%` in a sign-up address are wildcards, so
// "j_hn@acme.com" would see and join an invite sent to john@acme.com.
const source = readFileSync(join(__dirname, 'onboarding-team-server.ts'), 'utf8');

describe('onboarding invite matching', () => {
  it('escapes every email ILIKE', () => {
    const calls = source.match(/\.ilike\(\s*'email'\s*,[^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/escapeLike\(/);
  });

  it('escapeLike neutralises the wildcards', () => {
    expect(escapeLike('j_hn@acme.com')).toBe('j\\_hn@acme.com');
    expect(escapeLike('%@acme.com')).toBe('\\%@acme.com');
  });

  it('checks an artist scope before it can add an artist', () => {
    const create = source.slice(source.indexOf('export async function createOnboardingRecord'));
    expect(create.indexOf('artistScopeId')).toBeGreaterThan(-1);
    expect(create.indexOf('artistScopeId')).toBeLessThan(create.indexOf('resolveTeamArtist('));
  });
});
