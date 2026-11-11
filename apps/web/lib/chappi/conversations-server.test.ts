import { describe, expect, it } from 'vitest';
import { decodeNoteCursor } from '@/lib/note-paging';
import { deleteChat, getChat, listChats, syncChat } from './conversations-server';

// The table half of UrgAns chat history. The decisions themselves are tested
// in conversation-history.test.ts; what is under test here is that this module
// turns them into the RIGHT queries: always scoped to the owner, the update
// conditional on the revision it was decided against, and a lost race
// answered honestly instead of overwriting another tab's save.
//
// The repo mocks no database, so this is the chat-log-server.test.ts
// approach: a hand-rolled client that records every query and answers from a
// function the test supplies.

type Op = {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  columns?: string;
  filters: Array<[string, unknown]>;
  orFilter?: string;
  orders: Array<[string, boolean]>;
  limit?: number;
};

type Answer = { data: unknown; error: unknown };

function fakeAdmin(respond: (op: Op, index: number) => Answer) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const start = (kind: Op['kind'], payload?: Record<string, unknown>) => {
        const op: Op = { table, kind, payload, filters: [], orders: [] };
        const index = ops.push(op) - 1;
        const answer = () => Promise.resolve(respond(op, index));
        const builder = {
          select(columns: string) {
            op.columns = columns;
            return builder;
          },
          eq(column: string, value: unknown) {
            op.filters.push([column, value]);
            return builder;
          },
          is(column: string, value: unknown) {
            op.filters.push([`${column}:is`, value]);
            return builder;
          },
          or(expression: string) {
            op.orFilter = expression;
            return builder;
          },
          order(column: string, options?: { ascending?: boolean }) {
            op.orders.push([column, options?.ascending ?? true]);
            return builder;
          },
          limit(count: number) {
            op.limit = count;
            return builder;
          },
          maybeSingle: answer,
          single: answer,
          then(resolve: (value: Answer) => unknown, reject?: (reason: unknown) => unknown) {
            return answer().then(resolve, reject);
          },
        };
        return builder;
      };
      return {
        select: (columns: string) => start('select').select(columns),
        insert: (payload: Record<string, unknown>) => start('insert', payload),
        update: (payload: Record<string, unknown>) => start('update', payload),
        delete: () => start('delete'),
      };
    },
  };
  return { client: client as never, ops };
}

const USER = 'user-1';
const CHAT = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-24T12:00:00.000Z');

function message(id: string, role: 'user' | 'assistant' = 'user', content = `text ${id}`) {
  return { id, role, content };
}

function storedRow(over: Record<string, unknown> = {}) {
  return {
    id: CHAT,
    owner_user_id: USER,
    title: 'Plan the EP',
    revision: 3,
    messages: [message('a', 'user', 'Plan the EP'), message('b', 'assistant')],
    message_count: 2,
    last_message_at: '2026-09-24T11:00:00+00:00',
    created_at: '2026-09-24T09:00:00+00:00',
    ...over,
  };
}

const none: Answer = { data: null, error: null };

describe('syncChat', () => {
  it('creates the chat on its first save, owned by the caller and titled from its first message', async () => {
    const { client, ops } = fakeAdmin((op) =>
      op.kind === 'insert'
        ? { data: { revision: 1, last_message_at: '2026-09-24T12:00:00+00:00' }, error: null }
        : none
    );

    const result = await syncChat(
      client,
      USER,
      CHAT,
      { baseRevision: 0, keepCount: 0, append: [message('a', 'user', 'Plan the EP'), message('b', 'assistant')] },
      NOW
    );

    expect(result).toEqual({
      ok: true,
      value: {
        revision: 1,
        messageIds: ['a', 'b'],
        title: 'Plan the EP',
        lastMessageAt: '2026-09-24T12:00:00+00:00',
      },
    });
    const insert = ops.find((op) => op.kind === 'insert');
    expect(insert?.table).toBe('urgans_conversations');
    expect(insert?.payload).toMatchObject({
      id: CHAT,
      owner_user_id: USER,
      title: 'Plan the EP',
      message_count: 2,
      revision: 1,
      last_message_at: NOW.toISOString(),
    });
  });

  it('reads only the caller\'s own row', async () => {
    const { client, ops } = fakeAdmin(() => none);
    await syncChat(client, USER, CHAT, { baseRevision: 2, keepCount: 2, append: [message('c')] }, NOW);
    expect(ops[0].kind).toBe('select');
    expect(ops[0].filters).toEqual(
      expect.arrayContaining([
        ['id', CHAT],
        ['owner_user_id', USER],
      ])
    );
  });

  it('updates only if the revision is still the one the save was built on', async () => {
    const { client, ops } = fakeAdmin((op) => {
      if (op.kind === 'select') return { data: storedRow(), error: null };
      return { data: [{ revision: 4, last_message_at: '2026-09-24T12:00:00+00:00' }], error: null };
    });

    const result = await syncChat(
      client,
      USER,
      CHAT,
      { baseRevision: 3, keepCount: 2, append: [message('c')] },
      NOW
    );

    expect(result).toMatchObject({ ok: true, value: { revision: 4, messageIds: ['a', 'b', 'c'] } });
    const update = ops.find((op) => op.kind === 'update');
    expect(update?.filters).toEqual(
      expect.arrayContaining([
        ['id', CHAT],
        ['owner_user_id', USER],
        ['revision', 3],
      ])
    );
    expect(update?.payload).toMatchObject({ revision: 4, message_count: 3 });
    expect((update?.payload?.messages as unknown[]).length).toBe(3);
  });

  it('refuses a stale save with what the server holds, and writes nothing', async () => {
    const { client, ops } = fakeAdmin(() => ({ data: storedRow({ revision: 5 }), error: null }));

    const result = await syncChat(client, USER, CHAT, { baseRevision: 3, keepCount: 2, append: [message('c')] }, NOW);

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: expect.any(String),
      conflict: { revision: 5, messageIds: ['a', 'b'] },
    });
    expect(ops.some((op) => op.kind === 'update' || op.kind === 'insert')).toBe(false);
  });

  it('answers a race lost to another tab as a conflict carrying the NEW state', async () => {
    const { client } = fakeAdmin((op, index) => {
      if (op.kind === 'update') return { data: [], error: null };
      // First read: revision 3. Re-read after the update matched nothing: 4.
      return index === 0
        ? { data: storedRow(), error: null }
        : { data: storedRow({ revision: 4, messages: [message('a'), message('b'), message('x')] }), error: null };
    });

    const result = await syncChat(client, USER, CHAT, { baseRevision: 3, keepCount: 2, append: [message('c')] }, NOW);

    expect(result).toMatchObject({ ok: false, status: 409, conflict: { revision: 4, messageIds: ['a', 'b', 'x'] } });
  });

  it('answers a race lost to a delete as not found', async () => {
    const { client } = fakeAdmin((op, index) => {
      if (op.kind === 'update') return { data: [], error: null };
      return index === 0 ? { data: storedRow(), error: null } : none;
    });

    const result = await syncChat(client, USER, CHAT, { baseRevision: 3, keepCount: 2, append: [message('c')] }, NOW);

    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('never re-creates a chat that was saved and then deleted', async () => {
    const { client, ops } = fakeAdmin(() => none);

    const result = await syncChat(client, USER, CHAT, { baseRevision: 2, keepCount: 2, append: [message('c')] }, NOW);

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(ops.some((op) => op.kind === 'insert')).toBe(false);
  });

  it('answers a first-save collision with its own row as a conflict', async () => {
    const { client } = fakeAdmin((op, index) => {
      if (op.kind === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' } };
      return index === 0 ? none : { data: storedRow({ revision: 1 }), error: null };
    });

    const result = await syncChat(client, USER, CHAT, { baseRevision: 0, keepCount: 0, append: [message('a')] }, NOW);

    expect(result).toMatchObject({ ok: false, status: 409, conflict: { revision: 1 } });
  });

  it("answers a collision with somebody else's id as not found, never revealing it", async () => {
    const { client } = fakeAdmin((op) =>
      op.kind === 'insert' ? { data: null, error: { code: '23505', message: 'duplicate key' } } : none
    );

    const result = await syncChat(client, USER, CHAT, { baseRevision: 0, keepCount: 0, append: [message('a')] }, NOW);

    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('answers a chat past the cap as too large', async () => {
    const append = Array.from({ length: 501 }, (_, index) => message(`m${index}`));
    const { client, ops } = fakeAdmin(() => none);

    const result = await syncChat(client, USER, CHAT, { baseRevision: 0, keepCount: 0, append }, NOW);

    expect(result).toMatchObject({ ok: false, status: 413 });
    expect(ops.some((op) => op.kind === 'insert')).toBe(false);
  });

  it('reports a failed read as a server error rather than guessing', async () => {
    const { client } = fakeAdmin(() => ({ data: null, error: { message: 'down' } }));
    const result = await syncChat(client, USER, CHAT, { baseRevision: 0, keepCount: 0, append: [message('a')] }, NOW);
    expect(result).toMatchObject({ ok: false, status: 500 });
  });
});

describe('getChat', () => {
  it('returns the whole chat, scoped to its owner', async () => {
    const { client, ops } = fakeAdmin(() => ({ data: storedRow(), error: null }));

    const result = await getChat(client, USER, CHAT);

    expect(result).toEqual({
      ok: true,
      value: {
        id: CHAT,
        title: 'Plan the EP',
        messageCount: 2,
        lastMessageAt: '2026-09-24T11:00:00+00:00',
        createdAt: '2026-09-24T09:00:00+00:00',
        revision: 3,
        messages: [message('a', 'user', 'Plan the EP'), message('b', 'assistant')],
      },
    });
    expect(ops[0].filters).toEqual(
      expect.arrayContaining([
        ['id', CHAT],
        ['owner_user_id', USER],
      ])
    );
  });

  it('is not found for a missing chat and for somebody else\'s alike', async () => {
    const { client } = fakeAdmin(() => none);
    expect(await getChat(client, USER, CHAT)).toMatchObject({ ok: false, status: 404 });
  });
});

describe('listChats', () => {
  const rows = [
    { id: '33333333-3333-4333-8333-333333333333', title: 'C', message_count: 4, last_message_at: '2026-09-24T11:00:00+00:00', created_at: '2026-09-24T10:00:00+00:00' },
    { id: '22222222-2222-4222-8222-222222222222', title: 'B', message_count: 2, last_message_at: '2026-09-24T10:00:00+00:00', created_at: '2026-09-24T09:00:00+00:00' },
    { id: '11111111-1111-4111-8111-111111111111', title: 'A', message_count: 1, last_message_at: '2026-09-24T09:00:00+00:00', created_at: '2026-09-24T08:00:00+00:00' },
  ];

  it('pages newest first, scoped to the owner, asking for one extra row to know if there is more', async () => {
    const { client, ops } = fakeAdmin(() => ({ data: rows, error: null }));

    const result = await listChats(client, USER, null, 2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chats.map((chat) => chat.title)).toEqual(['C', 'B']);
    // Earlier pages of the one Assistant chat never show in the list (#1207).
    expect(ops[0].filters).toEqual([
      ['owner_user_id', USER],
      ['thread_key:is', null],
    ]);
    expect(ops[0].limit).toBe(3);
    expect(ops[0].orders).toEqual([
      ['last_message_at', false],
      ['id', false],
    ]);
    expect(decodeNoteCursor(result.value.nextCursor)).toEqual({
      updatedAt: '2026-09-24T10:00:00+00:00',
      id: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('has no next page when the probe row does not come back', async () => {
    const { client } = fakeAdmin(() => ({ data: rows.slice(0, 2), error: null }));
    const result = await listChats(client, USER, null, 2);
    expect(result).toMatchObject({ ok: true, value: { nextCursor: null } });
  });

  it('continues strictly after the cursor', async () => {
    const { client, ops } = fakeAdmin(() => ({ data: [], error: null }));
    await listChats(client, USER, { updatedAt: '2026-09-24T10:00:00+00:00', id: '22222222-2222-4222-8222-222222222222' }, 2);
    expect(ops[0].orFilter).toBe(
      'last_message_at.lt.2026-09-24T10:00:00+00:00,and(last_message_at.eq.2026-09-24T10:00:00+00:00,id.lt.22222222-2222-4222-8222-222222222222)'
    );
  });
});

describe('deleteChat', () => {
  it('deletes only the caller\'s own chat, and succeeds when there was nothing to delete', async () => {
    const { client, ops } = fakeAdmin(() => none);

    expect(await deleteChat(client, USER, CHAT)).toEqual({ ok: true, value: null });
    expect(ops[0].kind).toBe('delete');
    expect(ops[0].filters).toEqual(
      expect.arrayContaining([
        ['id', CHAT],
        ['owner_user_id', USER],
      ])
    );
  });

  it('reports a failed delete', async () => {
    const { client } = fakeAdmin(() => ({ data: null, error: { message: 'down' } }));
    expect(await deleteChat(client, USER, CHAT)).toMatchObject({ ok: false, status: 500 });
  });
});
