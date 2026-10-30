// What we're making (#897 phase 3, 2026-10-30): the pieces of a rollout, on
// the brief. A piece is a task that makes something a person can see or hear
// (cover art, a teaser, a press release, the release day posts), not one that
// briefs, plans or checks. Status, owner and due date always come from the
// task, so the plan stays the only place they are typed.

import { lagosDay, type BriefTaskRow } from '@/lib/release-brief';

/** The tag planner v2 puts on a task that came from a move that makes something. */
export const DELIVERABLE_TAG = 'deliverable';

/**
 * The playbook steps that are pieces: the step where the thing is finished or
 * goes out, one per piece, in the single, EP and album playbooks. Drafts,
 * briefs to the designer and uploads are the work around a piece, not pieces.
 */
export const PIECE_STEP_IDS: ReadonlySet<string> = new Set([
  // Single
  'w5_cover_art_final_approved',
  'w4_teaser_rollout',
  'w2_snippet_release',
  'w3_send_press_release',
  'w2_prepare_release_day_posts',
  'w1_countdown_content',
  // EP
  'w11_single_art_approved',
  'w9_ep_art_approved',
  'w9_single_teasers',
  'w9_single_snippet',
  'w7_single_countdown',
  'w3_ep_teaser_rollout',
  'w4_send_press_release',
  'w2_prepare_release_day_content',
  'w1_countdown',
  // Album
  'w14_single_1_art_approved',
  'w13_album_art_approved',
  'w9_single_2_art_approved',
  'w13_single_1_teasers',
  'w8_single_2_teasers',
  'w3_album_teaser_rollout',
]);

/** Planner v2 moves that make something; their tasks carry DELIVERABLE_TAG. */
export const DELIVERABLE_MOVES: ReadonlySet<string> = new Set([
  'ng_own_content',
  'ng_dj_pack',
  'ng_youtube_premiere',
  'ng_merch_drop',
]);

type Meta = Record<string, unknown>;
const asMeta = (value: unknown): Meta => (value && typeof value === 'object' ? (value as Meta) : {});
const tagsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []);

/**
 * Whether a task shows in What we're making. A person's choice wins
 * (metadata.brief.show, from the task drawer or + Piece); otherwise a
 * playbook piece step, or a planner task tagged as a deliverable.
 */
export function isBriefPiece(metadata: unknown): boolean {
  const meta = asMeta(metadata);
  const choice = asMeta(meta.brief).show;
  if (typeof choice === 'boolean') return choice;
  const template = asMeta(meta.template);
  if (typeof template.task_id === 'string' && PIECE_STEP_IDS.has(template.task_id)) return true;
  return [...tagsOf(template.tags), ...tagsOf(asMeta(meta.planner).tags)].includes(DELIVERABLE_TAG);
}

/** The task's metadata with the person's choice set, everything else kept. */
export function withBriefShow(metadata: unknown, show: boolean): Meta {
  const meta = asMeta(metadata);
  return { ...meta, brief: { ...asMeta(meta.brief), show } };
}

export type BriefPieceState = 'done' | 'late' | 'open';

export type BriefPiece = {
  id: string;
  title: string;
  /** The first line of the task's description: what it is, in a line. */
  spec: string;
  dueDate: string | null;
  state: BriefPieceState;
  assigneeId: string | null;
};

export type BriefPieces = { items: BriefPiece[]; done: number; total: number; late: number };

/** The pieces in the order a team works them: open by due date, undated after, done last. Cancelled ones are out. */
export function briefPieces(tasks: (BriefTaskRow & { description?: string | null })[], today: string): BriefPieces {
  const items: BriefPiece[] = [];
  for (const task of tasks) {
    const status = String(task.status || '');
    if (status === 'cancelled' || !isBriefPiece(task.metadata)) continue;
    const due = lagosDay(task.due_date);
    items.push({
      id: task.id,
      title: task.title || 'Untitled',
      spec: (task.description ?? '').trim().split('\n')[0].trim(),
      dueDate: due,
      state: status === 'done' ? 'done' : due && due < today ? 'late' : 'open',
      assigneeId: task.assigned_to_user_id,
    });
  }
  const rank = (piece: BriefPiece) => (piece.state === 'done' ? 2 : piece.dueDate ? 0 : 1);
  items.sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.title.localeCompare(b.title));
  return {
    items,
    done: items.filter((piece) => piece.state === 'done').length,
    total: items.length,
    late: items.filter((piece) => piece.state === 'late').length,
  };
}
