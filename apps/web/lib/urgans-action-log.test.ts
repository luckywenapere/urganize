import { describe, expect, it } from 'vitest';
import {
  buildActionLogRow,
  capJson,
  isLoggedLevel,
  resolveLogObject,
  URGANS_ACTION_SOURCES,
  URGANS_TOOL_LEVELS,
} from './urgans-action-log';

describe('levels', () => {
  it('has exactly the four levels', () => {
    expect([...URGANS_TOOL_LEVELS]).toEqual(['read', 'suggest', 'confirm', 'auto']);
  });

  it('logs writes and never reads or suggestions', () => {
    expect(isLoggedLevel('read')).toBe(false);
    expect(isLoggedLevel('suggest')).toBe(false);
    expect(isLoggedLevel('confirm')).toBe(true);
    expect(isLoggedLevel('auto')).toBe(true);
  });

  it('names every entry point', () => {
    for (const source of ['chat', 'voice', 'mcp', 'whatsapp', 'embedded', 'cron', 'memory']) {
      expect(URGANS_ACTION_SOURCES).toContain(source);
    }
  });
});

describe('resolveLogObject', () => {
  it('prefers the most specific id', () => {
    expect(resolveLogObject({ releaseId: 'r1', taskId: 't1' })).toEqual({ type: 'task', ids: ['t1'] });
    expect(resolveLogObject({ releaseId: 'r1' })).toEqual({ type: 'release', ids: ['r1'] });
    expect(resolveLogObject({ releaseId: 'r1', artistId: 'a1' })).toEqual({ type: 'release', ids: ['r1'] });
    expect(resolveLogObject({ artistId: 'a1' })).toEqual({ type: 'artist', ids: ['a1'] });
    expect(resolveLogObject({ kitId: 'k1' })).toEqual({ type: 'press_kit', ids: ['k1'] });
    expect(resolveLogObject({ noteId: 'n1' })).toEqual({ type: 'note', ids: ['n1'] });
  });

  it('reads a list of task ids', () => {
    expect(resolveLogObject({ taskIds: ['t1', 't2', '', 3] })).toEqual({ type: 'task', ids: ['t1', 't2'] });
  });

  it('returns null with no id', () => {
    expect(resolveLogObject({ title: 'New single' })).toBeNull();
    expect(resolveLogObject({ taskId: '  ' })).toBeNull();
  });
});

describe('capJson', () => {
  it('keeps small values as they are', () => {
    expect(capJson({ a: 1 })).toEqual({ a: 1 });
    expect(capJson(null)).toBeNull();
    expect(capJson(undefined)).toBeNull();
  });

  it('replaces a value that is too big with a marker', () => {
    const big = { text: 'x'.repeat(20_000) };
    expect(capJson(big, 1000)).toEqual({ truncated: true, chars: JSON.stringify(big).length });
  });

  it('survives a value that cannot be serialised', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(capJson(loop)).toEqual({ unserialisable: true });
  });
});

const U = '11111111-1111-4111-8111-111111111111';
const W = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';

describe('buildActionLogRow', () => {
  it('maps every field to its column', () => {
    const row = buildActionLogRow({
      source: 'whatsapp',
      trigger: 'whatsapp_reply',
      tool: 'whatsapp.mark_done',
      level: 'auto',
      actorUserId: U,
      workspaceId: W,
      releaseId: R,
      objectType: 'task',
      objectId: 't1',
      args: { reply: 'Done' },
      before: { status: 'todo' },
      after: { status: 'done' },
      confirmed: false,
      ok: true,
      summary: 'Marked done',
    });
    expect(row).toEqual({
      source: 'whatsapp',
      trigger: 'whatsapp_reply',
      tool: 'whatsapp.mark_done',
      level: 'auto',
      actor_user_id: U,
      workspace_id: W,
      release_id: R,
      object_type: 'task',
      object_id: 't1',
      args: { reply: 'Done' },
      before: { status: 'todo' },
      after: { status: 'done' },
      confirmed: false,
      ok: true,
      summary: 'Marked done',
      error: null,
    });
  });

  it('fills nulls for what is missing and never drops ok', () => {
    const row = buildActionLogRow({ source: 'cron', trigger: 'daily_sweep', tool: 'whatsapp.chase', level: 'auto', ok: false, error: 'boom' });
    expect(row.actor_user_id).toBeNull();
    expect(row.release_id).toBeNull();
    expect(row.before).toBeNull();
    expect(row.confirmed).toBe(false);
    expect(row.ok).toBe(false);
    expect(row.error).toBe('boom');
  });

  it('cuts a long summary', () => {
    const row = buildActionLogRow({ source: 'chat', trigger: 'message', tool: 'create_task', level: 'auto', ok: true, summary: 'y'.repeat(2000) });
    expect(row.summary?.length).toBe(500);
  });

  it('drops a uuid that is not one, so a bad id cannot fail the insert', () => {
    const row = buildActionLogRow({ source: 'chat', trigger: 'message', tool: 'create_task', level: 'auto', ok: true, releaseId: 'not-a-uuid', workspaceId: 'also-not' });
    expect(row.release_id).toBeNull();
    expect(row.workspace_id).toBeNull();
  });
});
