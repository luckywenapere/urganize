import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_EMAIL_RECIPIENTS,
  buildChatMentionPush,
  chatEmailExcerpt,
  chatEmailRecipients,
  filterMentionOptions,
  findMentionQuery,
  findMentions,
  insertMention,
  releaseChatPath,
  splitMessageForDisplay,
  type ChatPerson,
} from './chat-mentions';

const ada: ChatPerson = { userId: 'u-ada', name: 'Ada' };
const adaObi: ChatPerson = { userId: 'u-ada-obi', name: 'Ada Obi' };
const tunde: ChatPerson = { userId: 'u-tunde', name: 'Tunde Bakare' };
const owner: ChatPerson = { userId: 'u-owner', name: 'Lucky' };
const people = [ada, adaObi, tunde, owner];

describe('findMentionQuery', () => {
  it('opens on an @ at the start or after a space', () => {
    expect(findMentionQuery('@Tu', 3)).toEqual({ start: 0, query: 'Tu' });
    expect(findMentionQuery('hey @Tu', 7)).toEqual({ start: 4, query: 'Tu' });
    expect(findMentionQuery('hey @', 5)).toEqual({ start: 4, query: '' });
  });

  it('allows one space inside a name being typed', () => {
    expect(findMentionQuery('hey @Ada O', 10)).toEqual({ start: 4, query: 'Ada O' });
  });

  it('stays closed for an email address, a line break or a long run', () => {
    expect(findMentionQuery('ada@label.com', 13)).toBeNull();
    expect(findMentionQuery('@Ada\nnext', 9)).toBeNull();
    expect(findMentionQuery('@  x', 4)).toBeNull();
    expect(findMentionQuery(`@${'a'.repeat(41)}`, 42)).toBeNull();
    expect(findMentionQuery('no tag here', 11)).toBeNull();
  });
});

describe('filterMentionOptions', () => {
  it('offers everyone first, then matching people, never the person typing', () => {
    const options = filterMentionOptions(people, '', 'u-owner');
    expect(options[0]).toEqual({ kind: 'everyone' });
    expect(options.some((o) => o.kind === 'person' && o.person.userId === 'u-owner')).toBe(false);
    expect(options).toHaveLength(4);
  });

  it('matches the start of any word, ignoring case', () => {
    const ids = filterMentionOptions(people, 'bak', null).map((o) => (o.kind === 'person' ? o.person.userId : 'all'));
    expect(ids).toEqual(['u-tunde']);
  });

  it('only offers everyone when the query fits it', () => {
    expect(filterMentionOptions(people, 'tu', null).some((o) => o.kind === 'everyone')).toBe(false);
    expect(filterMentionOptions(people, 'EVE', null)[0]).toEqual({ kind: 'everyone' });
  });
});

describe('insertMention', () => {
  it('replaces the query with the name and one space', () => {
    expect(insertMention('hey @Tu', 4, 7, 'Tunde Bakare')).toEqual({
      text: 'hey @Tunde Bakare ',
      caret: 18,
    });
  });

  it('does not double a space that was already there', () => {
    const result = insertMention('hey @Tu see this', 4, 7, 'Tunde Bakare');
    expect(result.text).toBe('hey @Tunde Bakare see this');
    expect(result.text.slice(result.caret)).toBe('see this');
  });
});

describe('findMentions', () => {
  it('prefers the longest name at an @', () => {
    const matches = findMentions('thanks @Ada Obi', people);
    expect(matches.map((m) => m.userId)).toEqual(['u-ada-obi']);
  });

  it('still tags the shorter name on its own', () => {
    expect(findMentions('@Ada can you', people).map((m) => m.userId)).toEqual(['u-ada']);
  });

  it('does not match inside a longer word or an email address', () => {
    expect(findMentions('@Adaeze is new', people)).toEqual([]);
    expect(findMentions('mail ada@obi.com', people)).toEqual([]);
  });

  it('reads @everyone, any case, but not @everyones', () => {
    expect(findMentions('@Everyone look', people)).toEqual([{ start: 0, end: 9, userId: null }]);
    expect(findMentions('@everyones', people)).toEqual([]);
  });

  it('ignores case and punctuation after the name', () => {
    expect(findMentions('hi @tunde bakare, thanks', people).map((m) => m.userId)).toEqual(['u-tunde']);
  });

  it('tags two people who share a name', () => {
    const twins = [ada, { userId: 'u-ada-2', name: 'Ada' }];
    expect(findMentions('@Ada', twins).map((m) => m.userId).sort()).toEqual(['u-ada', 'u-ada-2']);
  });
});

describe('chatEmailRecipients', () => {
  it('emails nobody for a plain message', () => {
    expect(chatEmailRecipients({ content: 'release is Friday', people, authorId: 'u-owner' })).toEqual({
      userIds: [],
      everyone: false,
    });
  });

  it('emails only the people tagged, once each', () => {
    const result = chatEmailRecipients({
      content: '@Tunde Bakare and @Ada, then @Tunde Bakare again',
      people,
      authorId: 'u-owner',
    });
    expect(result).toEqual({ userIds: ['u-tunde', 'u-ada'], everyone: false });
  });

  it('emails everyone who can see it for @everyone, but never the author', () => {
    const result = chatEmailRecipients({ content: '@everyone date moved', people, authorId: 'u-owner' });
    expect(result.everyone).toBe(true);
    expect(result.userIds).toEqual(['u-ada', 'u-ada-obi', 'u-tunde']);
  });

  it('never emails the author for tagging themselves', () => {
    expect(chatEmailRecipients({ content: '@Lucky note to self', people, authorId: 'u-owner' }).userIds).toEqual([]);
  });

  it('cannot reach someone who is not on the list', () => {
    expect(chatEmailRecipients({ content: '@Stranger hello', people, authorId: 'u-owner' }).userIds).toEqual([]);
  });

  it('caps the number of emails', () => {
    const crowd = Array.from({ length: 40 }, (_, i) => ({ userId: `u-${i}`, name: `Person ${i}` }));
    const result = chatEmailRecipients({ content: '@everyone', people: crowd, authorId: 'nobody' });
    expect(result.userIds).toHaveLength(MAX_CHAT_EMAIL_RECIPIENTS);
  });
});

describe('splitMessageForDisplay', () => {
  it('marks tags and keeps the rest as text', () => {
    expect(splitMessageForDisplay('hi @Ada Obi and @everyone!', people)).toEqual([
      { text: 'hi ', mention: false },
      { text: '@Ada Obi', mention: true },
      { text: ' and ', mention: false },
      { text: '@everyone', mention: true },
      { text: '!', mention: false },
    ]);
  });

  it('returns the message whole when there is no tag', () => {
    expect(splitMessageForDisplay('plain', people)).toEqual([{ text: 'plain', mention: false }]);
  });
});

describe('chatEmailExcerpt and the push', () => {
  it('keeps a short message whole and cuts a long one at a word', () => {
    expect(chatEmailExcerpt('  short  ')).toBe('short');
    const long = 'word '.repeat(400);
    const excerpt = chatEmailExcerpt(long);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(1201);
    expect(excerpt).not.toMatch(/wor…$/);
  });

  it('builds a push that opens the chat and stacks per message', () => {
    const push = buildChatMentionPush({
      authorName: 'Lucky',
      releaseTitle: 'Ohema',
      everyone: false,
      content: 'can you   check the art',
      releaseId: 'r 1',
      messageId: 'm1',
    });
    expect(push).toEqual({
      title: 'Lucky tagged you on Ohema',
      body: 'can you check the art',
      url: releaseChatPath('r 1'),
      tag: 'release-chat-m1',
    });
    expect(push.url).toBe('/dashboard?release=r%201&scene=chat');
  });

  it('says the whole team was messaged for @everyone', () => {
    const push = buildChatMentionPush({
      authorName: '',
      releaseTitle: '',
      everyone: true,
      content: 'x',
      releaseId: 'r',
      messageId: 'm',
    });
    expect(push.title).toBe('A teammate messaged the team on your rollout');
  });
});
