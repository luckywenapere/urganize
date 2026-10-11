// What each unbuilt area says for itself (design overhaul, 2026-10-04).
//
// Clicking an area that is not built yet lands on a screen in the place the
// real page will be, saying what it will do and offering a way to say "tell me".
// The words live here, not in the component, so they are testable and a guard can
// read them. Plain words a fifth grader follows, one idea a line.

import type { ShellAreaKey } from '@/lib/shell-nav';

export type ComingSoonCopy = {
  title: string;
  /** The question the area answers, from the strategy doc's own table. */
  question: string;
  /** What it will let a manager do. Three lines, no more. */
  willDo: [string, string, string];
  /** Where to go in the meantime, if there is somewhere useful. */
  meanwhile?: { label: string; href: string };
};

export const COMING_SOON: Partial<Record<ShellAreaKey | 'shows', ComingSoonCopy>> = {
  audience: {
    title: 'Audience',
    question: 'Who are the fans, and what is the data saying?',
    willDo: [
      'Collect fan emails from a rollout page and keep them in one place.',
      'See streaming and social numbers next to the rollout that moved them.',
      'Find out which rollouts brought the most new fans.',
    ],
  },
  relationships: {
    title: 'Relationships',
    question: 'Who do we work with?',
    willDo: [
      'Keep every producer, designer, DJ, curator and promoter in one book.',
      'See what each person delivered on past rollouts.',
      'Invite someone to a rollout in one tap.',
    ],
  },
  shows: {
    title: 'Shows',
    question: 'What is happening in the live business?',
    willDo: [
      'Book shows for each artist and keep the run of show together.',
      'Build a set to the minute and send it to the DJ.',
      'See what is coming up across the whole roster.',
    ],
  },
};

export function comingSoonFor(area: string): ComingSoonCopy | null {
  return COMING_SOON[area as ShellAreaKey | 'shows'] ?? null;
}
