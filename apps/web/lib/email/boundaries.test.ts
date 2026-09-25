import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

// The module boundaries lib/email/index.ts promises in its header, enforced.
//
//  1. Only transport.ts talks to Resend. Keeping every api.resend.com detail in
//     one file is what makes a provider swap a one-file change.
//  2. Nothing OUTSIDE lib/email imports the transport. render.ts and transport.ts
//     statically pull react-dom/server and the hand-rolled fetch respectively;
//     reaching either with a static import from a caller would drag that weight
//     into the ~55-file graph that imports tasks-server, which is the cold-start
//     cost the whole module is shaped to avoid.

const WEB = join(__dirname, '..', '..');
const posix = (path: string) => path.split(sep).join('/');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const SOURCE = [...walk(join(WEB, 'app')), ...walk(join(WEB, 'lib'))]
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map(posix);

const rel = (path: string) => path.slice(posix(WEB).length + 1);

/** Drop comments before scanning, so a module's own docstring mentioning
 *  api.resend.com or email/transport is not read as a reference. The `[^:]`
 *  guard keeps `https://` in a real string from being mistaken for a line
 *  comment. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('email module boundaries', () => {
  it('scans a real tree (guards the guard)', () => {
    expect(SOURCE.length).toBeGreaterThan(200);
    expect(SOURCE.some((p) => p.endsWith('lib/email/transport.ts'))).toBe(true);
  });

  it('only the transport references api.resend.com', () => {
    const offenders = SOURCE.filter((path) =>
      stripComments(readFileSync(path, 'utf8')).includes('api.resend.com')
    ).map(rel);
    expect(offenders).toEqual(['lib/email/transport.ts']);
  });

  it('nothing outside lib/email imports the transport module', () => {
    const importsTransport = /(?:from|import\()\s*['"][^'"]*email\/transport['"]/;
    const offenders = SOURCE.filter(
      (path) =>
        !posix(path).includes('/lib/email/') &&
        importsTransport.test(stripComments(readFileSync(path, 'utf8')))
    ).map(rel);
    expect(offenders).toEqual([]);
  });
});
