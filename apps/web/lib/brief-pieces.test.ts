import { describe, expect, it } from 'vitest';
import {
  DELIVERABLE_MOVES,
  DELIVERABLE_TAG,
  PIECE_STEP_IDS,
  briefPieces,
  isBriefPiece,
  withBriefShow,
} from './brief-pieces';
import type { BriefTaskRow } from './release-brief';

function task(over: Partial<BriefTaskRow> & { id: string }): BriefTaskRow {
  return { title: over.id, status: 'todo', due_date: null, assigned_to_user_id: null, metadata: null, ...over };
}

const template = (taskId: string) => ({ template: { task_id: taskId } });

describe('isBriefPiece', () => {
  it('counts the playbook steps that make something', () => {
    expect(isBriefPiece(template('w5_cover_art_final_approved'))).toBe(true);
    expect(isBriefPiece(template('w9_ep_art_approved'))).toBe(true);
    expect(isBriefPiece(template('w3_album_teaser_rollout'))).toBe(true);
  });

  it('leaves out the steps that brief, plan or check', () => {
    expect(isBriefPiece(template('w7_brief_designer'))).toBe(false);
    expect(isBriefPiece(template('w6_upload_to_distributor'))).toBe(false);
    expect(isBriefPiece(null)).toBe(false);
  });

  it('counts a planner task tagged as a deliverable', () => {
    expect(isBriefPiece({ planner: { tags: ['content', DELIVERABLE_TAG] } })).toBe(true);
    expect(isBriefPiece({ planner: { tags: ['content'] } })).toBe(false);
  });

  it('lets a person put any task on the brief, or take one off', () => {
    expect(isBriefPiece({ brief: { show: true } })).toBe(true);
    expect(isBriefPiece({ ...template('w5_cover_art_final_approved'), brief: { show: false } })).toBe(false);
  });

  it('has a piece for each kind of release', () => {
    for (const id of ['w5_cover_art_final_approved', 'w11_single_art_approved', 'w13_album_art_approved']) {
      expect(PIECE_STEP_IDS.has(id), id).toBe(true);
    }
  });
});

describe('withBriefShow', () => {
  it('sets the choice and keeps everything else', () => {
    const before = { template: { task_id: 'x' }, phase: 'pre' };
    expect(withBriefShow(before, true)).toEqual({ template: { task_id: 'x' }, phase: 'pre', brief: { show: true } });
    expect(withBriefShow(null, false)).toEqual({ brief: { show: false } });
  });
});

describe('briefPieces', () => {
  const today = '2026-10-30';
  const piece = (id: string, over: Partial<BriefTaskRow> = {}) =>
    task({ id, metadata: { brief: { show: true } }, ...over });

  it('lists only pieces, open ones by date, undated after, done last', () => {
    const list = briefPieces(
      [
        piece('done', { status: 'done', due_date: '2026-10-01' }),
        piece('undated'),
        piece('later', { due_date: '2026-11-20' }),
        piece('soon', { due_date: '2026-11-02' }),
        task({ id: 'not-a-piece', due_date: '2026-10-31' }),
        piece('dropped', { status: 'cancelled' }),
      ],
      today
    );
    expect(list.items.map((item) => item.id)).toEqual(['soon', 'later', 'undated', 'done']);
  });

  it('says which are late and counts them', () => {
    const list = briefPieces(
      [piece('late', { due_date: '2026-10-20' }), piece('ok', { due_date: '2026-11-20' }), piece('d', { status: 'done' })],
      today
    );
    expect(list.items.find((item) => item.id === 'late')?.state).toBe('late');
    expect(list.items.find((item) => item.id === 'ok')?.state).toBe('open');
    expect(list).toMatchObject({ done: 1, total: 3, late: 1 });
  });

  it('takes the first line of the description as the spec', () => {
    const list = briefPieces([piece('p', { description: '30 seconds, vertical, golden hour\nmore notes' })], today);
    expect(list.items[0].spec).toBe('30 seconds, vertical, golden hour');
  });
});

describe('the piece lists match the playbooks and the planner', () => {
  it('names only steps that exist, so a renamed step cannot quietly drop a piece', async () => {
    const { SINGLE_RELEASE_TEMPLATE } = await import('./release-templates/single');
    const { EP_RELEASE_TEMPLATE } = await import('./release-templates/ep');
    const { ALBUM_RELEASE_TEMPLATE } = await import('./release-templates/album');
    const ids = new Set(
      [SINGLE_RELEASE_TEMPLATE, EP_RELEASE_TEMPLATE, ALBUM_RELEASE_TEMPLATE].flatMap((t) => t.tasks.map((task) => task.id))
    );
    for (const id of PIECE_STEP_IDS) expect(ids.has(id), id).toBe(true);
  });

  it('names only planner moves that exist', async () => {
    const { NIGERIA_PACK } = await import('./planner-v2/moves');
    const ids = new Set(NIGERIA_PACK.map((move) => move.id));
    for (const id of DELIVERABLE_MOVES) expect(ids.has(id), id).toBe(true);
  });
});
