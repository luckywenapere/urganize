import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { URGANS_COPY_RULES } from './chappi/system-prompt';
import { readableCopy } from './copy-scan';

/**
 * The object a manager runs is a ROLLOUT (founder call, 2026-09-09). Every
 * string a person reads in the app says so; "release" survives only as the
 * DATE — release date, release day, release week — and on the public pages
 * strangers read (press kit, credits form, fan capture, DJ pack), which this
 * guard does not scan.
 *
 * This is a copy rule, and copy rules do not survive on their own: the next
 * feature copies a neighbouring label, the neighbour said "release", and the
 * vocabulary drifts back one string at a time. So the highest-traffic UI files
 * are scanned here, the way release-access-guard.test.ts scans route groups.
 *
 * THE READER IS `readableCopy` FROM ./copy-scan, NOT A LOCAL ONE. That module's
 * header states the rule: "two guards would drift the moment one of them gained
 * a rule". An earlier draft of this file hand-rolled its own extractor; it is
 * deleted. Two of its behaviours come for free and both are wanted — comments
 * are exempt, and a whitespace-free string reads as an identifier, so a bare
 * `'Release'` (a table name, a key, the timeline's axis label) is invisible
 * here exactly as the old local allow-rule intended.
 *
 * Deliberately a short, explicit file list rather than a sweep of components/:
 * a sweep would be brittle and would drag in the date-phrasing-heavy files.
 */

const APP_ROOT = process.cwd();

const GUARDED_FILES = [
  'components/releases/CreateReleaseModal.tsx',
  'components/workspace/WorkspaceView.tsx',
  'components/workspace/TasksPanel.tsx',
  'components/app/MobileNavBar.tsx',
  'components/app/AppTopbar.tsx',
  'components/releases/ReleaseScenePanel.tsx',
  'components/chappi/ChappiConversation.tsx',
  'components/share/ShareSheet.tsx',
  'components/settings/BrandColorsSection.tsx',
  'lib/chappi/intent-router.ts',
  'lib/chappi/system-prompt.ts',
  // Customer-facing email copy (was lib/email-templates.ts before the 2026-09
  // react-email split). The internal founder billing alert stays out.
  'lib/email/templates/Layout.tsx',
  'lib/email/templates/components.tsx',
  'lib/email/templates/WelcomeEmail.tsx',
  'lib/email/templates/WorkspaceInviteEmail.tsx',
  'lib/email/templates/CreditSubmissionEmail.tsx',
  'lib/email/templates/TaskAssignedEmail.tsx',
  'lib/email/templates/WorkRequestEmail.tsx',
  'lib/email/templates/WorkRequestAnswerEmail.tsx',
  'lib/email/templates/NotifyAdminEmail.tsx',
  'lib/notification-presets.ts',
  'lib/help-copy.ts',
  'lib/tours.ts',
  '../../packages/pricing/src/index.ts',
];

/** Phrases where "release" is the date, a verb, or a hyphenated phase name. */
const ALLOWED = [
  /\brelease (date|day|week)s?\b/i,
  /(single|pre|post)-release/i,
  /\breleases? (it|them|on)\b/i,
  /\/api\/releases|\?release=|\/releases?\//, // URLs
  /_release\b|\brelease_/, // tool names and enum values (create_release, pre_release)
  /\bcreate_release\b|\bget_release\b/, // named in UrgAns's own prompt on purpose
];

const OBJECT_WORD = /(?<![\w\-/?&.${])release(s|'s)?(?![\w\-=_}?]|\.\w)/gi;

/** The prompt has to name the word it forbids, so the instruction enforcing
 * this rule would otherwise fail it. Exempted by identity, never by pattern —
 * the `bannedCopyInstruction()` precedent the positioning guard already uses. */
const isCopyRuleInstruction = (value: string): boolean =>
  value.trim().length > 0 && URGANS_COPY_RULES.includes(value.trim());

/** copy-scan's JSX-text rule reads `>...<` spans, and a multi-line arrow
 * function body can look like one. A segment carrying JS punctuation is code,
 * not something a person reads. Kept local rather than pushed into copy-scan:
 * loosening the shared reader would quietly weaken the press-kit and
 * positioning guards too. */
const looksLikeCode = (value: string): boolean =>
  /=>|\breturn\b|\);|===|\{\s*$|^\s*[.[]/.test(value);

export function findObjectWordViolations(source: string): string[] {
  const hits: string[] = [];
  for (const seg of readableCopy(source)) {
    if (looksLikeCode(seg) || isCopyRuleInstruction(seg)) continue;
    if (ALLOWED.some((rule) => rule.test(seg.trim()))) continue;
    for (const m of seg.matchAll(OBJECT_WORD)) {
      const lo = Math.max(0, m.index - 14);
      const window = seg.slice(lo, m.index + m[0].length + 14);
      if (ALLOWED.some((rule) => rule.test(window))) continue;
      hits.push(seg.trim());
    }
  }
  return hits;
}

describe('the object is a rollout: guarded UI files never call it a release', () => {
  it('flags the object word and lets the date and identifiers through (guards the guard)', () => {
    expect(findObjectWordViolations("const a = 'New release here';")).toEqual(['New release here']);
    expect(findObjectWordViolations("const a = 'Release title field';")).toHaveLength(1);
    expect(findObjectWordViolations("const a = 'Set a release date first';")).toEqual([]);
    expect(findObjectWordViolations("const a = 'Release week starts';")).toEqual([]);
    expect(findObjectWordViolations(".from('releases')")).toEqual([]);
    expect(findObjectWordViolations("fetch('/api/releases')")).toEqual([]);
    expect(findObjectWordViolations("const a = 'the pre_release phase';")).toEqual([]);
  });

  it('reads comments and identifiers as code, not copy (inherited from copy-scan)', () => {
    expect(findObjectWordViolations('// the release is late\nconst a = 1;')).toEqual([]);
    expect(findObjectWordViolations('const x = releases.find((r) => r.id === id);')).toEqual([]);
    // No whitespace, so copy-scan reads it as an identifier — the documented
    // blind spot, and the behaviour the old local allow-rule wanted anyway.
    expect(findObjectWordViolations("const a = 'Release';")).toEqual([]);
  });

  it('skips code that copy-scan mistook for JSX text (guards the guard)', () => {
    expect(
      findObjectWordViolations('const a = <X>{ r.id === releaseId); if (!release) return null; }</X>;')
    ).toEqual([]);
    // ...but a real sentence with a full stop is still copy.
    expect(findObjectWordViolations('<p>Open the release now.</p>')).toHaveLength(1);
  });

  it('reads JSX text and template literals, not just quoted strings', () => {
    expect(findObjectWordViolations('<span>Every release you run</span>')).toEqual([
      'Every release you run',
    ]);
    expect(findObjectWordViolations('const a = `for the release ${title}`;')).toHaveLength(1);
  });

  for (const relative of GUARDED_FILES) {
    it(`${relative} says rollout, not release, in its copy`, () => {
      const source = readFileSync(join(APP_ROOT, relative), 'utf8');
      const violations = findObjectWordViolations(source);
      expect(
        violations,
        `${relative} still calls the object a "release" in: ${violations.join(' | ')}`
      ).toEqual([]);
    });
  }
});
