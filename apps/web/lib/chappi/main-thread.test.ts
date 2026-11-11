import { describe, expect, it } from 'vitest';
import type { StoredChatMessage } from './conversation-history';
import {
  MAIN_ARCHIVE_AT_MESSAGES,
  MAIN_KEEP_MESSAGES,
  foldedSessionLabel,
  foldedSessionMessages,
  isFoldedSession,
  looseSessionIds,
  planMainArchive,
  rebaseOnServer,
} from './main-thread';

const USER = '11111111-1111-4111-8111-111111111111';

function turns(count: number): StoredChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message ${index}`,
  }));
}

describe('planMainArchive', () => {
  it('leaves a short chat alone', () => {
    expect(planMainArchive(turns(10))).toBeNull();
  });

  it('moves the oldest out once the chat is long, keeping the newest', () => {
    const messages = turns(MAIN_ARCHIVE_AT_MESSAGES);
    const plan = planMainArchive(messages);
    expect(plan).not.toBeNull();
    expect(plan!.archive.length + plan!.keep.length).toBe(messages.length);
    expect(plan!.keep.length).toBeLessThanOrEqual(MAIN_KEEP_MESSAGES);
    expect(plan!.keep[0].role).toBe('user');
    expect(plan!.keep.at(-1)).toEqual(messages.at(-1));
  });

  it('moves out when forced, even when short', () => {
    expect(planMainArchive(turns(MAIN_KEEP_MESSAGES + 10), true)).not.toBeNull();
  });
});

describe('folding an old session', () => {
  it('heads it with a divider naming the old title and date', () => {
    const folded = foldedSessionMessages({
      id: 'abc',
      title: 'Pitch ideas',
      lastMessageAt: '2026-10-03T10:00:00Z',
      messages: turns(2),
    });
    expect(folded[0]).toMatchObject({ id: 'fold-abc', kind: 'divider', content: 'From "Pitch ideas" · 3 Oct' });
    expect(folded.slice(1)).toEqual(turns(2));
    expect(isFoldedSession('abc', folded)).toBe(true);
  });

  it('never adds a second divider', () => {
    const once = foldedSessionMessages({ id: 'abc', title: 'x', lastMessageAt: '2026-10-03T10:00:00Z', messages: turns(1) });
    const twice = foldedSessionMessages({ id: 'abc', title: 'x', lastMessageAt: '2026-10-03T10:00:00Z', messages: once });
    expect(twice.filter((message) => message.kind === 'divider')).toHaveLength(1);
  });

  it('names an untitled chat plainly', () => {
    expect(foldedSessionLabel('New chat', '2026-10-03T10:00:00Z')).toBe('From an earlier chat · 3 Oct');
  });
});

describe('looseSessionIds', () => {
  it('folds only free-standing sessions', () => {
    const rows = [
      { id: USER, threadKey: null },
      { id: 'rollout-chat', threadKey: null },
      { id: 'old-session', threadKey: null },
      { id: 'already', threadKey: 'main_archive' },
    ];
    expect(looseSessionIds(rows, USER, new Set(['rollout-chat']))).toEqual(['old-session']);
  });
});

describe('rebaseOnServer', () => {
  it('puts what this tab added after the server copy (a brief arrived)', () => {
    const server = [{ id: 'a' }, { id: 'b' }, { id: 'brief' }];
    const local = [{ id: 'a' }, { id: 'b' }, { id: 'mine' }];
    expect(rebaseOnServer(local, ['a', 'b'], server)).toEqual({
      messages: [{ id: 'a' }, { id: 'b' }, { id: 'brief' }, { id: 'mine' }],
      added: 1,
    });
  });

  it('does not bring back messages moved to an earlier page', () => {
    const server = [{ id: 'c' }, { id: 'd' }];
    const local = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'new' }];
    expect(rebaseOnServer(local, ['a', 'b', 'c', 'd'], server).messages.map((m) => m.id)).toEqual(['c', 'd', 'new']);
  });

  it('adds nothing when this tab has nothing new', () => {
    expect(rebaseOnServer([{ id: 'a' }], ['a'], [{ id: 'a' }, { id: 'b' }])).toEqual({
      messages: [{ id: 'a' }, { id: 'b' }],
      added: 0,
    });
  });
});
