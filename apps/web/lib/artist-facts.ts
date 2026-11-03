// Artist facts: UrgAns's small structured memory (2026-10-27).
//
// One fact per row: an artist, a topic, what it says, where it came from, who
// and when. Not a memory of everything: no transcripts, no guesses about
// people. The point is that a decision a manager states once ("Kemi doesn't
// want playlist pitching") is still followed weeks later, in a new chat and in
// the planner, and that the team can see and change exactly what UrgAns holds.
//
// PURE: the rules, the prompt text and the card copy. The database side is
// ./artist-facts-server.ts. Mocks: docs/mocks/artist-memory/mock.html.

export const ARTIST_FACT_TOPICS = [
  'playlist_pitching',
  'preferred_channel',
  'budget',
  'contact',
  'other',
] as const;

export type ArtistFactTopic = (typeof ARTIST_FACT_TOPICS)[number];
export type ArtistFactSource = 'chat' | 'manual';

export const ARTIST_FACT_TOPIC_LABEL: Record<ArtistFactTopic, string> = {
  playlist_pitching: 'Playlist pitching',
  preferred_channel: 'Preferred channel',
  budget: 'Budget',
  contact: 'Who to contact',
  other: 'Something else',
};

/** Longer thoughts belong in a note. Matches the column check. */
export const MAX_FACT_LENGTH = 200;
/** Every topic holds one fact per artist except "other", which holds this many. */
export const MAX_OTHER_FACTS = 10;

export type ArtistFact = {
  id: string;
  workspaceId: string;
  artistId: string;
  topic: ArtistFactTopic;
  value: string;
  source: ArtistFactSource;
  saidBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isArtistFactTopic(value: unknown): value is ArtistFactTopic {
  return typeof value === 'string' && (ARTIST_FACT_TOPICS as readonly string[]).includes(value);
}

export function normalizeFactValue(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

export function validateFactInput(input: {
  topic: unknown;
  value: unknown;
}): { ok: true; topic: ArtistFactTopic; value: string } | { ok: false; error: string } {
  if (!isArtistFactTopic(input.topic)) {
    return { ok: false, error: `Pick a topic: ${ARTIST_FACT_TOPICS.join(', ')}.` };
  }
  const value = normalizeFactValue(input.value);
  if (!value) return { ok: false, error: 'Write what AI should know.' };
  if (value.length > MAX_FACT_LENGTH) {
    // Refused, not cut: a fact cut in half can say the opposite of what was meant.
    return { ok: false, error: `Keep it under ${MAX_FACT_LENGTH} characters. Longer thoughts belong in a note.` };
  }
  return { ok: true, topic: input.topic, value };
}

export type FactSavePlan =
  | { kind: 'insert' }
  | { kind: 'replace'; previous: ArtistFact }
  | { kind: 'unchanged'; previous: ArtistFact }
  | { kind: 'full' }
  | { kind: 'missing' }
  | { kind: 'taken'; holder: ArtistFact };

const sameValue = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What saving would do, given this artist's facts as they are now. With a
 * factId it is an edit of that fact; without one, a new decision on a topic,
 * which replaces the one fact that topic already holds.
 */
export function planFactSave(
  existing: ArtistFact[],
  input: { topic: ArtistFactTopic; value: string; factId?: string | null }
): FactSavePlan {
  if (input.factId) {
    const target = existing.find((f) => f.id === input.factId);
    if (!target) return { kind: 'missing' };
    if (input.topic !== target.topic && input.topic !== 'other') {
      const holder = existing.find((f) => f.id !== target.id && f.topic === input.topic);
      if (holder) return { kind: 'taken', holder };
    }
    if (input.topic === target.topic && sameValue(target.value, input.value)) {
      return { kind: 'unchanged', previous: target };
    }
    return { kind: 'replace', previous: target };
  }

  if (input.topic === 'other') {
    const others = existing.filter((f) => f.topic === 'other');
    const same = others.find((f) => sameValue(f.value, input.value));
    if (same) return { kind: 'unchanged', previous: same };
    return others.length >= MAX_OTHER_FACTS ? { kind: 'full' } : { kind: 'insert' };
  }

  const current = existing.find((f) => f.topic === input.topic);
  if (!current) return { kind: 'insert' };
  return sameValue(current.value, input.value)
    ? { kind: 'unchanged', previous: current }
    : { kind: 'replace', previous: current };
}

const ymd = (iso: string) => iso.slice(0, 10);

function factLine(fact: ArtistFact): string {
  const where = fact.source === 'chat' ? 'said in chat' : 'set by hand';
  return `- ${ARTIST_FACT_TOPIC_LABEL[fact.topic]}: ${fact.value} (${where}, ${ymd(fact.updatedAt)})`;
}

/** Facts kept in the prompt at most, so a large roster cannot swamp it. */
const MAX_PROMPT_FACTS = 80;

/**
 * The block UrgAns reads. Empty when nothing is saved: a heading over nothing
 * teaches a model to invent something to put under it.
 */
export function formatArtistFactsForPrompt(groups: { artistName: string; facts: ArtistFact[] }[]): string {
  let budget = MAX_PROMPT_FACTS;
  const blocks: string[] = [];
  for (const group of groups) {
    if (!group.facts.length || budget <= 0) continue;
    const shown = group.facts.slice(0, budget);
    budget -= shown.length;
    blocks.push(`${group.artistName}:\n${shown.map(factLine).join('\n')}`);
  }
  if (!blocks.length) return '';
  return [
    'What the team has decided about its artists. These are standing decisions: follow them in every answer, suggestion and plan for that artist. When one rules something out, leave it out and say so in a few words. If a request goes against one, point it out and ask.',
    ...blocks,
  ].join('\n');
}

/** One line for the planner's prompt. */
export function formatArtistFactsForPlanner(facts: ArtistFact[]): string {
  if (!facts.length) return '';
  const parts = facts.map((f) => `${ARTIST_FACT_TOPIC_LABEL[f.topic]}: ${f.value}.`);
  return `What the team has decided about this artist (follow it): ${parts.join(' ')}`;
}

export type FactCard = { title: string; detail: string; confirmLabel: string };

export function describeFactSaveCard(
  artistName: string,
  input: { topic: ArtistFactTopic; value: string },
  plan: { kind: 'insert' } | { kind: 'replace'; previous: ArtistFact }
): FactCard {
  const label = ARTIST_FACT_TOPIC_LABEL[input.topic];
  if (plan.kind === 'replace') {
    return {
      title: `Change what AI remembers about ${artistName}?`,
      detail: `${label}. Was: ${plan.previous.value}. Now: ${input.value}.`,
      confirmLabel: 'Update',
    };
  }
  return {
    title: `Remember this about ${artistName}?`,
    detail: `${label}: ${input.value}. It goes on ${artistName}'s page, where anyone on the team can change it.`,
    confirmLabel: 'Save',
  };
}

export function describeFactForgetCard(artistName: string, fact: ArtistFact): FactCard {
  return {
    title: `Forget this about ${artistName}?`,
    detail: `${ARTIST_FACT_TOPIC_LABEL[fact.topic]}: ${fact.value}. You can add it again any time.`,
    confirmLabel: 'Forget',
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "You said it in chat · Oct 27", "Tobi set it · Oct 20". */
export function factSourceLine(fact: ArtistFact, who: { isMe: boolean; name: string | null }): string {
  const [, month, day] = ymd(fact.updatedAt).split('-').map(Number);
  const when = month && day ? `${MONTHS[month - 1]} ${day}` : '';
  const verb = fact.source === 'chat' ? 'said it in chat' : 'set it';
  const subject = who.isMe ? 'You' : who.name;
  const line = subject ? `${subject} ${verb}` : fact.source === 'chat' ? 'Said in chat' : 'Set by hand';
  return when ? `${line} · ${when}` : line;
}
