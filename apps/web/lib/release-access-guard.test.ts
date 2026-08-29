import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Release-scoped SCENE route groups must gate through the shared team-aware
// access pair, never a local owner-only check.
//
// Why this exists: eight owner-only `ensureReleaseOwnership` copies (one
// shared + seven local clones) accumulated across the scene route groups
// while the workspace showed those releases to every member — so a teammate
// could see a release everywhere and get "Release not found." inside any
// scene (the founder's 2026-08-29 Collect-metadata report). Each clone's
// docstring justified the copy on module-hygiene grounds, never as an access
// decision. This test is what stops clone #9: a comment could not, this can.
//
// SCOPE IS AN EXPLICIT LIST, deliberately not the whole [releaseId] tree:
// route.ts (the release row's own PATCH/DELETE), archive and schedule keep
// owner-only checks by RECORDED decision ("the release object itself stays
// the owner's to change"), collaborators is caller-less legacy, plan is
// deferred (flag off in prod; its draft rows are owner-keyed in 8 places),
// and tasks/task-groups already run their own team-aware path. Adding a NEW
// scene route group therefore requires consciously enlisting it here.
//
// Mutation-tested (all three, 2026-08-29): re-adding a local
// `ensureReleaseOwnership` to a swept _shared fails the ban; renaming a
// route's helper call to a fresh local checker fails the usage check; a
// COMMENT mentioning the banned name does not fail (the stripper works).
//
// Modelled on lib/account-export.test.ts (comment-strip before matching) and
// lib/schema-fallback-guard.test.ts (walk + positive control that guards the
// guard).

const APP_ROOT = join(__dirname, '..');
const RELEASE_ROUTES_ROOT = join(APP_ROOT, 'app/api/releases/[releaseId]');

/** The swept scene route groups. Enlisting a new group here is a conscious
 * decision — see the header. */
const TEAM_ACCESS_GROUPS = [
  'metadata',
  'credits',
  'assets',
  'song',
  'cover-art',
  'epk',
  'capture',
  'recap',
  'generate-status',
  'content-calendars',
  'content-posts',
];

const BANNED = /ensureReleaseOwnership|ensureOwnedRelease/;
const REQUIRED = /ensureReleaseTeam(Read|Write)Access/;

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Comments are stripped before matching — prose legitimately discusses the
// old helper (docstrings recording why a group moved off it), and the guard
// has to read code, not prose. The account-export guard's exact rule.
const stripComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('release scene route groups use the shared team-aware access check', () => {
  const files = TEAM_ACCESS_GROUPS.flatMap((group) =>
    collectTsFiles(join(RELEASE_ROUTES_ROOT, group))
  );

  it('collects a plausible file set (guards the walker)', () => {
    // 11 groups, each with at least a route.ts — an empty or tiny sweep
    // means the directory layout moved and this guard went blind.
    expect(files.length).toBeGreaterThanOrEqual(TEAM_ACCESS_GROUPS.length);
    expect(files.some((file) => file.endsWith('route.ts'))).toBe(true);
  });

  it('the comment stripper actually strips (guards the guard)', () => {
    expect(stripComments('// ensureReleaseOwnership\nconst x = 1;')).not.toMatch(BANNED);
    expect(stripComments('/* ensureOwnedRelease */ const x = 1;')).not.toMatch(BANNED);
    expect(stripComments('ensureReleaseOwnership()')).toMatch(BANNED);
  });

  it('the shared helpers exist under the names this guard requires (guards against a rename going unnoticed)', () => {
    const helperSource = readFileSync(
      join(APP_ROOT, 'lib/release-access-server.ts'),
      'utf8'
    );
    expect(helperSource).toMatch(/export async function ensureReleaseTeamReadAccess/);
    expect(helperSource).toMatch(/export async function ensureReleaseTeamWriteAccess/);
  });

  for (const file of files) {
    const relative = file.slice(APP_ROOT.length + 1);
    const source = stripComments(readFileSync(file, 'utf8'));

    it(`${relative} does not declare or import an owner-only release check`, () => {
      expect(
        source,
        `${relative} references an owner-only release check — use ` +
          `ensureReleaseTeamReadAccess/ensureReleaseTeamWriteAccess from ` +
          `lib/release-access-server.ts instead`
      ).not.toMatch(BANNED);
    });

    if (file.endsWith('route.ts')) {
      it(`${relative} gates through the shared team-aware pair`, () => {
        expect(
          source,
          `${relative} has no ensureReleaseTeam(Read|Write)Access call — a ` +
            `handler group in this list must gate through the shared helper, ` +
            `not a fresh local checker`
        ).toMatch(REQUIRED);
      });
    }
  }
});
