// The Assistant on a computer holds every chat (Nov 12, 2026, #1218, part of
// #1175; founder approved docs/mocks/assistant-chats-desktop): the general
// chat on top, each rollout's own chat under it. The Rollouts top tab left the
// computer's top bar; its address still lands here. Pure, so it is tested.

import { URGANS_HREF } from './shell-nav';

/** How many rollout chats show before "Show all N". */
export const ROLLOUT_CHATS_SHOWN = 5;

/** The query key that names the open rollout chat on the Assistant page. */
export const ASSISTANT_ROLLOUT_PARAM = 'rollout';

type Orderable = { last: string | null; releaseDate: string | null };

/**
 * Chats you have used come first, newest message on top; then the rest by
 * release date, soonest first, undated last. The same rule the Rollouts list
 * used (Nov 2, 2026).
 */
export function orderRolloutChats<T extends Orderable>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.last && b.last) return b.last.localeCompare(a.last);
    if (a.last) return -1;
    if (b.last) return 1;
    return String(a.releaseDate ?? '9999').localeCompare(String(b.releaseDate ?? '9999'));
  });
}

/** The rows the left column draws: the first few, or all once expanded. The
 *  open chat stays in view even when it sits below the fold. */
export function shownRolloutChats<T extends { id: string }>(
  rows: readonly T[],
  { expanded, openId }: { expanded: boolean; openId: string | null }
): T[] {
  if (expanded || rows.length <= ROLLOUT_CHATS_SHOWN) return [...rows];
  const shown = rows.slice(0, ROLLOUT_CHATS_SHOWN);
  if (openId && !shown.some((row) => row.id === openId)) {
    const open = rows.find((row) => row.id === openId);
    if (open) shown.push(open);
  }
  return shown;
}

/** The Assistant page, on a rollout's chat when one is given. */
export function assistantHref(releaseId: string | null | undefined): string {
  return releaseId ? `${URGANS_HREF}?${ASSISTANT_ROLLOUT_PARAM}=${encodeURIComponent(releaseId)}` : URGANS_HREF;
}

/** The rollout chat the Assistant address names, or null for the general chat. */
export function readAssistantRollout(search: string | null | undefined): string | null {
  return new URLSearchParams(search ?? '').get(ASSISTANT_ROLLOUT_PARAM) || null;
}

/**
 * Where /dashboard/sessions sends a computer: the rollout named in its address
 * (?release=), else the rollout chat that was open there, else the general chat.
 */
export function sessionsRedirectHref({
  search,
  openReleaseId,
}: {
  search: string | null | undefined;
  openReleaseId: string | null;
}): string {
  const named = new URLSearchParams(search ?? '').get('release') || null;
  return assistantHref(named ?? openReleaseId);
}
