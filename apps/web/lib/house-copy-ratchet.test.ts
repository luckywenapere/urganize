import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { describe, expect, it } from 'vitest';
import { readableCopy } from './copy-scan';
import { BANNED_COPY_CHARS, BANNED_COPY_WORDS, bannedCopyInstruction } from './press-kits';

/**
 * The house copy rules, held across the whole app rather than one surface at a
 * time.
 *
 * lib/press-kit-copy-guard.test.ts enforces these rules on a list of files
 * chosen by name, and its header says why: the rest of the product predates the
 * rules and was not to be retrofitted. That left every OTHER screen free to
 * drift, and it did: an audit on 2026-09-30 found 186 em dashes, 34 uses of the
 * then-banned word "workspace" (allowed again 2026-11-08), and a handful of sentences that assumed a person's
 * gender, all in screens nobody had listed.
 *
 * So the older screens were cleaned in one pass, and this guard closes the door
 * behind it. It sweeps every component and every page, so a NEW file is covered
 * the day it is written without anyone remembering to add it to a list. The only
 * way out is BASELINE below, and that can only shrink.
 *
 * Deliberately out of scope, each for a stated reason:
 *  - app/api and app/admin. API routes mix the sentences a person reads with
 *    server log lines, and this reader cannot tell them apart, so a sweep would
 *    fail on the log lines. Admin is an internal console.
 *  - lib/. Tool schemas and the assistant's instructions are read by a model,
 *    and the playbooks are versioned data; the modules a person reads directly
 *    are named in press-kit-copy-guard.test.ts.
 *
 * Comments are exempt, as everywhere else: they are the working record.
 */

const WEB = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next') return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const rel = (path: string) => relative(WEB, path).split(sep).join('/');

/**
 * Files that hold something these rules would flag but nobody reads. FROZEN:
 * an entry may be removed and none may be added, and the test at the bottom
 * fails if an entry stops earning its place. A file that really does carry a
 * sentence a person reads gets fixed, not listed.
 */
const BASELINE: Record<string, string> = {
  'components/providers/ChunkRecoveryBridge.tsx':
    'The em dashes are in console lines for developers. Nothing here is rendered.',
};

const ROOTS = ['components', 'app', 'stores'].map((dir) => join(WEB, dir));

const SKIPPED = [`app${sep}api${sep}`, `app${sep}admin${sep}`];

const FILES = ROOTS.filter((dir) => existsSync(dir))
  .flatMap(walk)
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
  .filter((path) => !SKIPPED.some((skipped) => path.includes(join(WEB, skipped))));

const swept = FILES.filter((path) => !(rel(path) in BASELINE));

const report = (path: string, value: string) =>
  `${rel(path)}: ${value.replace(/\s+/g, ' ').trim().slice(0, 160)}`;

/** Every rule as a function of one file, so the baseline check below can ask the
 * same question the rules do. */
const RULES: Array<{ name: string; hits: (source: string) => string[] }> = [
  {
    name: 'em dash',
    hits: (source) => [
      ...readableCopy(source).filter((value) => BANNED_COPY_CHARS.some((char) => value.includes(char))),
      // The entity form, which the reader does not decode. Comment lines are
      // skipped, as everywhere else.
      ...source
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line))
        .filter((line) => /&mdash;|&#8212;|&#x2014;/i.test(line)),
    ],
  },
  {
    name: 'ship',
    hits: (source) => {
      const allowed = bannedCopyInstruction();
      const pattern = new RegExp(`\\b(${BANNED_COPY_WORDS.join('|')})\\b`, 'i');
      return readableCopy(source).filter((value) => value !== allowed && pattern.test(value));
    },
  },
  {
    name: 'gendered pronoun',
    // A person's pronouns are theirs to state. Copy that refers to a third
    // party (an artist, a curator, a teammate) says "they" or uses the name.
    hits: (source) => readableCopy(source).filter((value) => /\b(she|her|hers|he|him|his)\b/i.test(value)),
  },
];

describe('house copy across every screen', () => {
  it('finds the files it is meant to be guarding', () => {
    // A walk that silently matched nothing would pass every test below.
    expect(FILES.length).toBeGreaterThan(300);
    expect(swept.length).toBeGreaterThan(300);
  });

  for (const rule of RULES) {
    it(`no screen contains: ${rule.name}`, () => {
      const found: string[] = [];
      for (const path of swept) {
        for (const value of rule.hits(readFileSync(path, 'utf8'))) found.push(report(path, value));
      }
      expect(found).toEqual([]);
    });
  }

  it('the baseline only holds files that still earn their place', () => {
    const stale: string[] = [];
    for (const path of Object.keys(BASELINE)) {
      const full = join(WEB, path);
      if (!existsSync(full)) {
        stale.push(`${path}: the file is gone, remove it from BASELINE`);
        continue;
      }
      const source = readFileSync(full, 'utf8');
      if (!RULES.some((rule) => rule.hits(source).length > 0)) {
        stale.push(`${path}: now clean, remove it from BASELINE`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('every baseline entry says why', () => {
    for (const [path, reason] of Object.entries(BASELINE)) {
      expect(reason.trim().length, path).toBeGreaterThan(10);
    }
  });
});
