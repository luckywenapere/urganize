import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { describe, expect, it } from 'vitest';
import { changelog } from '@urganize/changelog';

/**
 * The assistant is called "AI" in copy, never "UrgAns" (founder call,
 * 2026-11-03, #1056: "we're not using UrgAns anywhere again").
 *
 * Code keeps the old names (urgans_* tables and events, /dashboard/urgans,
 * UrgansPanel, the Chappi env vars), so this looks for the capitalised word
 * "UrgAns" outside comments, which is how the name was always written in copy.
 * Test files and the changelog's old entries are history and are not read.
 *
 * The changelog's NEW entries are read (#1273): the rename went out in
 * v1.245.1, and five entries written after it still used the old name because
 * nothing checked them. Entries up to v1.245.1 stay as they were written.
 */

const RENAME_VERSION = '1.245.1';

/** Whether version `a` is newer than version `b` (plain x.y.z numbers). */
function isNewer(a: string, b: string): boolean {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) > (right[i] ?? 0);
  }
  return false;
}

const WEB = join(__dirname, '..');
const ROOT = join(WEB, '..', '..');

const posix = (path: string) => path.split(sep).join('/');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isCode = (path: string) => /\.(tsx?|mjs|cjs|js)$/.test(path) && !/\.test\.tsx?$/.test(path);
const isDoc = (path: string) => /\.(mdx?|json)$/.test(path);

const SURFACES = [
  ...['app', 'components', 'lib', 'stores'].flatMap((dir) => walk(join(WEB, dir))),
  ...['app', 'lib'].flatMap((dir) => walk(join(ROOT, 'apps', 'homepage', dir))),
  ...walk(join(ROOT, 'apps', 'mobile')).filter((path) => !path.includes(`${sep}assets${sep}`)),
  ...walk(join(ROOT, 'packages'))
    .filter((path) => path.includes(`${sep}src${sep}`) && !path.includes(`${sep}changelog${sep}`)),
  ...walk(join(ROOT, 'apps', 'docs')),
  join(ROOT, 'docs', 'store-listing.md'),
].filter((path) => isCode(path) || isDoc(path));

/** The source with its comments taken out, so history may still name it. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

describe('the name UrgAns is gone from copy', () => {
  it('reads the app, the site, the mobile shell, the packages and the docs', () => {
    expect(SURFACES.length).toBeGreaterThan(500);
  });

  it('never shows "UrgAns" to a person', () => {
    const hits = SURFACES.flatMap((path) => {
      const name = posix(relative(ROOT, path));
      const raw = readFileSync(path, 'utf8');
      const text = isCode(path) ? withoutComments(raw) : raw;
      return text
        .split('\n')
        .filter((line) => /\bUrgAns\b/.test(line))
        .map((line) => `${name}: ${line.trim().slice(0, 120)}`);
    });
    expect(hits).toEqual([]);
  }, 30_000);

  it('never says "UrgAns" in a What\'s new entry written after the rename', () => {
    const fresh = changelog.filter((entry) => isNewer(entry.version, RENAME_VERSION));
    // The rename is far enough back that there are always entries to read.
    expect(fresh.length).toBeGreaterThan(50);
    const hits = fresh.flatMap((entry) =>
      [entry.title ?? '', ...entry.highlights]
        .filter((line) => /\bUrgAns\b/.test(line))
        .map((line) => `v${entry.version}: ${line.slice(0, 120)}`)
    );
    expect(hits).toEqual([]);
  });

  it('leaves the entries from before the rename as they were written', () => {
    const old = changelog.filter((entry) => !isNewer(entry.version, RENAME_VERSION));
    expect(old.some((entry) => entry.highlights.some((line) => /\bUrgAns\b/.test(line)))).toBe(true);
  });
});
