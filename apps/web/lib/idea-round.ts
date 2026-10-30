/**
 * Idea round, then brief, then plan (2026-10-27, founder approved mocks).
 *
 * A rollout's ideas are collected in a round. While it is open each teammate
 * sees only their own idea; the rollout owner and team owners/admins see all
 * of them. Closing the round lets UrgAns write the brief from the ideas
 * (release.brief_from_ideas), the manager edits and approves it, and only then
 * is the plan built, with the approved brief as its notes. An approved brief
 * is locked until someone makes a new version, which never touches tasks.
 *
 * Pure rules only. The database half is lib/idea-round-server.ts; the round
 * and approval columns live on release_briefs
 * (20261027120000_idea_round_and_brief_approval.sql).
 */

import { MAX_DECISION_LENGTH, MAX_IDEA_LENGTH } from '@/lib/release-brief';
import { feelFromModel, type BriefFeel } from '@/lib/brief-board';

/** ON unless set to 'false', like every flag shipped on since 2026-10. */
export function isIdeaRoundEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_IDEA_ROUND !== 'false';
}

export type IdeaRoundState = 'open' | 'closed' | 'approved';

export function ideaRoundState(input: { ideasClosedAt: string | null; approvedAt: string | null }): IdeaRoundState {
  if (input.approvedAt) return 'approved';
  if (input.ideasClosedAt) return 'closed';
  return 'open';
}

/**
 * A rollout planned before the round existed never had one: its ideas stay
 * visible to the whole team, as they were. Only the visibility reads this; the
 * plan gate and the lock read the stored state.
 */
export function effectiveRoundState(state: IdeaRoundState, hasPlan: boolean): IdeaRoundState {
  return state === 'open' && hasPlan ? 'closed' : state;
}

/** Who closes the round, settles the brief and approves it: the rollout's
 *  owner, or an owner or admin of the team (canManageBriefShare's rule). */
export function canRunIdeaRound(input: { viewerId: string; releaseOwnerId: string; isTeamAdmin: boolean }): boolean {
  return Boolean(input.viewerId) && (input.viewerId === input.releaseOwnerId || input.isTeamAdmin);
}

/** While the round is open a teammate sees only their own ideas. */
export function visibleIdeaNotes<T extends { userId: string }>(
  notes: T[],
  input: { state: IdeaRoundState; viewerId: string; seeAll: boolean }
): T[] {
  if (input.seeAll || input.state !== 'open') return notes;
  return notes.filter((note) => note.userId === input.viewerId);
}

/** Everyone who was asked has added at least one idea. Nobody asked is never "everyone in". */
export function everyoneAskedIsIn(askedIds: readonly string[], notes: ReadonlyArray<{ userId: string }>): boolean {
  const asked = [...new Set(askedIds.filter(Boolean))];
  if (!asked.length) return false;
  const authors = new Set(notes.map((note) => note.userId));
  return asked.every((id) => authors.has(id));
}

/** How many of the people asked have added an idea. */
export function askedInCount(askedIds: readonly string[], notes: ReadonlyArray<{ userId: string }>): number {
  const authors = new Set(notes.map((note) => note.userId));
  return [...new Set(askedIds.filter(Boolean))].filter((id) => authors.has(id)).length;
}

// ── Where the ideas disagree ────────────────────────────────────────────────

export type ToSettleOption = { text: string; by: string[] };
export type ToSettleItem = { id: string; question: string; options: ToSettleOption[] };

export const MAX_TO_SETTLE = 5;
const MAX_OPTIONS = 3;
const MAX_QUESTION_LENGTH = 120;
const MAX_NAME_LENGTH = 40;

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** The stored (or model-written) list, made safe: at most five questions, each
 *  with two or three named options. Anything malformed is dropped. */
export function parseToSettle(raw: unknown): ToSettleItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ToSettleItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const question = clean(row.question, MAX_QUESTION_LENGTH);
    const options = (Array.isArray(row.options) ? row.options : [])
      .map((option) => {
        const value = (option ?? {}) as Record<string, unknown>;
        const by = (Array.isArray(value.by) ? value.by : [])
          .map((name) => clean(name, MAX_NAME_LENGTH))
          .filter(Boolean)
          .slice(0, 4);
        return { text: clean(value.text, MAX_DECISION_LENGTH), by };
      })
      .filter((option) => option.text)
      .slice(0, MAX_OPTIONS);
    if (!question || options.length < 2) continue;
    const id = clean(row.id, 40) || `s${items.length + 1}`;
    if (items.some((item) => item.id === id)) continue;
    items.push({ id, question, options });
    if (items.length >= MAX_TO_SETTLE) break;
  }
  return items;
}

/** The decision a picked option becomes: "Radio or no radio?" + "Skip radio" reads as the option alone. */
export function settledDecisionBody(item: ToSettleItem, optionIndex: number): string | null {
  const option = item.options[optionIndex];
  return option ? option.text.slice(0, MAX_DECISION_LENGTH) : null;
}

// ── The plan's input ────────────────────────────────────────────────────────

/** The planner's notes box holds up to 1000 characters (lib/planner-v2/answers.ts MAX_NOTES). */
export const PLAN_NOTES_MAX = 1000;

/**
 * The approved brief as the plan's notes: the idea, the decisions, and any
 * question left open. This is the ONLY creative input the plan gets once a
 * rollout has ideas; the raw ideas never reach the planner.
 */
export function briefToPlanNotes(input: {
  idea: string;
  decisions: ReadonlyArray<{ body: string }>;
  toSettle: ReadonlyArray<ToSettleItem>;
}): string {
  const parts = [
    input.idea.trim() ? `Brief: ${input.idea.trim().replace(/\s+/g, ' ')}` : '',
    input.decisions.length ? `Decided: ${input.decisions.map((d) => d.body.trim()).filter(Boolean).join('; ')}` : '',
    input.toSettle.length
      ? `Still open: ${input.toSettle.map((item) => `${item.question} (${item.options.map((o) => o.text).join(' or ')})`).join('; ')}`
      : '',
  ].filter(Boolean);
  const text = parts.join('\n');
  return text.length > PLAN_NOTES_MAX ? `${text.slice(0, PLAN_NOTES_MAX - 1).trimEnd()}…` : text;
}

/**
 * Whether a plan may be built now. A rollout with no ideas keeps today's
 * planner. A rollout with ideas needs its brief approved first.
 */
export function planGate(input: { hasIdeas: boolean; state: IdeaRoundState }): 'free' | 'needs_approval' | 'from_brief' {
  if (!input.hasIdeas) return 'free';
  return input.state === 'approved' ? 'from_brief' : 'needs_approval';
}

// ── UrgAns: the brief from the ideas ────────────────────────────────────────

export type BriefFromIdeasContext = {
  title: string;
  artistName: string;
  releaseType: string;
  ideas: ReadonlyArray<{ author: string; content: string }>;
};

export type BriefFromIdeas = {
  idea: string;
  decisions: { body: string; source: string | null }[];
  toSettle: ToSettleItem[];
  /** The first board (#897 phase 5): the one-line idea and the mood words. Empty when the model gave none. */
  feel: Omit<BriefFeel, 'palette'>;
};

const MAX_IDEAS_IN_PROMPT = 30;
const MAX_IDEA_CHARS_IN_PROMPT = 1200;

export function buildBriefFromIdeasMessages(
  context: BriefFromIdeasContext
): { role: 'system' | 'user'; content: string }[] {
  const facts = [
    `Title: ${context.title || 'Untitled'}`,
    context.artistName ? `Artist: ${context.artistName}` : '',
    context.releaseType ? `Format: ${context.releaseType}` : '',
    'Ideas from the team, each with who said it:',
    ...context.ideas
      .slice(0, MAX_IDEAS_IN_PROMPT)
      .map((idea) => `- ${idea.author}: ${idea.content.replace(/\s+/g, ' ').trim().slice(0, MAX_IDEA_CHARS_IN_PROMPT)}`),
  ].filter(Boolean);

  return [
    {
      role: 'system',
      content:
        'You merge a music team\'s ideas for one release into a brief the team will approve before any plan is made. ' +
        'Reply with JSON only, no markdown: {"headline": string, "idea": string, "feels_like": [string], "not_this": [string], "decisions": [{"body": string, "from": string}], "to_settle": [{"question": string, "options": [{"text": string, "by": [string]}]}]}. ' +
        '"headline": the idea in one short line the team can repeat, under 12 words, no quote marks. ' +
        '"idea": 2 to 4 short plain sentences: the goal and how the rollout should carry it, using what the ideas agree on. ' +
        '"feels_like": up to 4 single words or two-word phrases for the mood the ideas describe (like Sunlit, Close, Unpolished). "not_this": up to 3 for what the ideas say to avoid. Leave a list empty when the ideas say nothing about it. ' +
        '"decisions": one-line facts the ideas agree on or only one person raised and nobody contradicted (budget, day of the week, a channel, a video). "from" is the name of who said it. At most 6. ' +
        '"to_settle": every place two people want different things. Never pick a side: write a short question and each side as an option with the names of who wants it. At most 5. Leave it empty when nobody disagrees. ' +
        'Use only what the ideas say. Never invent names, numbers, places or plans. No emojis. Plain words a 10 year old understands.',
    },
    { role: 'user', content: facts.join('\n') },
  ];
}

/** The model's JSON as a safe brief, or null when nothing usable came back. */
export function parseBriefFromIdeas(raw: string, knownAuthors: readonly string[] = []): BriefFromIdeas | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const idea = clean(parsed.idea, MAX_IDEA_LENGTH);
  if (!idea) return null;
  const known = new Map(knownAuthors.map((name) => [name.toLowerCase(), name]));
  const decisions = (Array.isArray(parsed.decisions) ? parsed.decisions : [])
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const body = clean(row.body, MAX_DECISION_LENGTH);
      const from = clean(row.from, MAX_NAME_LENGTH);
      // Only a name that really added an idea is credited; anything else is left unsourced.
      const source = from ? known.get(from.toLowerCase()) ?? null : null;
      return { body, source };
    })
    .filter((decision) => decision.body)
    .slice(0, 6);
  const toSettle = parseToSettle(parsed.to_settle ?? parsed.toSettle).map((item, index) => ({ ...item, id: `s${index + 1}` }));
  return { idea, decisions, toSettle, feel: feelFromModel(parsed) };
}

/** "Kemi's idea" for a decision's source line. */
export function ideaSourceLabel(name: string): string {
  const first = name.trim().split(/\s+/)[0] || name.trim();
  return first ? `${first}'s idea` : '';
}

// ── Recordings ──────────────────────────────────────────────────────────────

/** Voice clips are kept in the private release-assets bucket under this prefix. */
export function ideaAudioPrefix(releaseId: string, userId: string): string {
  return `ideas/${releaseId}/${userId}/`;
}

/** A clip path a note may claim: only one this person uploaded for this rollout. */
export function isOwnIdeaAudioPath(path: unknown, releaseId: string, userId: string): path is string {
  if (typeof path !== 'string' || path.length > 300) return false;
  const prefix = ideaAudioPrefix(releaseId, userId);
  return path.startsWith(prefix) && /^[a-z0-9-]+\.(webm|mp4|ogg|m4a)$/i.test(path.slice(prefix.length));
}

export function formatClipLength(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export const IDEA_ROUND_COPY = {
  privateHint: (ownerFirst: string) =>
    ownerFirst ? `Only you and ${ownerFirst} see this until the round closes.` : 'Only you and the owner see this until the round closes.',
  ownerPrivateHint: 'They each add an idea. Only you see them all until you close.',
  teammateTitle: (ownerFirst: string, title: string) =>
    `${ownerFirst || 'Your team'} wants your idea for ${title || 'this rollout'}`,
  teammateBody: 'The moment, the money, who to reach. Anything.',
  thanksTitle: (first: string) => (first ? `Thanks, ${first}` : 'Thanks'),
  thanksBody: (ownerFirst: string) => `${ownerFirst || 'The owner'} will close the round and share the brief.`,
  inCount: (count: number) => (count === 1 ? '1 idea is in' : `${count} ideas are in`),
  close: 'Close and write the brief',
  closing: 'Closing the round…',
  closedTitle: 'Ideas are closed',
  closedBody: 'The brief is next.',
  readBrief: 'Read the brief',
  everyoneIn: 'Everyone you asked has added an idea.',
  notApproved: 'Approve the brief first. The plan is built from it.',
  approved: 'This brief is approved. Make a new version to change it.',
} as const;
