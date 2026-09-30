import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { URGANS_COPY_RULES } from './chappi/system-prompt';
import { readableCopySegments } from './copy-scan';

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
 * THE READER IS `readableCopySegments` FROM ./copy-scan, NOT A LOCAL ONE: the
 * same pieces `readableCopy` returns, tagged with the reader that found them.
 * That module's header states the rule: "two guards would drift the moment one
 * of them gained a rule". An earlier draft of this file hand-rolled its own
 * extractor; it is deleted. Two of its behaviours come for free and both are wanted — comments
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
  // The rollout menu (2026-09-30). Its row labels, the "On <title>" header and
  // the New activity button left TasksPanel.tsx for these files, so that entry
  // alone would silently stop covering the copy it used to hold.
  'components/workspace/WorkspaceDesktopFocused.tsx',
  'components/workspace/RolloutMenu.tsx',
  'components/workspace/RolloutMenuPortal.tsx',
  'components/workspace/useRolloutMenuActions.ts',
  'components/app/RightRail.tsx',
  'lib/rollout-menu.ts',
  'components/app/MobileNavBar.tsx',
  'components/app/AppTopbar.tsx',
  'components/releases/ReleaseScenePanel.tsx',
  'components/chappi/ChappiConversation.tsx',
  'components/share/ShareSheet.tsx',
  'components/settings/BrandColorsSection.tsx',
  // Curator pitch payments (2026-09-25) found the drift while adding an
  // Earnings tab right beside it: the dual-account link back to the team side
  // read "Your releases", the pre-rollout-rename wording. Fixed and pinned here
  // rather than left as a one-off — this is the curator-side nav chrome, the
  // same category the topbar and mobile bar are already on this list for.
  'components/curator/CuratorShell.tsx',
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
  'lib/home/chappi-speaks.ts',
  'components/home/ManagerQuietView.tsx',
  'lib/tours.ts',
  // The settings pop-up (2026-09-29). settings-search.ts is deliberately absent:
  // its keywords are words people TYPE, and people still type "release".
  'lib/settings-nav.ts',
  'components/settings/SettingsModal.tsx',
  'components/settings/SettingsNav.tsx',
  'components/settings/segments/GeneralSegment.tsx',
  'components/settings/segments/SecuritySegment.tsx',
  'components/settings/segments/ArtistsBrandSegment.tsx',
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
 * positioning guards too.
 *
 * APPLIED TO JSX TEXT ONLY (2026-09-25). It used to run on every segment, and
 * UrgAns's system prompt is one 12,000-character template literal that
 * contains `);` in its prose, so the whole prompt was skipped and 11 places
 * where it called the object a release went unchecked while this file listed
 * it as guarded. A quoted string or a template literal is a string whatever
 * punctuation it carries; only the JSX reader can hand this guard code. */
const looksLikeCode = (value: string): boolean =>
  /=>|\breturn\b|\);|===|\{\s*$|^\s*[.[]/.test(value);

/** A short excerpt around one hit, so a failure in a long segment (the UrgAns
 * prompt is 12,000 characters) points at the sentence rather than dumping the
 * whole segment once per hit. A short segment comes back whole. */
const excerpt = (seg: string, index: number, length: number): string => {
  const start = Math.max(0, index - 40);
  const end = Math.min(seg.length, index + length + 40);
  return `${start > 0 ? '…' : ''}${seg.slice(start, end).trim()}${end < seg.length ? '…' : ''}`;
};

/**
 * Every place a guarded file's copy calls the object a release.
 *
 * AN ALLOWED PHRASE EXEMPTS ONLY ITS OWN MATCH. The window check below is the
 * whole of the exemption. Until 2026-09-25 there was also a segment-level
 * check that skipped an ENTIRE segment when any allowed phrase appeared
 * anywhere in it, so "Set the release date, then open the release." passed,
 * and so would any long segment that mentions a release date or a tool name
 * like `create_release`, which UrgAns's prompt does.
 */
export function findObjectWordViolations(source: string): string[] {
  const hits: string[] = [];
  for (const { text: seg, from } of readableCopySegments(source)) {
    if ((from === 'jsx' && looksLikeCode(seg)) || isCopyRuleInstruction(seg)) continue;
    for (const m of seg.matchAll(OBJECT_WORD)) {
      const lo = Math.max(0, m.index - 14);
      const window = seg.slice(lo, m.index + m[0].length + 14);
      if (ALLOWED.some((rule) => rule.test(window))) continue;
      hits.push(excerpt(seg, m.index, m[0].length));
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
    // The `>` of the arrow opens a "JSX text" span that runs to `<div>`, which
    // is the shape AppTopbar.tsx really has. The fixture here used to be one
    // the JSX reader never extracts at all, so this passed with or without the
    // skip it claimed to test; the first assertion keeps that from recurring.
    const code =
      'const r = rs.find((r) => r.id === releaseId); if (!release) return null; return (<div>Hi</div>);';
    expect(readableCopySegments(code)).toHaveLength(1);
    expect(findObjectWordViolations(code)).toEqual([]);
    // ...but a real sentence with a full stop is still copy.
    expect(findObjectWordViolations('<p>Open the release now.</p>')).toHaveLength(1);
  });

  it('never treats a string or a template literal as code, whatever its punctuation', () => {
    // Only the JSX reader can misread code. This is the shape of UrgAns's
    // prompt: prose inside a template literal, with `);` in it.
    expect(
      findObjectWordViolations('const a = `Link it (see above); then open the release.`;')
    ).toHaveLength(1);
    expect(
      findObjectWordViolations("const a = 'Pick one (any will do); then open the release.';")
    ).toHaveLength(1);
  });

  it('lets an allowed phrase exempt its own match, not the whole segment', () => {
    expect(findObjectWordViolations("const a = 'Set a release date first';")).toEqual([]);
    expect(
      findObjectWordViolations("const a = 'Set the release date, then open the release.';")
    ).toEqual(['Set the release date, then open the release.']);
    // A tool name is allowed as well, and must not shield the prose around it.
    expect(findObjectWordViolations("const a = 'Call create_release to add the release.';")).toHaveLength(1);
  });

  it('reads the real UrgAns prompt rather than skipping it', () => {
    // The blind spot this file had until 2026-09-25, pinned on the file it hid:
    // put one object-word sentence into ROLE and the guard has to find it.
    const source = readFileSync(join(APP_ROOT, 'lib/chappi/system-prompt.ts'), 'utf8');
    const marker = 'You help the user run their rollouts';
    expect(source).toContain(marker);
    const hits = findObjectWordViolations(source.replace(marker, 'You help the user run their releases'));
    expect(hits.some((hit) => hit.includes('run their releases'))).toBe(true);
  });

  it('points at the sentence, not the whole segment, when a long segment fails', () => {
    const padding = 'Plenty of words about rollouts. '.repeat(20);
    const [hit, ...rest] = findObjectWordViolations(
      `const a = \`${padding}Then open the release now. ${padding}\`;`
    );
    expect(rest).toEqual([]);
    expect(hit).toContain('open the release now');
    expect(hit.length).toBeLessThan(120);
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
