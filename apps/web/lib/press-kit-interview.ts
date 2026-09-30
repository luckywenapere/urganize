import type {
  PressKitSection,
  PressKitSectionContent,
  PressKitSectionKey,
} from '@/types/press-kits';

/**
 * The gap interview.
 *
 * Pure: the questions are COMPUTED from what the kit already holds, so nobody
 * is ever asked for something autofill found, and a person who answers half of
 * them and comes back tomorrow is asked only about the rest.
 *
 * Every question is skippable and captioned with what press use it for, which
 * is the brief's rule: a person should never be asked for something without
 * being told why it is wanted.
 */

export type InterviewQuestionKind = 'text' | 'bio' | 'place' | 'contact-roles' | 'links';

export type InterviewQuestion = {
  id: string;
  section: PressKitSectionKey;
  /** What the screen asks. */
  title: string;
  /** Why press want it. Shown under the question, always. */
  caption: string;
  kind: InterviewQuestionKind;
  placeholder?: string;
  /** Roughly how long the answer should be, for the bio screens. */
  words?: number;
};

/**
 * One pass asks eight at most (the brief's cap). More than that stops being an
 * interview and becomes the form this feature exists to avoid; whatever is left
 * is asked on the next pass.
 */
export const MAX_QUESTIONS_PER_PASS = 8;

const filled = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : Boolean(value);

const contentOf = (
  sections: readonly PressKitSection[],
  key: PressKitSectionKey
): PressKitSectionContent => sections.find((entry) => entry.section === key)?.content || {};

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

/**
 * Every question this interview can ask, in the order it asks them, each with
 * the test for whether it is still a gap.
 *
 * The order is not arbitrary: the one line comes first because it is what a
 * journalist reads first and reuses in their intro, and the contact roles come
 * late because autofill has already put the names there and only the job title
 * is missing.
 */
const QUESTIONS: (InterviewQuestion & {
  isGap: (sections: readonly PressKitSection[]) => boolean;
})[] = [
  {
    id: 'descriptor',
    section: 'header',
    title: 'How would you describe this artist in one line?',
    caption: 'This is the sentence a journalist will reuse in their intro.',
    kind: 'text',
    placeholder: 'Afrobeats singer and songwriter',
    isGap: (sections) => !filled(contentOf(sections, 'header').descriptor),
  },
  {
    id: 'home',
    section: 'header',
    title: 'Where are they from?',
    caption: 'Press put the city in the first line, and it decides who covers them.',
    kind: 'place',
    isGap: (sections) => !filled(contentOf(sections, 'header').homeCity),
  },
  {
    id: 'bio-short',
    section: 'bios',
    title: 'The short bio',
    caption: 'About fifty words, for a listing or a caption. Write it in the third person.',
    kind: 'bio',
    words: 50,
    isGap: (sections) => !filled(contentOf(sections, 'bios').short),
  },
  {
    id: 'bio-medium',
    section: 'bios',
    title: 'The medium bio',
    caption: 'About a hundred and fifty words. This is the one most editors will use.',
    kind: 'bio',
    words: 150,
    isGap: (sections) => !filled(contentOf(sections, 'bios').medium),
  },
  {
    id: 'bio-long',
    section: 'bios',
    title: 'The long bio',
    caption: 'About three hundred words, for a feature or a programme note.',
    kind: 'bio',
    words: 300,
    isGap: (sections) => !filled(contentOf(sections, 'bios').long),
  },
  {
    id: 'hook',
    section: 'latest_release',
    title: 'Why is this release worth writing about?',
    caption: 'One or two lines. This is what an editor decides on.',
    kind: 'text',
    placeholder: 'The first song they wrote after moving back to Lagos.',
    // Only worth asking once autofill has found a release to hook. With no
    // release there is nothing for the answer to be about.
    isGap: (sections) => {
      const content = contentOf(sections, 'latest_release');
      return filled(content.releaseId) && !filled(content.hook);
    },
  },
  {
    id: 'contact-roles',
    section: 'contact',
    title: 'What does each person do?',
    caption:
      'Press need to know who to email about what. This is the one thing a kit cannot go live without.',
    kind: 'contact-roles',
    // Autofill puts the names and emails here and deliberately leaves the role
    // blank, because the only role the product holds is a permission level.
    isGap: (sections) => {
      const contacts = rows(contentOf(sections, 'contact').contacts);
      return contacts.length > 0 && contacts.some((contact) => !filled(contact.role));
    },
  },
  {
    id: 'links',
    section: 'links',
    title: 'Where can people hear them?',
    caption: 'Spotify, Apple Music, Audiomack, YouTube, and their socials.',
    kind: 'links',
    isGap: (sections) => rows(contentOf(sections, 'links').links).length === 0,
  },
];

/** The questions still worth asking, in order, capped at one pass. */
export function buildInterviewQuestions(
  sections: readonly PressKitSection[]
): InterviewQuestion[] {
  return QUESTIONS.filter((question) => question.isGap(sections))
    .slice(0, MAX_QUESTIONS_PER_PASS)
    .map(({ isGap: _isGap, ...question }) => question);
}

/** How many gaps are left, for the card that offers the interview. Counts
 *  every gap, not just the ones one pass can hold. */
export function countInterviewGaps(sections: readonly PressKitSection[]): number {
  return QUESTIONS.filter((question) => question.isGap(sections)).length;
}

/**
 * Fold one answer into the section it belongs to.
 *
 * MERGES, never replaces. Answering the long bio must not blank the short one,
 * and a section carries fields no question asks about (the genres autofill
 * found, the release title) that an answer has no business removing. Returns a
 * new object rather than editing the one it was given.
 */
export function applyAnswerToContent(
  content: PressKitSectionContent,
  answer: PressKitSectionContent
): PressKitSectionContent {
  return { ...(content || {}), ...(answer || {}) };
}

/** "Question 3 of 5", against the questions actually being asked rather than
 *  the full list, so a short pass never counts up to a number nobody sees. */
export function getStepKicker(step: number, total: number): string {
  return `Question ${step + 1} of ${total}`;
}
