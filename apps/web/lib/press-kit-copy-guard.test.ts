import { readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';
import { userFacingStrings } from './copy-scan';
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
  // The help pullouts (2026-09-08). Every string in that module is read by a
  // manager, and it is a NEW surface, so it is born under the house rules
  // rather than grandfathered out of them like the older copy this guard's
  // header excludes. Its own guard, lib/help-copy.test.ts, adds the
  // readability caps on top; this one supplies the em dash, the banned words
  // and the "never says workspace" rule so there is one definition of each.
  join(WEB, 'lib', 'help-copy.ts'),
  // Share to socials (2026-09-23): the same argument as the pullouts. A new
  // surface, so it is born under the house rules, and it is the one surface
  // in the product whose copy is PUBLISHED by the user as their own words on
  // Instagram and WhatsApp. The outward-copy tests in social-share.test.ts add
  // the rules that only apply there (no "rollout", no Urganize in a caption,
  // no date leaking out of a secret one); this supplies the em dash and the
  // banned words, so there is one definition of each.
  ...walk(join(WEB, 'components', 'share')),
  // basename rather than a path pattern: walk() joins with the platform's
  // separator, so a pattern written for "/" alone matches nothing on Windows.
  ...walk(join(WEB, 'lib')).filter((path) => basename(path).startsWith('social-share')),
  ...walk(join(WEB, 'app', 'api', 'releases', '[releaseId]', 'share-card')),
].filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'));

// `userFacingStrings` moved to lib/copy-scan.ts on 2026-09-09, when the
// positioning guard needed the same reader. It is unchanged; this file's own
// header already argued that two guards sharing a rule should not carry two
// copies of it.

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
