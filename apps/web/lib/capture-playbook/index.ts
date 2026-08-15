/**
 * Fan capture playbook — the documented knowledge, encoded.
 *
 * Markdown source of truth: capture-v0.1.md in this directory. The two are
 * edited together and a test asserts their id/version agree, the same
 * discipline lib/release-templates uses for the release playbooks.
 *
 * This module is PURE: no React, no I/O, no environment reads. It is the
 * product's opinion about what makes a capture page convert, expressed as a
 * deterministic grader that both the editor (live, as you type) and the API
 * (on save, to decide whether a page is send-ready) run over the same draft.
 *
 * NO AI ANYWHERE IN HERE, deliberately — this is the "templates carry domain
 * knowledge; AI is a removable polish layer" principle applied to a surface
 * that could easily have been a prompt. A model asked "is this headline good"
 * would give a different answer every time and could not be tested; a rule
 * that says "60 characters, and not the word 'newsletter'" is checkable, is
 * the same answer twice, and is the knowledge we actually have.
 *
 * WHAT IS DELIBERATELY NOT GRADED: the graphic's aspect ratio and count
 * (playbook rules G2/G3). Both are real rules and both are surfaced as field
 * guidance in the editor, but `assets` stores no image dimensions, so grading
 * them would mean guessing. A checklist that guesses is worse than one that
 * stays quiet — see FIELD_GUIDANCE below, which is where those two live.
 */

import type { CapturePageDraft } from '@/types/capture';
import { CAPTURE_BUTTON_LABEL_MAX } from '@/types/capture';

export const CAPTURE_PLAYBOOK_ID = 'capture_v0.1';
export const CAPTURE_PLAYBOOK_VERSION = '0.1';

/**
 * A headline that survives a 375px phone without wrapping to three lines.
 * Softer than the stored ceiling (CAPTURE_HEADLINE_MAX, 80) on purpose: 80 is
 * what the column will accept, 60 is what the playbook recommends, and the
 * gap between them is a suggestion rather than a rejected save.
 */
export const CAPTURE_HEADLINE_RECOMMENDED_MAX = 60;

/**
 * Words that describe the mechanism instead of the reward. A headline built
 * on one of these is asking the fan to do admin; the playbook's C2 rule is
 * that it should name the release or the moment instead.
 */
const MECHANISM_WORDS = ['newsletter', 'mailing list', 'subscribe', 'sign up', 'signup', 'opt in'];

export type CaptureRuleSeverity = 'blocker' | 'suggestion';

export type CaptureRuleId =
  | 'graphic'
  | 'destination_url'
  | 'destination_label'
  | 'headline_present'
  | 'headline_length'
  | 'headline_specific'
  | 'incentive'
  | 'button_label'
  | 'single_ask'
  | 'consent_note'
  | 'not_paused';

export type CaptureRuleResult = {
  id: CaptureRuleId;
  /** Playbook reference (G1, C2…) so the in-app copy and the markdown agree. */
  ref: string;
  severity: CaptureRuleSeverity;
  passed: boolean;
  /** Shown when passed. Present tense, states what is right. */
  pass: string;
  /** Shown when failed. Imperative — it is the next action, not a complaint. */
  fix: string;
};

export type CaptureReadiness = {
  results: CaptureRuleResult[];
  passedCount: number;
  totalCount: number;
  /** Outstanding blockers, in playbook order. Empty means sendable. */
  blockers: CaptureRuleResult[];
  /** No blockers outstanding. Suggestions never gate sending — the manager
   * knows which of them their release can ignore. */
  isSendReady: boolean;
};

/** Context the grader needs that isn't in the draft itself. */
export type CaptureGradingContext = {
  /** True when the page will render an image: an explicitly chosen asset, or
   * the release's cover art standing in for one. Resolved by the caller
   * because it needs the release, which this module deliberately never sees. */
  hasGraphic: boolean;
};

const text = (value: string | null | undefined): string => (value ?? '').trim();

/**
 * A destination the fan can actually tap.
 *
 * Requires an explicit http(s) scheme rather than accepting a bare
 * "example.com": a schemeless string resolves to nothing from an anchor and
 * would send the fan nowhere after they had already paid with their email —
 * the exact failure the L1 rule exists to prevent. Rejecting it here means the
 * manager finds out while editing rather than after the link is out.
 */
export function isUsableDestination(value: string | null | undefined): boolean {
  const raw = text(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

const containsMechanismWord = (value: string): boolean => {
  const lowered = value.toLowerCase();
  return MECHANISM_WORDS.some((word) => lowered.includes(word));
};

/**
 * Grade a draft against the playbook.
 *
 * Order is the order the checklist renders in, and it is the playbook's own
 * order of consequence: the link first (it is what the fan is owed), then the
 * words, then the trust line. Rules always run — nothing is conditional — so
 * the denominator never moves under the user as they type, which is what lets
 * the count read as progress rather than as a shifting target.
 */
export function evaluateCapturePage(
  draft: CapturePageDraft,
  context: CaptureGradingContext
): CaptureReadiness {
  const headline = text(draft.headline);
  const incentive = text(draft.incentive);
  const buttonLabel = text(draft.buttonLabel);
  const destinationLabel = text(draft.destinationLabel);
  const consentNote = text(draft.consentNote);

  const results: CaptureRuleResult[] = [
    {
      id: 'destination_url',
      ref: 'L1',
      severity: 'blocker',
      passed: isUsableDestination(draft.destinationUrl),
      pass: 'The link works — fans get something the moment they submit.',
      fix: 'Add the link fans get, starting with https://. Without it the page collects emails and pays nothing.',
    },
    {
      id: 'not_paused',
      ref: 'T2',
      severity: 'blocker',
      passed: !draft.isPaused,
      pass: 'The page is live and accepting emails.',
      fix: 'This page is paused, so visitors are told the list is closed. Unpause it before you share the link.',
    },
    {
      id: 'headline_present',
      ref: 'C2',
      severity: 'blocker',
      passed: headline.length > 0,
      pass: 'The page says what it is.',
      fix: 'Write a headline. A page with no headline is a form with no reason attached.',
    },
    {
      id: 'graphic',
      ref: 'G1',
      severity: 'suggestion',
      passed: context.hasGraphic || Boolean(draft.graphicAssetId),
      pass: 'A graphic is showing, so fans recognise the artist before they read a word.',
      fix: 'Add cover art or a press shot to this release. An unbranded page reads as a scam and loses the fan in about a second.',
    },
    {
      id: 'headline_length',
      ref: 'C2',
      severity: 'suggestion',
      passed: headline.length > 0 && headline.length <= CAPTURE_HEADLINE_RECOMMENDED_MAX,
      pass: 'The headline fits one or two lines on a phone.',
      fix: `Trim the headline to ${CAPTURE_HEADLINE_RECOMMENDED_MAX} characters or fewer — past that it wraps to three lines on a phone and pushes the field down.`,
    },
    {
      id: 'headline_specific',
      ref: 'C2',
      severity: 'suggestion',
      passed: headline.length > 0 && !containsMechanismWord(headline),
      pass: 'The headline is about the release, not about signing up.',
      fix: 'Say what the fan gets, not what they join. Words like "newsletter" and "subscribe" describe your admin, not their reward.',
    },
    {
      id: 'incentive',
      ref: 'C3',
      severity: 'suggestion',
      passed: incentive.length > 0,
      pass: 'The exchange is stated — fans know what the email buys.',
      fix: 'Add one line saying what they get and when. Time-bound beats open-ended: "the link, a day early" beats "updates".',
    },
    {
      id: 'destination_label',
      ref: 'L2',
      severity: 'suggestion',
      passed: destinationLabel.length > 0,
      pass: 'The link is named, so the trade is legible.',
      fix: 'Name what the link is — "the video", "first listen". An unnamed link feels like a trick.',
    },
    {
      id: 'button_label',
      ref: 'C4',
      severity: 'suggestion',
      passed: buttonLabel.length > 0 && buttonLabel.length <= CAPTURE_BUTTON_LABEL_MAX,
      pass: 'The button says what happens next.',
      fix: `Label the button with the reward, not the chore — "Send me the link" beats "Submit". Keep it under ${CAPTURE_BUTTON_LABEL_MAX} characters.`,
    },
    {
      id: 'single_ask',
      ref: 'C1',
      severity: 'suggestion',
      passed: !draft.collectName,
      pass: 'One field, one decision — the shortest path to a submitted email.',
      fix: 'You are also asking for a name. Keep it only if you actually write to people by name; otherwise it is a field that costs you sign-ups and returns nothing.',
    },
    {
      id: 'consent_note',
      ref: 'T1',
      severity: 'suggestion',
      passed: consentNote.length > 0,
      pass: 'Fans are told what their email is for.',
      fix: 'Add a one-line note about what you will send and how to stop. It costs nothing and removes the "what am I signing up for" hesitation.',
    },
  ];

  const blockers = results.filter((result) => result.severity === 'blocker' && !result.passed);

  return {
    results,
    passedCount: results.filter((result) => result.passed).length,
    totalCount: results.length,
    blockers,
    isSendReady: blockers.length === 0,
  };
}

/**
 * Field-level guidance shown beside the editor inputs.
 *
 * This is where the two ungraded rules live (G2 aspect ratio, G3 one image):
 * both are real playbook rules, neither is machine-checkable without image
 * dimensions the schema does not store, so they are said plainly to the person
 * choosing the image rather than guessed at by the checklist.
 */
export const FIELD_GUIDANCE: Record<string, string> = {
  graphic:
    'Cover art or a press shot — not a logo. Square or portrait: a wide image pushes the email field off a phone screen. One image only.',
  headline:
    'Name the release or the moment. Under 60 characters so it holds one line on a phone.',
  incentive: 'What the email buys, and when. One sentence.',
  destinationUrl:
    'Where fans land the second they submit. Link straight to the thing you promised, not a page of links.',
  destinationLabel: 'What that link is, in the fan’s words — "the video", "first listen".',
  buttonLabel: 'The reward, not the chore. "Send me the link" beats "Submit".',
  collectName: 'Leave this off unless you genuinely write to people by name.',
  consentNote: 'Plain words: what you will send, and that they can stop any time.',
};

/**
 * Defaults for a newly created page.
 *
 * Not empty strings: a manager who creates a page and shares it without
 * editing should still get something that follows the rules above, so the
 * button and consent line ship pre-written and only the release-specific
 * copy is left blank. The headline is deliberately NOT defaulted — a generic
 * headline that passes the checklist would be worse than an honest blocker
 * telling them to write one.
 */
export function buildDefaultCaptureDraft(releaseTitle: string): {
  buttonLabel: string;
  destinationLabel: string;
  consentNote: string;
  incentive: string;
} {
  const title = text(releaseTitle);
  return {
    buttonLabel: 'Send me the link',
    destinationLabel: 'the link',
    consentNote: 'You will only hear from us about this release. Unsubscribe any time.',
    incentive: title ? `Be first to hear ${title}.` : '',
  };
}

/** House copy the public page falls back to, so a page can never present a
 * bare field with no explanation (playbook T1). */
export const DEFAULT_CONSENT_NOTE =
  'Your email is only used to send you this link and news about this release. Unsubscribe any time.';

/** House copy for the button, for the same reason. */
export const DEFAULT_BUTTON_LABEL = 'Send me the link';
