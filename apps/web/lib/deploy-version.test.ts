import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { buildDeployVersion } from './deploy-version';

describe('buildDeployVersion', () => {
  it('answers the question it exists for: what is live, and from which commit', () => {
    // Before this there was no way to ask the deployed app what it was
    // running: CURRENT_VERSION was only reachable behind auth. "Is live up to
    // date" was a dashboard trip.
    const built = buildDeployVersion({
      version: '1.30.0',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
      commitRef: 'main',
      builtAt: '2026-09-07T22:00:00.000Z',
      environment: 'production',
    });
    expect(built.version).toBe('1.30.0');
    expect(built.commit).toBe('abcdef1');
    expect(built.branch).toBe('main');
    expect(built.builtAt).toBe('2026-09-07T22:00:00.000Z');
    expect(built.environment).toBe('production');
  });

  it('shortens the sha to what a person compares by eye', () => {
    // `git rev-parse --short` is 7 characters, so this is the form that can be
    // held next to it without counting digits.
    const built = buildDeployVersion({ commitSha: '0cabd27c6dade86590abddeaf7f73a1682f653ed' });
    expect(built.commit).toBe('0cabd27');
  });

  it('says unknown rather than guessing when Vercel gave us nothing', () => {
    // Local dev, or a self-hosted run. An endpoint that invents a commit is
    // worse than one that admits it does not know.
    const built = buildDeployVersion({});
    expect(built.commit).toBe('unknown');
    expect(built.branch).toBe('unknown');
    expect(built.environment).toBe('unknown');
  });

  it('never returns the full sha, at any input length', () => {
    for (const sha of ['abc', 'abcdefg', 'a'.repeat(40)]) {
      expect(buildDeployVersion({ commitSha: sha }).commit.length).toBeLessThanOrEqual(7);
    }
  });

  it('tolerates whitespace and rejects a blank value', () => {
    expect(buildDeployVersion({ commitSha: '  abcdef1234  ' }).commit).toBe('abcdef1');
    expect(buildDeployVersion({ commitSha: '   ' }).commit).toBe('unknown');
    expect(buildDeployVersion({ commitRef: '' }).branch).toBe('unknown');
  });

  it('carries no secret, no user and no id beyond the commit', () => {
    // This is a PUBLIC endpoint. The shape is the security boundary: anything
    // added here is added to something the whole internet can read.
    const built = buildDeployVersion({
      version: '1.30.0',
      commitSha: 'abcdef1234567890',
      commitRef: 'main',
      builtAt: '2026-09-07T22:00:00.000Z',
      environment: 'production',
    });
    expect(Object.keys(built).sort()).toEqual([
      'branch',
      'builtAt',
      'commit',
      'environment',
      'version',
    ]);
  });
});

describe('the /api/version routes', () => {
  it('are public: no auth helper, in either app', () => {
    // The whole point is that this answers from outside the app. A login here
    // would make it useless for the question it exists for, and "do not add
    // auth" is not something a comment can enforce.
    const sources = [
      readFileSync(join(__dirname, '..', 'app', 'api', 'version', 'route.ts'), 'utf8'),
      readFileSync(
        join(__dirname, '..', '..', 'homepage', 'app', 'api', 'version', 'route.ts'),
        'utf8'
      ),
    ];
    for (const raw of sources) {
      const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const forbidden of [
        'requireActiveAuthenticatedUser',
        'requireAuthenticatedAdmin',
        'getAuthenticatedUser',
        'requireActiveAccount',
        'verifyAdmin',
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('leak nothing beyond the five fields, in either app', () => {
    // A PUBLIC endpoint on a private repo. Reading a secret, a token, a user
    // or a database here would put it on the open internet.
    const sources = [
      readFileSync(join(__dirname, '..', 'app', 'api', 'version', 'route.ts'), 'utf8'),
      readFileSync(
        join(__dirname, '..', '..', 'homepage', 'app', 'api', 'version', 'route.ts'),
        'utf8'
      ),
      readFileSync(join(__dirname, 'deploy-version.ts'), 'utf8'),
    ];
    for (const raw of sources) {
      const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const forbidden of ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'SERVICE_ROLE', 'createAdminClient']) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('are never cached, or they would report a build that is no longer live', () => {
    for (const path of [
      join(__dirname, '..', 'app', 'api', 'version', 'route.ts'),
      join(__dirname, '..', '..', 'homepage', 'app', 'api', 'version', 'route.ts'),
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toMatch(/force-dynamic/);
      expect(source).toMatch(/no-store/);
    }
  });
});
