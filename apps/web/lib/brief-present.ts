// Present and Seen (#897 phase 4, 2026-10-31). Pure: which screens a
// presentation shows, what each key does, and the "Seen the brief" line.

export type PresentSlide = 'idea' | 'look' | 'sound' | 'making' | 'dates';

const ORDER: PresentSlide[] = ['idea', 'look', 'sound', 'making', 'dates'];

/** The idea always; the rest only when they have something to show, so a young brief has no blank screens. */
export function presentSlides(counts: { images: number; links: number; pieces: number; dates: number }): PresentSlide[] {
  const has: Record<PresentSlide, boolean> = {
    idea: true,
    look: counts.images > 0,
    sound: counts.links > 0,
    making: counts.pieces > 0,
    dates: counts.dates > 0,
  };
  return ORDER.filter((slide) => has[slide]);
}

export type PresentAction = 'next' | 'prev' | 'first' | 'last' | 'close';

/** Arrows, space and Enter, and the Page Up / Page Down a presentation clicker sends. */
export function presentKeyAction(key: string): PresentAction | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Enter':
      return 'next';
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Escape':
      return 'close';
    default:
      return null;
  }
}

/** The next screen for an action. It stops at the ends: a clicker pressed once too often stays on the last screen. */
export function stepSlide(index: number, count: number, action: Exclude<PresentAction, 'close'>): number {
  const last = Math.max(0, count - 1);
  if (action === 'first') return 0;
  if (action === 'last') return last;
  return Math.min(last, Math.max(0, index + (action === 'next' ? 1 : -1)));
}

export type BriefSeenPerson = { userId: string; name: string; initials: string; seenAt: string };
export type BriefSeen = { people: BriefSeenPerson[]; total: number; line: string };

/**
 * Who on the team has opened the brief, newest first, and the line the board
 * shows. Views from people no longer on the team do not count. A team of one
 * gets no line: "1 of 1" says nothing.
 */
export function briefSeen(
  team: { userId: string; name: string; initials: string }[],
  views: { userId: string; seenAt: string }[]
): BriefSeen {
  const seenAt = new Map(views.map((view) => [view.userId, view.seenAt]));
  const people = team
    .filter((person) => seenAt.has(person.userId))
    .map((person) => ({ ...person, seenAt: seenAt.get(person.userId) as string }))
    .sort((a, b) => b.seenAt.localeCompare(a.seenAt));
  const total = team.length;
  const line =
    total <= 1 ? '' : people.length === total ? 'Everyone has seen the brief' : `Seen the brief: ${people.length} of ${total}`;
  return { people, total, line };
}
