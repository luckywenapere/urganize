// Tagging people in a rollout's chat with @, and who that emails.
//
// Pure, no I/O, client-safe: the composer's @ picker, the highlight in a sent
// message and the server's "who do we email" decision all read these, so the
// three cannot disagree about what a tag is.
//
// THE MESSAGE TEXT IS THE SOURCE OF TRUTH. A tag is "@" followed by the name of
// someone who can see the rollout, or "@everyone". Nothing else is stored: the
// server re-reads the text when the message is sent, so a name the person picked
// and then deleted before sending is not emailed, and a name typed by hand is.
//
// Founder decisions (2026-10-07): a plain message emails nobody; "@everyone"
// emails everyone who can see the rollout; "@Name" emails that person; anyone
// who can post may use either. The author is never emailed about their own
// message.

/** The word after "@" that means everyone who can see the rollout. */
export const EVERYONE_TOKEN = 'everyone';

/** The longest stretch after "@" the picker treats as a name being typed. */
const MAX_QUERY_LENGTH = 40;

/** Most people one message will email. A typo guard: a rollout team is a
 *  handful of people, and the free email plan is 100 a day for the whole app. */
export const MAX_CHAT_EMAIL_RECIPIENTS = 25;

/** How much of a message goes into the email before it is cut. */
export const CHAT_EMAIL_EXCERPT_LENGTH = 1200;

export type ChatPerson = {
  userId: string;
  /** What the picker shows and what "@" is followed by. Never empty. */
  name: string;
};

const isNameChar = (char: string | undefined): boolean =>
  Boolean(char) && /[\p{L}\p{N}_]/u.test(char as string);

/** A tag ends where the name ends: the next character must not carry the word
 *  on ("@Ada" inside "@Adaeze" is not a tag for Ada). */
function endsAtBoundary(text: string, end: number): boolean {
  return !isNameChar(text[end]);
}

/** A tag starts at the beginning, or after a space or punctuation, never in
 *  the middle of a word ("ada@label.com" is an email address, not a tag). */
function startsAtBoundary(text: string, at: number): boolean {
  return at === 0 || !isNameChar(text[at - 1]);
}

/**
 * The name being typed at the caret, for the @ picker: the text from the last
 * "@" up to the caret, if that "@" starts a tag and nothing in between ends one
 * (a line break, or too much text). Null means the picker should be closed.
 */
export function findMentionQuery(
  text: string,
  caret: number
): { start: number; query: string } | null {
  const end = Math.max(0, Math.min(caret, text.length));
  const at = text.lastIndexOf('@', end - 1);
  if (at < 0) return null;
  if (!startsAtBoundary(text, at)) return null;
  const query = text.slice(at + 1, end);
  if (query.length > MAX_QUERY_LENGTH) return null;
  if (/[\r\n@]/.test(query)) return null;
  // Two spaces in a row, or a leading space, means they stopped typing a name.
  if (/^\s|\s\s/.test(query)) return null;
  return { start: at, query };
}

const fold = (value: string): string => value.trim().toLocaleLowerCase();

/** What the picker offers for a query: "everyone" first when it fits, then
 *  people whose name has a word starting with the query. */
export function filterMentionOptions(
  people: ChatPerson[],
  query: string,
  currentUserId: string | null
): Array<{ kind: 'everyone' } | { kind: 'person'; person: ChatPerson }> {
  const q = fold(query);
  const options: Array<{ kind: 'everyone' } | { kind: 'person'; person: ChatPerson }> = [];
  if (EVERYONE_TOKEN.startsWith(q)) options.push({ kind: 'everyone' });
  for (const person of people) {
    if (person.userId === currentUserId) continue;
    const name = fold(person.name);
    if (!name) continue;
    const words = name.split(/\s+/);
    if (!q || name.startsWith(q) || words.some((word) => word.startsWith(q))) {
      options.push({ kind: 'person', person });
    }
  }
  return options;
}

/** Puts "@<label> " in place of the "@query" being typed. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  label: string
): { text: string; caret: number } {
  const before = text.slice(0, start);
  const rest = text.slice(Math.max(start, caret));
  // One space after the name, whether or not one was already there.
  const after = rest.startsWith(' ') ? rest.slice(1) : rest;
  const inserted = `@${label} `;
  return { text: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}

export type MentionMatch = {
  start: number;
  end: number;
  /** Null for "@everyone". */
  userId: string | null;
};

/**
 * Every tag in a message. At each "@" the LONGEST matching name wins, so
 * "@Ada Obi" tags Ada Obi even when someone called "Ada" is on the team too.
 * Matching ignores case. Two people with the same name are both tagged.
 */
export function findMentions(content: string, people: ChatPerson[]): MentionMatch[] {
  const candidates = people
    .map((person) => ({ userId: person.userId, name: person.name.trim() }))
    .filter((person) => person.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  const lower = content.toLocaleLowerCase();
  const matches: MentionMatch[] = [];

  let index = content.indexOf('@');
  while (index >= 0) {
    let consumed = 0;
    if (startsAtBoundary(content, index)) {
      const rest = lower.slice(index + 1);
      if (rest.startsWith(EVERYONE_TOKEN) && endsAtBoundary(content, index + 1 + EVERYONE_TOKEN.length)) {
        consumed = 1 + EVERYONE_TOKEN.length;
        matches.push({ start: index, end: index + consumed, userId: null });
      } else {
        let matchedLength = 0;
        for (const person of candidates) {
          const name = person.name.toLocaleLowerCase();
          if (matchedLength && name.length < matchedLength) break;
          if (rest.startsWith(name) && endsAtBoundary(content, index + 1 + name.length)) {
            matchedLength = name.length;
            matches.push({ start: index, end: index + 1 + name.length, userId: person.userId });
          }
        }
        consumed = matchedLength ? 1 + matchedLength : 0;
      }
    }
    index = content.indexOf('@', index + Math.max(1, consumed));
  }
  return matches;
}

/**
 * Who a message emails: everyone who can see the rollout when it says
 * "@everyone", otherwise the people it tags, never the author, each once, at
 * most MAX_CHAT_EMAIL_RECIPIENTS. A tag naming someone who cannot see the
 * rollout cannot match, because `people` is only those who can.
 */
export function chatEmailRecipients(input: {
  content: string;
  people: ChatPerson[];
  authorId: string;
}): { userIds: string[]; everyone: boolean } {
  const mentions = findMentions(input.content, input.people);
  const everyone = mentions.some((mention) => mention.userId === null);
  const ids = everyone
    ? input.people.map((person) => person.userId)
    : mentions.map((mention) => mention.userId as string);
  const seen = new Set<string>();
  const userIds: string[] = [];
  for (const id of ids) {
    if (!id || id === input.authorId || seen.has(id)) continue;
    seen.add(id);
    userIds.push(id);
    if (userIds.length >= MAX_CHAT_EMAIL_RECIPIENTS) break;
  }
  return { userIds, everyone };
}

/** A message split into plain text and tags, for highlighting tags on screen. */
export function splitMessageForDisplay(
  content: string,
  people: ChatPerson[]
): Array<{ text: string; mention: boolean }> {
  const mentions = findMentions(content, people);
  // Overlapping matches (two people with one name) share a span; keep each once.
  const spans: Array<{ start: number; end: number }> = [];
  for (const mention of mentions) {
    if (!spans.some((span) => span.start === mention.start)) spans.push(mention);
  }
  const parts: Array<{ text: string; mention: boolean }> = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) parts.push({ text: content.slice(cursor, span.start), mention: false });
    parts.push({ text: content.slice(span.start, span.end), mention: true });
    cursor = span.end;
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor), mention: false });
  return parts.length ? parts : [{ text: content, mention: false }];
}

/** The message as it goes into the email: trimmed, cut at a word if long. */
export function chatEmailExcerpt(content: string): string {
  const text = content.trim();
  if (text.length <= CHAT_EMAIL_EXCERPT_LENGTH) return text;
  const cut = text.slice(0, CHAT_EMAIL_EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > CHAT_EMAIL_EXCERPT_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The push a tagged person gets. */
export function buildChatMentionPush(input: {
  authorName: string;
  releaseTitle: string;
  everyone: boolean;
  content: string;
  releaseId: string;
  messageId: string;
}): { title: string; body: string; url: string; tag: string } {
  const author = input.authorName.trim() || 'A teammate';
  const release = input.releaseTitle.trim() || 'your rollout';
  const excerpt = input.content.trim().replace(/\s+/g, ' ');
  return {
    title: input.everyone ? `${author} messaged the team on ${release}` : `${author} tagged you on ${release}`,
    body: excerpt.length > 140 ? `${excerpt.slice(0, 139).trimEnd()}…` : excerpt,
    url: releaseChatPath(input.releaseId),
    // Per message: two messages minutes apart must stack, not replace each other.
    tag: `release-chat-${input.messageId}`,
  };
}

/** Where a chat notification takes you: the rollout with its chat open. */
export function releaseChatPath(releaseId: string): string {
  return `/dashboard?release=${encodeURIComponent(releaseId)}&scene=chat`;
}
