import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { BANNED_COPY_CHARS, BANNED_COPY_WORDS, bannedCopyInstruction } from './press-kits';

/**
 * The press kit's house copy rules, enforced rather than reviewed.
 *
 * The brief states these as rules, not preferences, and a rule a person has to
 * remember is one that lasts until somebody is in a hurry. Each one below broke
 * at least once during the eight phases that built this feature and was caught
 * by reading; this is what stops the ninth.
 *
 * Scope is the press kit and directory surfaces only. The rest of the product
 * predates these rules and is not in scope for a retrofit.
 */

const WEB = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const FILES = [
  // The directory joined this guard rather than growing a second one: same
  // house rules, same brief, and two guards would drift the moment one of them
  // gained a rule.
  ...walk(join(WEB, 'lib')).filter((path) => /press-kit|press-photo|directory-|delivery-records|role-gaps/.test(path)),
  ...walk(join(WEB, 'components', 'press-kits')),
  ...walk(join(WEB, 'app', 'k')),
  ...walk(join(WEB, 'app', 'api', 'press-kits')),
  ...walk(join(WEB, 'app', 'dashboard', 'press-kits')),
  ...walk(join(WEB, 'app', 'api', 'admin', 'directory-backfill')),
  ...walk(join(WEB, 'app', 'api', 'directory')),
  ...walk(join(WEB, 'app', 'p')),
  ...walk(join(WEB, 'app', 'dashboard', 'directory')),
  ...walk(join(WEB, 'app', 'admin', 'directory')),
  ...walk(join(WEB, 'app', 'api', 'admin', 'directory')),
  ...walk(join(WEB, 'components', 'directory')),
  join(WEB, 'components', 'settings', 'DirectoryProfileSection.tsx'),
  // The assistant's tools for these two surfaces, named rather than walked.
  // Every description and refusal below is read by a manager in the
  // conversation, so they are press kit and directory copy like any other.
  // The lib walk above reaches press-kits.ts only because its filename happens
  // to contain the pattern, and cannot reach directory.ts at all; naming both
  // makes the coverage a decision instead of a coincidence.
  join(WEB, 'lib', 'chappi', 'tool-families', 'press-kits.ts'),
  join(WEB, 'lib', 'chappi', 'tool-families', 'directory.ts'),
].filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'));

/**
 * Only the strings a person reads.
 *
 * Comments are the working record of why the code is the way it is, and hold
 * dates, prose and the odd quotation. Holding them to product copy rules would
 * either gut them or teach everyone to work around the test.
 */
function userFacingStrings(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const matches = withoutComments.match(/(['"])(?:\\.|(?!\1)[^\\\r\n])*\1/g) || [];
  return matches
    .map((raw) => raw.slice(1, -1))
    // Anything with no space is an identifier, a class name, a path or a key.
    // A sentence a person reads has spaces in it.
    .filter((value) => /\s/.test(value.trim()) && /[a-z]{3}/i.test(value));
}

const report = (path: string, value: string) =>
  `${path.replace(`${WEB}/`, '')}: ${value}`;

describe('press kit copy', () => {
  it('finds the files it is meant to be guarding', () => {
    // A walk that silently matched nothing would pass every test below.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('uses no em dash', () => {
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of userFacingStrings(readFileSync(path, 'utf8'))) {
        if (BANNED_COPY_CHARS.some((char) => value.includes(char))) {
          found.push(report(path, value));
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('never says ship', () => {
    // "Deliver" and "delivered". A release is delivered.
    //
    // The instruction that tells UrgAns this rule necessarily contains the
    // word, so it is exempted by identity rather than by a pattern: the ONE
    // string allowed to name a banned word is the one built from the list the
    // guard itself reads.
    const allowed = bannedCopyInstruction();
    const pattern = new RegExp(`\\b(${BANNED_COPY_WORDS.join('|')})\\b`, 'i');
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of userFacingStrings(readFileSync(path, 'utf8'))) {
        if (value === allowed) continue;
        if (pattern.test(value)) found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });

  it('never says workspace', () => {
    // The word is for positioning and messaging. It is banned inside product
    // copy, where a manager would have to work out what it means.
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of userFacingStrings(readFileSync(path, 'utf8'))) {
        if (/\bworkspaces?\b/i.test(value)) found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });

  it('writes no placeholder stat, fake quote or invented number', () => {
    // The brief's hardest line: empty is better than fake. Nothing in this
    // feature may put a figure or a quotation on somebody's kit that nobody
    // gave us. The Numbers section is hand entered and date stamped for the
    // same reason, and autofill deliberately writes nothing into it.
    const suspicious = [
      /\b\d[\d,.]*\s*(monthly listeners|streams|plays|followers|fans)\b/i,
      /\b(rising|acclaimed|breakout|award[- ]winning|chart[- ]topping)\b/i,
      /\blorem ipsum\b/i,
    ];
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of userFacingStrings(readFileSync(path, 'utf8'))) {
        if (suspicious.some((pattern) => pattern.test(value))) found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });

  it('names a job, never a title borrowed from software', () => {
    // Plain job titles. "Operation heads", not "VP Operations".
    const found: string[] = [];
    for (const path of FILES) {
      for (const value of userFacingStrings(readFileSync(path, 'utf8'))) {
        if (/\b(VP|SVP|C[ETMOF]O|stakeholder|synerg)/.test(value)) found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });
});
