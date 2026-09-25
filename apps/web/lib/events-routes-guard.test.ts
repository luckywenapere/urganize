import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every Shows route answers the same three questions in the same order:
 *
 *   1. Is Shows switched on? (404 when it is not, before anything else)
 *   2. Who is asking? (sign-in, and the paid-access gate)
 *   3. May they do this to THIS show, set, song or artist?
 *
 * Why a test: the routes were written over several days by different hands,
 * and a route that asks question 2 before 1 tells a signed-out stranger the
 * feature exists, while a route that skips 3 hands a guest or another artist's
 * teammate a write they were never meant to have. Both mistakes were in the
 * code before 2026-09-25 (create routes skipped the access rule entirely).
 * A comment cannot stop the next one; this can.
 *
 * A handler that WRITES must ask its access helper for write access, and a
 * read must ask for read access, because a guest is read-only and the helpers
 * refuse a guest's write only when asked to.
 *
 * The public pack routes are the other half: no sign-in at all, the token is
 * the key, so they must go through loadPublicPack, which checks the switch
 * first and applies the one gate that decides what a link shows.
 */

const APP_ROOT = join(__dirname, '..');
const TEAM_ROUTE_ROOTS = ['app/api/events', 'app/api/setlists', 'app/api/songs', 'app/api/packs'];
const ACCESS_HELPER = /\b(ensureEventAccess|ensureSetlistAccess|ensureSongAccess|ensureArtistAccess|decideReleaseAccess)\(/;
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, out);
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

/** Comments out, strings kept: the guard reads code, not the prose explaining it. */
const stripComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Each exported handler's body, up to the next export. */
function handlers(source: string): { method: string; body: string }[] {
  const pattern = /export async function (GET|POST|PATCH|PUT|DELETE)\b/g;
  const starts = [...source.matchAll(pattern)];
  return starts.map((match, index) => ({
    method: match[1],
    body: source.slice(match.index ?? 0, starts[index + 1]?.index ?? source.length),
  }));
}

/** The argument list of every call to `name`, parentheses balanced, so a call
 *  split over several lines is read whole. */
function callArguments(body: string, name: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = body.indexOf(`${name}(`, from);
    if (at === -1) return out;
    let depth = 0;
    let end = at + name.length;
    for (; end < body.length; end += 1) {
      const char = body[end];
      if (char === '(') depth += 1;
      else if (char === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(body.slice(at + name.length + 1, end));
    from = end;
  }
}

describe('Shows routes: switch, then sign-in, then access', () => {
  const files = TEAM_ROUTE_ROOTS.flatMap((root) => routeFiles(join(APP_ROOT, root)));

  it('finds the routes (guards the walker)', () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
  });

  it('reads a call split over several lines (guards the reader)', () => {
    expect(callArguments('ensureSongAccess(\n  adminClient,\n  songId,\n  auth.user,\n  true\n)', 'ensureSongAccess')).toEqual([
      '\n  adminClient,\n  songId,\n  auth.user,\n  true\n',
    ]);
    expect(stripComments('// isEventsFeatureEnabled()\nconst x = 1;')).not.toContain('isEventsFeatureEnabled');
    expect(stripComments("const url = 'https://x';")).toContain('https://x');
  });

  for (const file of files) {
    const relative = file.slice(APP_ROOT.length + 1).replace(/\\/g, '/');
    const source = stripComments(readFileSync(file, 'utf8'));

    it(`${relative} exports at least one handler`, () => {
      expect(handlers(source).length).toBeGreaterThan(0);
    });

    for (const { method, body } of handlers(source)) {
      it(`${relative} ${method} checks the switch before sign-in`, () => {
        const gate = body.indexOf('isEventsFeatureEnabled()');
        const signIn = body.indexOf('requireActiveAuthenticatedUser(');
        expect(gate, 'no isEventsFeatureEnabled() check').toBeGreaterThan(-1);
        expect(signIn, 'no requireActiveAuthenticatedUser() call').toBeGreaterThan(-1);
        expect(gate, 'the switch must be checked before sign-in').toBeLessThan(signIn);
        expect(body, 'must not use the unpaid sign-in check').not.toMatch(/\bgetAuthenticatedUser\(/);
      });

      it(`${relative} ${method} goes through an access check after sign-in`, () => {
        const match = ACCESS_HELPER.exec(body);
        expect(match, 'no access helper call').not.toBeNull();
        expect(body.indexOf(match![0])).toBeGreaterThan(body.indexOf('requireActiveAuthenticatedUser('));
      });

      it(`${relative} ${method} asks for ${WRITE_METHODS.has(method) ? 'write' : 'read'} access`, () => {
        const expected = WRITE_METHODS.has(method) ? 'true' : 'false';
        const calls = ['ensureEventAccess', 'ensureSetlistAccess', 'ensureSongAccess', 'ensureArtistAccess'].flatMap(
          (name) => callArguments(body, name)
        );
        for (const args of calls) {
          const last = args.split(',').map((part) => part.trim()).filter(Boolean).pop();
          expect(last, `${relative} ${method}: ${args.replace(/\s+/g, ' ')}`).toBe(expected);
        }
      });
    }
  }
});

describe('the public pack routes', () => {
  const download = stripComments(readFileSync(join(APP_ROOT, 'app/api/pack/[token]/download/route.ts'), 'utf8'));
  const page = stripComments(readFileSync(join(APP_ROOT, 'app/pack/[token]/page.tsx'), 'utf8'));
  const loader = stripComments(readFileSync(join(APP_ROOT, 'lib/dj-pack-server.ts'), 'utf8'));

  it('resolve everything from the token, never from a sign-in', () => {
    for (const source of [download, page]) {
      expect(source).toMatch(/loadPublicPack\(/);
      expect(source).not.toMatch(/requireActiveAuthenticatedUser\(|getAuthenticatedUser\(/);
    }
  });

  it('only hand over a file after the pack has been resolved and the file found in it', () => {
    const resolved = download.indexOf('loadPublicPack(');
    const found = download.indexOf("entry.kind === 'song' && entry.versionId === versionId");
    const signed = download.indexOf('createSignedUrl(');
    expect(resolved).toBeGreaterThan(-1);
    expect(found).toBeGreaterThan(resolved);
    expect(signed).toBeGreaterThan(found);
  });

  it('check the switch before reading anything, and decide the link through the one gate', () => {
    const body = loader.slice(loader.indexOf('export async function loadPublicPack'));
    const firstRead = body.indexOf('.from(');
    expect(body.indexOf("NEXT_PUBLIC_FEATURE_EVENTS !== 'true'")).toBeGreaterThan(-1);
    expect(body.indexOf("NEXT_PUBLIC_FEATURE_EVENTS !== 'true'")).toBeLessThan(firstRead);
    expect(body).toMatch(/decidePackGate\(/);
  });
});
