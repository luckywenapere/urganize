import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAPPI_HISTORY_LIMIT,
  CHAT_CLOCK_SKEW_MS,
  CHAT_RESUME_WINDOW_MS,
  CHAT_TITLE_FALLBACK,
  MAX_CHAT_BYTES,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_MESSAGES,
  applySync,
  commonPrefixLength,
  deriveConversationTitle,
  hasUnsyncedMessages,
  isChappiHistoryEnabled,
  isChatCachePayload,
  isChatId,
  isWithinResumeWindow,
  mergeChatSummaries,
  newChatId,
  normalizeChatMessage,
  parseSyncBody,
  planClientSync,
  resolveConflict,
  shouldOpenNewerChat,
  toStoredMessage,
  upsertChatSummary,
  type ChatSummary,
  type StoredChatMessage,
  type StoredChatRow,
} from './conversation-history';

// The pure half of UrgAns chat history. Every rule that decides whether a chat
// is saved correctly lives here, so it is tested here: what the client sends,
// what the server accepts, how a disagreement between two tabs is settled, and
// when a reopened UrgAns picks a chat back up.

const USER = 'user-1';
const OTHER = 'user-2';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function msg(id: string, role: 'user' | 'assistant' = 'user', content = `text ${id}`): StoredChatMessage {
  return { id, role, content };
}

function row(over: Partial<StoredChatRow> = {}): StoredChatRow {
  return {
    ownerUserId: USER,
    title: 'Plan the EP',
    revision: 3,
    messages: [msg('a'), msg('b', 'assistant'), msg('c')],
    ...over,
  };
}

function summary(over: Partial<ChatSummary> & { id: string }): ChatSummary {
  return {
    title: 'A chat',
    messageCount: 2,
    lastMessageAt: '2026-09-24T10:00:00.000Z',
    createdAt: '2026-09-24T09:00:00.000Z',
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('constants', () => {
  it('resumes within six hours, the founder decision', () => {
    expect(CHAT_RESUME_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
  });

  it('matches the model history the route has always forwarded', () => {
    expect(CHAPPI_HISTORY_LIMIT).toBe(20);
  });
});

describe('isChappiHistoryEnabled', () => {
  it('needs BOTH the assistant and the history flag', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_CHAPPI', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_HISTORY', 'true');
    expect(isChappiHistoryEnabled()).toBe(true);
  });

  it('is off when the assistant itself is off, whatever the history flag says', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_CHAPPI', 'false');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_HISTORY', 'true');
    expect(isChappiHistoryEnabled()).toBe(false);
  });

  it('is off by default', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_CHAPPI', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_HISTORY', '');
    expect(isChappiHistoryEnabled()).toBe(false);
  });
});

describe('newChatId', () => {
  it('is a v4 uuid, which the database column requires', () => {
    expect(newChatId()).toMatch(UUID_V4);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newChatId()));
    expect(ids.size).toBe(200);
  });

  it('still makes a v4 uuid where randomUUID is missing (an insecure context)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 37 + 11) % 256;
        return bytes;
      },
    });
    const id = newChatId();
    expect(id).toMatch(UUID_V4);
    expect(isChatId(id)).toBe(true);
  });
});

describe('isChatId', () => {
  it('accepts a uuid and refuses everything else', () => {
    expect(isChatId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isChatId('1726000000000-3-u')).toBe(false);
    expect(isChatId('')).toBe(false);
    expect(isChatId(null)).toBe(false);
    expect(isChatId('11111111-1111-4111-8111-111111111111,x')).toBe(false);
  });
});

describe('deriveConversationTitle', () => {
  it('is the first line of the first thing the user said', () => {
    expect(
      deriveConversationTitle([
        msg('a', 'user', 'Plan my EP\nwith a lead single'),
        msg('b', 'assistant', 'Sure'),
      ])
    ).toBe('Plan my EP');
  });

  it('skips a blank user turn and an assistant turn that came first', () => {
    expect(
      deriveConversationTitle([
        msg('a', 'assistant', 'Hello'),
        msg('b', 'user', '   '),
        msg('c', 'user', "Today's focus"),
      ])
    ).toBe("Today's focus");
  });

  it('falls back when nobody has said anything yet', () => {
    expect(deriveConversationTitle([])).toBe(CHAT_TITLE_FALLBACK);
    expect(deriveConversationTitle([msg('a', 'assistant', 'Hi')])).toBe(CHAT_TITLE_FALLBACK);
  });

  it('caps a long first line', () => {
    expect(deriveConversationTitle([msg('a', 'user', 'x'.repeat(300))]).length).toBe(80);
  });
});

describe('normalizeChatMessage', () => {
  it('keeps a well-formed message and nothing else', () => {
    expect(
      normalizeChatMessage({
        id: 'm1',
        role: 'assistant',
        content: 'Done.',
        briefSections: ['roster'],
        extra: 'dropped',
      })
    ).toEqual({ id: 'm1', role: 'assistant', content: 'Done.', briefSections: ['roster'] });
  });

  it('clamps long text instead of refusing it — refusing would jam every later save', () => {
    const long = 'a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 50);
    expect(normalizeChatMessage({ id: 'm1', role: 'user', content: long })?.content.length).toBe(
      MAX_CHAT_MESSAGE_LENGTH
    );
  });

  it('never rewrites an id, since conflict detection compares them', () => {
    expect(normalizeChatMessage({ id: ' m1 ', role: 'user', content: 'x' })?.id).toBe(' m1 ');
  });

  it('refuses a malformed shape', () => {
    expect(normalizeChatMessage(null)).toBeNull();
    expect(normalizeChatMessage({ id: '', role: 'user', content: 'x' })).toBeNull();
    expect(normalizeChatMessage({ id: 'm1', role: 'system', content: 'x' })).toBeNull();
    expect(normalizeChatMessage({ id: 'm1', role: 'user', content: 42 })).toBeNull();
    expect(normalizeChatMessage({ id: 'x'.repeat(101), role: 'user', content: 'x' })).toBeNull();
  });

  it('keeps empty text: removing a message would misalign every id after it', () => {
    expect(normalizeChatMessage({ id: 'm1', role: 'assistant', content: '' })).toEqual({
      id: 'm1',
      role: 'assistant',
      content: '',
    });
  });

  it('drops junk brief sections and omits the field when none survive', () => {
    expect(
      normalizeChatMessage({ id: 'm1', role: 'assistant', content: 'x', briefSections: [1, '', null] })
    ).toEqual({ id: 'm1', role: 'assistant', content: 'x' });
  });
});

describe('toStoredMessage', () => {
  it('copies only the persisted fields and clamps the text', () => {
    const stored = toStoredMessage({
      id: 'm1',
      role: 'user',
      content: 'b'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1),
      briefSections: [],
    });
    expect(stored).toEqual({ id: 'm1', role: 'user', content: 'b'.repeat(MAX_CHAT_MESSAGE_LENGTH) });
  });
});

describe('parseSyncBody', () => {
  it('accepts a well-formed save', () => {
    const result = parseSyncBody({ baseRevision: 2, keepCount: 1, append: [msg('x')] });
    expect(result).toEqual({ ok: true, body: { baseRevision: 2, keepCount: 1, append: [msg('x')] } });
  });

  it('refuses counts that are not whole, non-negative numbers', () => {
    expect(parseSyncBody({ baseRevision: -1, keepCount: 0, append: [] }).ok).toBe(false);
    expect(parseSyncBody({ baseRevision: 1.5, keepCount: 0, append: [] }).ok).toBe(false);
    expect(parseSyncBody({ baseRevision: 0, keepCount: '2', append: [] }).ok).toBe(false);
  });

  it('refuses a body with no message list', () => {
    expect(parseSyncBody({ baseRevision: 0, keepCount: 0 })).toMatchObject({ ok: false, status: 400 });
    expect(parseSyncBody(null)).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses the whole save over one malformed message, rather than dropping it', () => {
    expect(
      parseSyncBody({ baseRevision: 0, keepCount: 0, append: [msg('x'), { id: 'y', role: 'robot' }] })
    ).toMatchObject({ ok: false, status: 400 });
  });

  it('answers an absurd batch as too large, not as malformed', () => {
    const append = Array.from({ length: MAX_CHAT_MESSAGES * 2 + 1 }, (_, i) => msg(`m${i}`));
    expect(parseSyncBody({ baseRevision: 0, keepCount: 0, append })).toMatchObject({
      ok: false,
      status: 413,
    });
  });
});

describe('commonPrefixLength', () => {
  it('counts the leading ids two lists share', () => {
    expect(commonPrefixLength(['a', 'b', 'c'], ['a', 'b', 'x'])).toBe(2);
    expect(commonPrefixLength(['a'], ['a', 'b'])).toBe(1);
    expect(commonPrefixLength([], ['a'])).toBe(0);
    expect(commonPrefixLength(['x'], ['a'])).toBe(0);
  });
});

describe('planClientSync', () => {
  it('has nothing to send when the server already holds exactly this transcript', () => {
    expect(planClientSync([msg('a'), msg('b')], { revision: 4, serverIds: ['a', 'b'] })).toBeNull();
  });

  it('never sends an empty transcript', () => {
    expect(planClientSync([], { revision: 0, serverIds: [] })).toBeNull();
    expect(planClientSync([], { revision: 3, serverIds: ['a'] })).toBeNull();
  });

  it('uploads a brand new chat whole, from revision zero', () => {
    expect(planClientSync([msg('a'), msg('b')], { revision: 0, serverIds: [] })).toEqual({
      baseRevision: 0,
      keepCount: 0,
      append: [msg('a'), msg('b')],
    });
  });

  it('sends only the new tail of a growing chat', () => {
    expect(planClientSync([msg('a'), msg('b'), msg('c')], { revision: 2, serverIds: ['a', 'b'] })).toEqual({
      baseRevision: 2,
      keepCount: 2,
      append: [msg('c')],
    });
  });

  it('replaces a regenerated reply by keeping everything before it', () => {
    // Retry dropped reply "b" (already saved) and a new reply "b2" arrived.
    expect(planClientSync([msg('a'), msg('b2', 'assistant')], { revision: 5, serverIds: ['a', 'b'] })).toEqual({
      baseRevision: 5,
      keepCount: 1,
      append: [msg('b2', 'assistant')],
    });
  });

  it('can shrink the saved copy while a regenerated reply is still on its way', () => {
    expect(planClientSync([msg('a')], { revision: 5, serverIds: ['a', 'b'] })).toEqual({
      baseRevision: 5,
      keepCount: 1,
      append: [],
    });
  });
});

describe('applySync', () => {
  it('creates a chat on its first save, titled from the first user message', () => {
    const decision = applySync(null, { baseRevision: 0, keepCount: 0, append: [msg('a', 'user', 'Plan the EP')] }, USER);
    expect(decision).toEqual({ kind: 'insert', messages: [msg('a', 'user', 'Plan the EP')], title: 'Plan the EP' });
  });

  it('treats a missing chat the client thought existed as deleted, never re-creating it', () => {
    expect(applySync(null, { baseRevision: 2, keepCount: 2, append: [msg('z')] }, USER)).toEqual({
      kind: 'not_found',
    });
  });

  it('refuses a first save that claims to keep earlier messages', () => {
    expect(applySync(null, { baseRevision: 0, keepCount: 1, append: [msg('a')] }, USER)).toMatchObject({
      kind: 'invalid',
    });
  });

  it("hides somebody else's chat behind the same answer as a missing one", () => {
    expect(applySync(row({ ownerUserId: OTHER }), { baseRevision: 3, keepCount: 3, append: [msg('d')] }, USER)).toEqual({
      kind: 'not_found',
    });
  });

  it('refuses a save built on a stale revision and hands back what the server has', () => {
    expect(applySync(row(), { baseRevision: 2, keepCount: 3, append: [msg('d')] }, USER)).toEqual({
      kind: 'conflict',
      revision: 3,
      messageIds: ['a', 'b', 'c'],
    });
  });

  it('answers a retried first save as a conflict, so the client can see it already landed', () => {
    expect(applySync(row({ revision: 1 }), { baseRevision: 0, keepCount: 0, append: [msg('a')] }, USER)).toMatchObject({
      kind: 'conflict',
      revision: 1,
    });
  });

  it('refuses to keep more messages than the server holds', () => {
    expect(applySync(row(), { baseRevision: 3, keepCount: 9, append: [] }, USER)).toMatchObject({
      kind: 'conflict',
    });
  });

  it('replaces the tail after the kept prefix and bumps the revision', () => {
    expect(applySync(row(), { baseRevision: 3, keepCount: 2, append: [msg('c2'), msg('d')] }, USER)).toEqual({
      kind: 'update',
      messages: [msg('a'), msg('b', 'assistant'), msg('c2'), msg('d')],
      title: 'Plan the EP',
      nextRevision: 4,
    });
  });

  it('keeps a title once it has one', () => {
    const decision = applySync(
      row({ title: 'Plan the EP', messages: [msg('a', 'user', 'Plan the EP')] }),
      { baseRevision: 3, keepCount: 0, append: [msg('x', 'user', 'Something else entirely')] },
      USER
    );
    expect(decision).toMatchObject({ kind: 'update', title: 'Plan the EP' });
  });

  it('upgrades the fallback title once a user message exists', () => {
    const decision = applySync(
      row({ title: CHAT_TITLE_FALLBACK, messages: [msg('a', 'assistant', 'Hi')] }),
      { baseRevision: 3, keepCount: 1, append: [msg('b', 'user', 'Book the video shoot')] },
      USER
    );
    expect(decision).toMatchObject({ kind: 'update', title: 'Book the video shoot' });
  });

  it('refuses a save that would leave the chat empty', () => {
    expect(applySync(row(), { baseRevision: 3, keepCount: 0, append: [] }, USER)).toMatchObject({
      kind: 'invalid',
    });
  });

  it('refuses two messages with one id', () => {
    expect(applySync(row(), { baseRevision: 3, keepCount: 3, append: [msg('a')] }, USER)).toMatchObject({
      kind: 'invalid',
    });
  });

  it('stops a chat at the message cap', () => {
    const append = Array.from({ length: MAX_CHAT_MESSAGES - 2 }, (_, i) => msg(`n${i}`));
    expect(applySync(row(), { baseRevision: 3, keepCount: 3, append }, USER)).toEqual({ kind: 'too_large' });
  });

  it('stops a chat at the size cap', () => {
    const huge = 'x'.repeat(MAX_CHAT_MESSAGE_LENGTH);
    const count = Math.ceil(MAX_CHAT_BYTES / MAX_CHAT_MESSAGE_LENGTH) + 1;
    const append = Array.from({ length: count }, (_, i) => msg(`h${i}`, 'assistant', huge));
    expect(applySync(null, { baseRevision: 0, keepCount: 0, append }, USER)).toEqual({ kind: 'too_large' });
  });
});

describe('resolveConflict', () => {
  it('adopts the server revision when both sides already agree', () => {
    expect(resolveConflict(['a', 'b'], ['a', 'b'])).toBe('adopt');
    expect(resolveConflict([], [])).toBe('adopt');
  });

  it('resends when the server is behind this tab', () => {
    expect(resolveConflict(['a', 'b', 'c'], ['a', 'b'])).toBe('resend');
  });

  it('reloads when another tab is ahead and this one has nothing new', () => {
    expect(resolveConflict(['a', 'b'], ['a', 'b', 'x'])).toBe('reload');
  });

  it('forks when the two tabs wrote different things, so neither is lost', () => {
    expect(resolveConflict(['a', 'b', 'mine'], ['a', 'b', 'theirs'])).toBe('fork');
    expect(resolveConflict(['a', 'mine'], ['a', 'theirs', 'more'])).toBe('fork');
  });
});

describe('isWithinResumeWindow', () => {
  const now = Date.parse('2026-09-24T12:00:00.000Z');

  it('resumes a chat touched a moment ago', () => {
    expect(isWithinResumeWindow(now - 60_000, now)).toBe(true);
  });

  it('resumes right up to six hours, inclusive', () => {
    expect(isWithinResumeWindow(now - CHAT_RESUME_WINDOW_MS, now)).toBe(true);
    expect(isWithinResumeWindow(now - CHAT_RESUME_WINDOW_MS - 1, now)).toBe(false);
  });

  it('tolerates a clock a few minutes fast, and nothing more', () => {
    expect(isWithinResumeWindow(now + CHAT_CLOCK_SKEW_MS, now)).toBe(true);
    expect(isWithinResumeWindow(now + CHAT_CLOCK_SKEW_MS + 1, now)).toBe(false);
  });

  it('refuses a timestamp that is not a number', () => {
    expect(isWithinResumeWindow(Number.NaN, now)).toBe(false);
  });
});

describe('shouldOpenNewerChat', () => {
  const now = Date.parse('2026-09-24T12:00:00.000Z');
  const newest = summary({ id: 'phone', lastMessageAt: '2026-09-24T11:30:00.000Z' });
  const base = {
    newest,
    now,
    interacted: false,
    localDirty: false,
    currentId: null,
    currentActivityAt: null,
  };

  it('opens a recent chat from another device on a fresh arrival', () => {
    expect(shouldOpenNewerChat(base)).toBe(true);
  });

  it('never moves someone who has already started using this tab', () => {
    expect(shouldOpenNewerChat({ ...base, interacted: true })).toBe(false);
  });

  it('never abandons unsaved local work', () => {
    expect(shouldOpenNewerChat({ ...base, localDirty: true })).toBe(false);
  });

  it('does nothing when that chat is already the one on screen', () => {
    expect(shouldOpenNewerChat({ ...base, currentId: 'phone' })).toBe(false);
  });

  it('leaves an old chat in the list rather than resuming it', () => {
    expect(
      shouldOpenNewerChat({ ...base, newest: summary({ id: 'old', lastMessageAt: '2026-09-23T12:00:00.000Z' }) })
    ).toBe(false);
  });

  it('keeps the local chat when it was touched more recently', () => {
    expect(
      shouldOpenNewerChat({ ...base, currentId: 'laptop', currentActivityAt: Date.parse('2026-09-24T11:45:00.000Z') })
    ).toBe(false);
  });

  it('does nothing when there is no chat at all', () => {
    expect(shouldOpenNewerChat({ ...base, newest: null })).toBe(false);
  });
});

describe('hasUnsyncedMessages', () => {
  it('is false only when the server holds exactly these ids', () => {
    expect(hasUnsyncedMessages([msg('a'), msg('b')], ['a', 'b'])).toBe(false);
    expect(hasUnsyncedMessages([msg('a'), msg('b')], ['a'])).toBe(true);
    expect(hasUnsyncedMessages([msg('a')], ['a', 'b'])).toBe(true);
    expect(hasUnsyncedMessages([], [])).toBe(false);
  });
});

describe('isChatCachePayload', () => {
  const valid = {
    userId: USER,
    current: {
      id: '11111111-1111-4111-8111-111111111111',
      revision: 2,
      serverIds: ['a'],
      messages: [msg('a')],
      lastActivityAt: 1_726_000_000_000,
    },
    summaries: [summary({ id: '11111111-1111-4111-8111-111111111111' })],
  };

  it('accepts what the cache writes', () => {
    expect(isChatCachePayload(valid)).toBe(true);
  });

  it('accepts a chat too big to cache, stored as its sync state alone', () => {
    expect(isChatCachePayload({ ...valid, current: { ...valid.current, messages: null } })).toBe(true);
  });

  it('accepts no current chat', () => {
    expect(isChatCachePayload({ ...valid, current: null })).toBe(true);
  });

  it('refuses anything that could not have come from the cache', () => {
    expect(isChatCachePayload(null)).toBe(false);
    expect(isChatCachePayload({ ...valid, userId: '' })).toBe(false);
    expect(isChatCachePayload({ ...valid, current: { ...valid.current, id: 'nope' } })).toBe(false);
    expect(isChatCachePayload({ ...valid, current: { ...valid.current, revision: -1 } })).toBe(false);
    expect(
      isChatCachePayload({ ...valid, current: { ...valid.current, messages: [{ id: 'a', role: 'x', content: '' }] } })
    ).toBe(false);
    expect(isChatCachePayload({ ...valid, summaries: [{ id: 'a' }] })).toBe(false);
  });
});

describe('upsertChatSummary and mergeChatSummaries', () => {
  it('keeps the list newest first and replaces an existing row', () => {
    const list = [
      summary({ id: 'older', lastMessageAt: '2026-09-24T08:00:00.000Z' }),
      summary({ id: 'newer', lastMessageAt: '2026-09-24T09:00:00.000Z' }),
    ];
    const next = upsertChatSummary(list, summary({ id: 'older', lastMessageAt: '2026-09-24T10:00:00.000Z', title: 'Moved' }));
    expect(next.map((item) => item.id)).toEqual(['older', 'newer']);
    expect(next[0].title).toBe('Moved');
    expect(next).toHaveLength(2);
  });

  it('lets the server win for a chat it knows, and keeps local chats it has not seen yet', () => {
    const server = [summary({ id: 'saved', title: 'From server', lastMessageAt: '2026-09-24T09:00:00.000Z' })];
    const local = [
      summary({ id: 'saved', title: 'Stale local', lastMessageAt: '2026-09-24T09:00:00.000Z' }),
      summary({ id: 'unsaved', lastMessageAt: '2026-09-24T11:00:00.000Z' }),
    ];
    const merged = mergeChatSummaries(server, local);
    expect(merged.map((item) => item.id)).toEqual(['unsaved', 'saved']);
    expect(merged.find((item) => item.id === 'saved')?.title).toBe('From server');
  });
});
