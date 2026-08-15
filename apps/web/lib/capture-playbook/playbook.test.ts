import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_CAPTURE_DRAFT, type CapturePageDraft } from '@/types/capture';
import {
  CAPTURE_HEADLINE_RECOMMENDED_MAX,
  CAPTURE_PLAYBOOK_ID,
  CAPTURE_PLAYBOOK_VERSION,
  buildDefaultCaptureDraft,
  evaluateCapturePage,
  isUsableDestination,
} from './index';

/**
 * The capture playbook is product IP the same way the release playbooks are,
 * so it gets the same treatment: the markdown source and the TS encoding must
 * agree, and the grader's contract is pinned so a copy edit cannot silently
 * turn a suggestion into a blocker (or vice versa) and change what "ready to
 * send" means for every user.
 */

const draft = (overrides: Partial<CapturePageDraft> = {}): CapturePageDraft => ({
  ...EMPTY_CAPTURE_DRAFT,
  ...overrides,
});

/** A page with every rule satisfied — the fixture the failure cases mutate. */
const perfectDraft = (): CapturePageDraft =>
  draft({
    headline: 'Midnight EP — first listen',
    incentive: 'Get the link a day before it goes public.',
    destinationUrl: 'https://example.com/listen',
    destinationLabel: 'first listen',
    buttonLabel: 'Send me the link',
    consentNote: 'Only about this release. Unsubscribe any time.',
  });

const grade = (value: CapturePageDraft, hasGraphic = true) =>
  evaluateCapturePage(value, { hasGraphic });

const ruleById = (value: CapturePageDraft, id: string, hasGraphic = true) => {
  const found = grade(value, hasGraphic).results.find((result) => result.id === id);
  if (!found) throw new Error(`No rule ${id}`);
  return found;
};

describe('playbook source of truth', () => {
  it('keeps the markdown id and version in step with the code', () => {
    const markdown = readFileSync(join(__dirname, 'capture-v0.1.md'), 'utf8');
    expect(markdown).toContain(`\`${CAPTURE_PLAYBOOK_ID}\``);
    expect(CAPTURE_PLAYBOOK_ID).toBe(`capture_v${CAPTURE_PLAYBOOK_VERSION}`);
  });
});

describe('isUsableDestination', () => {
  it('accepts http and https URLs', () => {
    expect(isUsableDestination('https://example.com/track')).toBe(true);
    expect(isUsableDestination('http://example.com')).toBe(true);
  });

  it('rejects a schemeless host — it resolves to nothing from an anchor', () => {
    expect(isUsableDestination('example.com/track')).toBe(false);
  });

  it('rejects non-web schemes, which a capture link must never be', () => {
    expect(isUsableDestination('javascript:alert(1)')).toBe(false);
    expect(isUsableDestination('mailto:someone@example.com')).toBe(false);
    expect(isUsableDestination('data:text/html,hi')).toBe(false);
  });

  it('rejects empty, whitespace and junk', () => {
    expect(isUsableDestination('')).toBe(false);
    expect(isUsableDestination('   ')).toBe(false);
    expect(isUsableDestination(null)).toBe(false);
    expect(isUsableDestination('not a url at all')).toBe(false);
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(isUsableDestination('  https://example.com/x  ')).toBe(true);
  });
});

describe('evaluateCapturePage — send-readiness', () => {
  it('grades a complete page as ready with everything passing', () => {
    const readiness = grade(perfectDraft());
    expect(readiness.isSendReady).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.passedCount).toBe(readiness.totalCount);
  });

  it('grades an empty page as not ready', () => {
    const readiness = grade(draft(), false);
    expect(readiness.isSendReady).toBe(false);
    expect(readiness.blockers.length).toBeGreaterThan(0);
  });

  it('blocks on a missing destination — the fan must be paid for the email', () => {
    const readiness = grade(draft({ ...perfectDraft(), destinationUrl: '' }));
    expect(readiness.isSendReady).toBe(false);
    expect(readiness.blockers.map((rule) => rule.id)).toContain('destination_url');
  });

  it('blocks on a paused page', () => {
    const readiness = grade(draft({ ...perfectDraft(), isPaused: true }));
    expect(readiness.isSendReady).toBe(false);
    expect(readiness.blockers.map((rule) => rule.id)).toContain('not_paused');
  });

  it('blocks on a missing headline', () => {
    const readiness = grade(draft({ ...perfectDraft(), headline: '' }));
    expect(readiness.isSendReady).toBe(false);
    expect(readiness.blockers.map((rule) => rule.id)).toContain('headline_present');
  });

  it('has exactly three blockers, and they are the irreversible-in-public ones', () => {
    // Pinning the SET, not just the count: promoting a suggestion to a blocker
    // changes what "ready to send" means for every existing page, so it must
    // be a deliberate edit here rather than a side effect of a copy tweak.
    const blockerIds = grade(draft(), false)
      .results.filter((rule) => rule.severity === 'blocker')
      .map((rule) => rule.id)
      .sort();
    expect(blockerIds).toEqual(['destination_url', 'headline_present', 'not_paused']);
  });

  it('never lets a suggestion gate sending', () => {
    // Every suggestion failing at once, with all three blockers satisfied.
    const readiness = grade(
      draft({
        headline: `Subscribe to my newsletter ${'x'.repeat(CAPTURE_HEADLINE_RECOMMENDED_MAX)}`,
        destinationUrl: 'https://example.com',
        collectName: true,
      }),
      false
    );
    expect(readiness.isSendReady).toBe(true);
    expect(readiness.passedCount).toBeLessThan(readiness.totalCount);
  });
});

describe('evaluateCapturePage — individual rules', () => {
  it('passes the graphic rule on cover-art fallback, not just an explicit pick', () => {
    expect(ruleById(perfectDraft(), 'graphic', true).passed).toBe(true);
    expect(ruleById(perfectDraft(), 'graphic', false).passed).toBe(false);
    // An explicitly chosen asset passes even before the caller resolves it.
    expect(ruleById(draft({ graphicAssetId: 'asset-1' }), 'graphic', false).passed).toBe(true);
  });

  it('flags a headline past the recommended length', () => {
    const long = 'a'.repeat(CAPTURE_HEADLINE_RECOMMENDED_MAX + 1);
    expect(ruleById(draft({ headline: long }), 'headline_length').passed).toBe(false);
    const exact = 'a'.repeat(CAPTURE_HEADLINE_RECOMMENDED_MAX);
    expect(ruleById(draft({ headline: exact }), 'headline_length').passed).toBe(true);
  });

  it('flags mechanism words wherever they appear, case-insensitively', () => {
    for (const headline of [
      'Subscribe now',
      'Join my NEWSLETTER',
      'Sign up for first listen',
      'Mailing list',
    ]) {
      expect(ruleById(draft({ headline }), 'headline_specific').passed).toBe(false);
    }
    expect(ruleById(draft({ headline: 'Out Friday' }), 'headline_specific').passed).toBe(true);
  });

  it('fails length and specificity when the headline is missing, rather than passing vacuously', () => {
    // A blank headline is already a blocker; the two derived suggestions must
    // not report green on it, or an empty page would look 2 rules better than
    // it is.
    expect(ruleById(draft(), 'headline_length').passed).toBe(false);
    expect(ruleById(draft(), 'headline_specific').passed).toBe(false);
  });

  it('treats the name field as a cost, passing only when it is off', () => {
    expect(ruleById(perfectDraft(), 'single_ask').passed).toBe(true);
    expect(ruleById(draft({ ...perfectDraft(), collectName: true }), 'single_ask').passed).toBe(
      false
    );
  });

  it('rejects a button label that would wrap inside the button', () => {
    expect(
      ruleById(draft({ buttonLabel: 'Send me the link right now please' }), 'button_label').passed
    ).toBe(false);
  });

  it('treats whitespace-only fields as missing', () => {
    const blank = draft({ ...perfectDraft(), incentive: '   ', consentNote: '\n\t' });
    expect(ruleById(blank, 'incentive').passed).toBe(false);
    expect(ruleById(blank, 'consent_note').passed).toBe(false);
  });

  it('gives every rule both a pass line and a fix line', () => {
    for (const rule of grade(draft(), false).results) {
      expect(rule.pass.length).toBeGreaterThan(0);
      expect(rule.fix.length).toBeGreaterThan(0);
      expect(rule.ref.length).toBeGreaterThan(0);
    }
  });
});

describe('buildDefaultCaptureDraft', () => {
  it('pre-writes the rule-following fields but never the headline', () => {
    const defaults = buildDefaultCaptureDraft('Midnight EP');
    expect(defaults.buttonLabel).toBeTruthy();
    expect(defaults.consentNote).toBeTruthy();
    expect(defaults.incentive).toContain('Midnight EP');
    // A defaulted headline would pass the checklist while saying nothing —
    // strictly worse than an honest blocker telling the manager to write one.
    expect(defaults).not.toHaveProperty('headline');
  });

  it('leaves the incentive blank when the release has no title yet', () => {
    expect(buildDefaultCaptureDraft('  ').incentive).toBe('');
  });

  it('produces defaults that satisfy their own rules', () => {
    const defaults = buildDefaultCaptureDraft('Midnight EP');
    const readiness = grade(
      draft({ ...defaults, headline: 'Out Friday', destinationUrl: 'https://example.com' })
    );
    expect(readiness.isSendReady).toBe(true);
    expect(readiness.passedCount).toBe(readiness.totalCount);
  });
});
