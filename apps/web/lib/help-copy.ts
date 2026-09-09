/**
 * Every pullout explanation in the app, in one place.
 *
 * Founder ask (2026-09-08), from a screenshot of Vercel's side menu: give the
 * places carrying too much text a small pullout instead, and hold the whole app
 * to a bar where "a fifth grader could use the app".
 *
 * WHY A MODULE RATHER THAN A PROP AT EACH CALL SITE. Three reasons, in order:
 *
 *  1. vitest reaches `lib/` and nothing else. This repo has no component tests
 *     (node environment, no jsdom), so copy written inline in a .tsx is copy no
 *     guard can hold. `lib/help-copy.test.ts` is what makes the fifth-grader bar
 *     a build failure instead of a preference.
 *  2. One concept, one explanation. Genre is asked for on the metadata scene and
 *     named in the side menu's own pullout; with the strings inline those two
 *     drift the first time somebody edits one of them. This file is the reason
 *     they cannot.
 *  3. It is reviewable. Thirty explanations in one list can be read end to end
 *     for tone; thirty explanations spread over eleven components cannot.
 *
 * Each entry carries the LABEL it sits beside as well as its text, and that is
 * load-bearing twice over: the trigger announces itself as "What is Genre?"
 * rather than a bare "Help", and the guard uses it to refuse copy that leans on
 * the label it is meant to explain.
 *
 * ADDING ONE: put it here, render it, and let the guard tell you if the copy is
 * too long, too wordy, jargon-heavy, or a restatement of its own label. A key
 * with no call site fails too — dead copy reads as covered in review and shows
 * up nowhere.
 */

export type HelpEntry = {
  /** The on-screen label this explains. Announced by the trigger, and what the
   * guard checks the text against. */
  label: string;
  /** At most two short sentences. See the caps below. */
  text: string;
};

/** A pullout is a pullout, not a paragraph. Three sentences of always-on grey
 * text under a form field is the exact thing this pass was asked to remove, so
 * the replacement must not quietly become it. */
export const MAX_HELP_SENTENCES = 2;

/** Roughly two lines in the panel at its width. Past this it stops being
 * glanceable and starts being read, which is a different interaction. */
export const MAX_HELP_CHARS = 160;

/** Fifth-grade prose runs about twelve to fifteen words a sentence; eighteen is
 * the ceiling rather than the target. This is the single biggest readability
 * lever — long words are usually the domain's real vocabulary (ISRC, Afrobeats)
 * and banning them would make the copy vaguer, not simpler. */
export const MAX_HELP_WORDS_PER_SENTENCE = 18;

/**
 * Words a beginner would have to look up, each of which has a plain
 * alternative. Deliberately NOT a list of long words: "distributor" and
 * "publisher" are long and are what the thing is actually called.
 *
 * `metadata` is on the list even though a scene is named Metadata — that is the
 * point. The label already says the word; a pullout that repeats it explains
 * nothing.
 */
export const HELP_JARGON_WORDS: readonly string[] = [
  'aggregate',
  'asset',
  'authenticate',
  'canonical',
  'configure',
  'credentials',
  'entity',
  'facilitate',
  'instantiate',
  'leverage',
  'metadata',
  'onboarding',
  'parameter',
  'provision',
  'utilize',
  'workflow',
];

/** Inherited from the house rules the press kit already enforces, restated here
 * because this module is checked by its own guard and the two lists must agree
 * about the em dash. `workspace` is caught by the press-kit guard, which this
 * file is listed in. */
const HELP_BANNED_WORDS: readonly string[] = ['ship', 'shipped', 'ships', 'shipping'];
const EM_DASH = '—';

/** Split on a full stop, question or exclamation mark that ends a sentence. */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Every rule the bar is made of, as a list of problems rather than a boolean.
 *
 * Reports ALL of them in one pass on purpose: a guard that stops at the first
 * problem turns one rewrite into four rounds of the same failing test.
 */
export function findHelpCopyProblems(text: string): string[] {
  const problems: string[] = [];

  if (!text.trim()) {
    // Everything below reads a sentence; there is nothing to say about none.
    return ['empty'];
  }
  if (text !== text.trim()) problems.push('untrimmed');
  if (/ {2}/.test(text)) problems.push('double space');
  if (text.length > MAX_HELP_CHARS) problems.push('too long');
  if (text.includes(EM_DASH)) problems.push('em dash');
  if (!/[.!?]$/.test(text.trim())) problems.push('no full stop');

  const sentences = sentencesOf(text);
  if (sentences.length > MAX_HELP_SENTENCES) problems.push('too many sentences');
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length > MAX_HELP_WORDS_PER_SENTENCE) {
      problems.push('sentence too long');
      break;
    }
  }

  // Word-bounded at the START only, so an inflection is caught ("configured")
  // while a word the list never named is not ("reconfigurement").
  for (const word of HELP_JARGON_WORDS) {
    if (new RegExp(`\\b${word}`, 'i').test(text)) problems.push(`jargon: ${word}`);
  }
  for (const word of HELP_BANNED_WORDS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) problems.push(`banned word: ${word}`);
  }

  return problems;
}

/** The bar as a sentence, built from the constants above so guidance and guard
 * cannot disagree. The `bannedCopyInstruction` precedent. */
export function helpCopyInstruction(): string {
  return (
    `At most ${MAX_HELP_SENTENCES} sentences, ${MAX_HELP_WORDS_PER_SENTENCE} words each. ` +
    'Plain words a beginner already knows. Never repeat the label you are explaining.'
  );
}

export const HELP_COPY = {
  // ---------------------------------------------------------------- side menu
  // The screenshot's own case. These rows had no explanation at all in the
  // expanded card; only the collapsed icon rail carried a native title.
  'nav.catalog': {
    label: 'Catalog',
    text: 'Every release you are working on, in one list. Tap one to open it.',
  },
  'nav.urgans': {
    label: 'UrgAns',
    text: 'Ask for help in plain words. It can make a plan or answer questions about your work.',
  },
  'nav.notes': {
    label: 'Notes',
    text: 'A quick place to write something down mid call. You can link it to a release later.',
  },
  'nav.shows': {
    label: 'Shows',
    text: 'Plan a live date: the set list, the running order, and the files your DJ needs.',
  },
  'nav.pitching': {
    label: 'Pitching',
    text: 'Send a song to a music list and see what the person running it said.',
  },
  'nav.directory': {
    label: 'Directory',
    text: 'Find people who have done this work before, like a designer or an engineer.',
  },
  'nav.metadata': {
    label: 'Metadata',
    text: 'The details music stores ask for before a song goes out, like genre and language.',
  },
  'nav.pitches': {
    label: 'Playlist pitches',
    text: 'Answers from the people who run music lists you sent songs to.',
  },
  'nav.admin': {
    label: 'Admin',
    text: 'Inside tools for the Urganize team. Only a few accounts can open this.',
  },
  'nav.settings': {
    label: 'Settings',
    text: 'Your account, your team, and what the app tells you about.',
  },

  // ------------------------------------------------------- metadata: the steps
  // Each of these replaced a helper paragraph that sat open above the step's
  // body. Step 2's was four sentences, the worst in the file.
  'metadata.step.details': {
    label: "The song's details",
    text: 'Spotify and Apple ask for these before a song can go out. Fill in what you know.',
  },
  'metadata.step.credits': {
    label: "Collect everyone's credits",
    text: 'Producers, writers and engineers each fill in one short form. They do not need an account.',
  },
  'metadata.step.answers': {
    label: 'Their answers land here',
    text: 'Names, shares and how to reach each person, one row each. You can save it as a file.',
  },

  // ------------------------------------------------------ metadata: the fields
  // Nine fields, each of which rendered its explanation as a grey line under
  // the input. Nine lines under nine inputs is the wall this pass removed.
  'metadata.field.genre': {
    label: 'Genre',
    text: 'The main style of the music, like Afrobeats or Hip-hop.',
  },
  'metadata.field.subgenre': {
    label: 'Subgenre',
    text: 'A more exact style, like Amapiano or Drill. Leave it blank if none fit.',
  },
  'metadata.field.language': {
    label: 'Language',
    text: 'What the words are sung in, like English or Yoruba.',
  },
  'metadata.field.labelName': {
    label: 'Label name',
    text: "The company putting this out. Use the artist's own name if there is no company.",
  },
  'metadata.field.isrc': {
    label: 'ISRC',
    text: 'A code for this one recording. Your distributor gives it to you.',
  },
  'metadata.field.upc': {
    label: 'UPC',
    text: 'The barcode for the whole release. This also comes from your distributor.',
  },
  'metadata.field.iswc': {
    label: 'ISWC',
    text: 'A code for the song itself, not the recording. Your publisher gives it to you.',
  },
  'metadata.field.pLine': {
    label: '℗ line',
    text: 'Who owns the recording, and the year it came out.',
  },
  'metadata.field.cLine': {
    label: '© line',
    text: 'Who owns the song and artwork, and the year they were made.',
  },

  // ---------------------------------------------------------------- settings
  // Four section intros that ran to three, four and five sentences. Only these
  // four: the rest of Settings is already one short line, and the two that read
  // longest are a delete warning and a plan lapse notice, where saying it twice
  // is the right call rather than clutter.
  'settings.export': {
    label: 'Your data',
    text: 'Releases, activities, files, notes, team and billing history. Included on every plan.',
  },
  'settings.directory': {
    label: 'Your directory record',
    text: 'Managers here look for people who have done the work a release needs. Listing yourself opens your page.',
  },
  'settings.teamBrief': {
    label: 'Team brief',
    text: 'None of this shows up in your Catalog. Anyone on the team can fill it in, and everyone gets the benefit.',
  },
  'settings.artists': {
    label: 'Artists',
    text: "Renaming one updates that artist's releases too. You pick one when you make a new release.",
  },

  // --------------------------------------------------------------- workspace
  'workspace.testRelease': {
    label: 'This is a test release',
    text: 'It comes with the full plan, so you can see how the real thing works. Delete it whenever you like.',
  },
} as const satisfies Record<string, HelpEntry>;

/** Keys are checked at the call site, so a typo is a build error rather than a
 * pullout that silently renders nothing. */
export type HelpKey = keyof typeof HELP_COPY;
