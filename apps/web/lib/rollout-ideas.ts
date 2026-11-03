// Rollout ideas, "Chime in" (2026-10-26, v1.176.0). Pure and client-safe: the
// Ideas card, the ideas routes and the tests all read these, so the rules for
// who sees which path, what the planner is handed and where an invite lands
// live in one place.
//
// The flow (founder approved): the artist or manager talks (voice or typed) on
// a rollout, asks others to chime in, and the manager turns everyone's notes
// into a plan with AI (the planner intake, prefilled) or by hand.
//
// Storage: each note is a row in the existing release_messages table. No new
// table, no migration. The release chat that also reads that table stays cut.

import { isSafeNextPath } from './email-confirmation';
import type { OnboardingPersona } from './onboarding';
import { MAX_EXTRA_NOTES_LENGTH } from './release-planning';

/**
 * NEXT_PUBLIC_FEATURE_ROLLOUT_IDEAS: the Ideas card and every
 * /api/releases/[id]/ideas route (404 when off). ON unless set to 'false'.
 */
export const isRolloutIdeasEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_ROLLOUT_IDEAS !== 'false';

/**
 * NEXT_PUBLIC_FEATURE_IDEA_EMAIL_INVITES: "Ask for ideas" can invite someone
 * who is not on Urganize by email (a full team invite, so it uses a seat).
 * ON unless exactly 'false' (2026-10-26, founder: the invite step is email, the
 * normal team invite, not a WhatsApp link).
 */
export const isIdeaEmailInvitesEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_IDEA_EMAIL_INVITES !== 'false';

/** The two roles "Ask for ideas" offers a new person. Both map to the invite route's roles. */
export type IdeaInviteRole = 'artist' | 'team-member';
export type PendingIdeaInvite = { email: string; role: IdeaInviteRole };

/** Most new people one ask can invite. A typo guard, like MAX_CHIME_IN_RECIPIENTS. */
export const MAX_IDEA_INVITES = 10;

/** A trimmed, lowercased email, or null when the text is not one. */
export function parseIdeaInviteEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export type AddPendingInviteResult =
  | { ok: true; list: PendingIdeaInvite[] }
  | { ok: false; reason: 'invalid' | 'duplicate' | 'full' };

/** Queues one more address to be invited when the owner taps Send. Nothing is sent here. */
export function addPendingInvite(
  list: PendingIdeaInvite[],
  rawEmail: unknown,
  role: IdeaInviteRole
): AddPendingInviteResult {
  const email = parseIdeaInviteEmail(rawEmail);
  if (!email) return { ok: false, reason: 'invalid' };
  if (list.some((item) => item.email === email)) return { ok: false, reason: 'duplicate' };
  if (list.length >= MAX_IDEA_INVITES) return { ok: false, reason: 'full' };
  return { ok: true, list: [...list, { email, role }] };
}

/**
 * NEXT_PUBLIC_FEATURE_IDEA_REVIEW_PROMPT: on a rollout that has a plan, the
 * owner is shown a "<Name> added an idea" prompt when someone else adds a note,
 * with a way into the suggested changes. OFF unless exactly 'true'.
 */
export const isIdeaReviewPromptEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_IDEA_REVIEW_PROMPT === 'true';

/** A note on a rollout's Ideas card, as the ideas routes return it. */
export type IdeaNote = {
  id: string;
  userId: string;
  authorName: string;
  authorInitials: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
  /** A signed link to the kept voice clip, when the idea was spoken (2026-10-27). */
  audioUrl?: string | null;
  audioSeconds?: number | null;
};

/** Someone else on the rollout, for "Who should chime in?". */
export type IdeasPerson = {
  userId: string;
  name: string;
  /** This rollout's artist, as far as we can tell (ticked by default). */
  isArtist: boolean;
};

/** Longest single note. A spoken minute is about 150 words, so this fits a long one. */
export const MAX_IDEA_LENGTH = 2000;

/** Most people one "Ask to chime in" reaches. A typo guard, like chat's. */
export const MAX_CHIME_IN_RECIPIENTS = 25;

const timeOf = (value: unknown): number => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : NaN;
};

/**
 * Other people's notes the owner has not looked at yet: newer than the last
 * review. No baseline (or an unreadable one) means nothing to review, so an
 * old rollout never greets its owner with a pile of old notes.
 */
export function notesToReview(notes: IdeaNote[], reviewedAt: string | null): IdeaNote[] {
  const since = timeOf(reviewedAt);
  if (Number.isNaN(since)) return [];
  return notes.filter((note) => {
    if (note.isOwn) return false;
    const created = timeOf(note.createdAt);
    return !Number.isNaN(created) && created > since;
  });
}

/** Where a first look starts: the newest note's time, or now when there are none. */
export function reviewBaseline(notes: IdeaNote[], now: Date = new Date()): string {
  const times = notes.map((note) => timeOf(note.createdAt)).filter((time) => !Number.isNaN(time));
  return new Date(times.length ? Math.max(...times) : now.getTime()).toISOString();
}

/** "<First name> added an idea", or "<n> new ideas" when several are waiting. */
export function ideaReviewTitle(notes: IdeaNote[]): string {
  if (notes.length === 1) return `${firstWord(notes[0].authorName) || 'Someone'} added an idea`;
  return `${notes.length} new ideas`;
}

export const ROLLOUT_IDEAS_COPY = {
  title: "What's the idea?",
  titleFor: (releaseTitle: string) => {
    const name = String(releaseTitle || '').trim();
    return name ? `What's the idea for ${name}?` : "What's the idea?";
  },
  freshBody: 'Say it, or type it. AI turns it into your plan.',
  chimeInTitle: (name: string) => `Chime in on ${firstWord(name) || 'the team'}'s idea`,
  holdToTalk: 'Hold to talk',
  listening: 'Listening',
  working: 'Writing it down',
  orType: 'or type it',
  addAnother: 'Add another',
  placeholder: 'Say what you see for this rollout',
  add: 'Add note',
  cancel: 'Cancel',
  whoTitle: 'Who should chime in?',
  addSomeone: 'Add someone',
  ask: 'Ask to chime in',
  skip: 'Skip for now',
  shareWhatsApp: 'Share on WhatsApp',
  copyLink: 'Copy link',
  copied: 'Copied',
  draftWithAi: 'Draft with AI',
  writeMyself: 'Write it myself',
  soloInviteTitle: 'Get your manager or team to chime in',
  asked: (count: number) => (count === 1 ? 'Asked 1 person' : `Asked ${count} people`),
  empty: 'Nobody else is on this rollout yet.',
  noIdea: 'No idea yet? Ask your team',
  inviteTitle: 'Who should help shape it?',
  inviteBody: 'They add ideas. AI turns all of it into your plan.',
  inviteSent: 'Invite sent',
  readyTitle: 'Ready when you are.',
  readyBody: 'Build now, or wait for their ideas first.',
  readyBodySkipped: 'Build your plan now.',
  buildPlan: 'Build my plan',
  manualTitle: 'Build it your way.',
  manualBody: 'Add activities yourself. AI is here whenever you want it.',
  addActivity: 'Add an activity',
  draftInstead: 'Draft with AI instead',
  addMyself: 'Or add activities yourself',
  waitForIdeas: 'Wait for their ideas',
  fiveQuestions: 'Five questions. About a minute.',
  waitingTitle: 'Waiting for their ideas.',
  waitingBody: 'Their notes show up here. Build the plan whenever you like.',
} as const;

function firstWord(value: string): string {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

/**
 * Which Ideas card a person sees on a rollout.
 *  - 'chime_in': not the owner. They add notes; the plan is the owner's.
 *  - 'solo': the owner is an independent artist with nobody else on the
 *    rollout. Draft with AI leads, and a quiet card asks for a manager or team.
 *  - 'manager': everyone else who owns the rollout (manager, artist team,
 *    label, other, an older account that never answered, or a solo artist who
 *    already has people). After a note: "Who should chime in?".
 * producer_beatmaker is no longer offered at sign-up; it reads as solo, since
 * it was always one person making the music.
 */
export type IdeasPath = 'chime_in' | 'solo' | 'manager';

export function ideasPathFor(input: {
  isOwner: boolean;
  persona: OnboardingPersona | null | undefined;
  /** People on the rollout besides the viewer. */
  teammateCount: number;
}): IdeasPath {
  if (!input.isOwner) return 'chime_in';
  const soloPersona = input.persona === 'independent_artist' || input.persona === 'producer_beatmaker';
  return soloPersona && input.teammateCount === 0 ? 'solo' : 'manager';
}

export type IdeaNoteLike = { authorName: string; content: string };

/**
 * Everyone's notes as the planner's "anything else" answer: one "Name: text"
 * line per note, oldest first, inner whitespace folded so a note stays one
 * line. Capped at MAX_EXTRA_NOTES_LENGTH: whole lines are kept while they fit,
 * and the first one that does not is cut at a word with "…". Never longer than
 * the cap.
 */
export function ideasToExtraNotes(notes: IdeaNoteLike[], max: number = MAX_EXTRA_NOTES_LENGTH): string {
  const lines = notes
    .map((note) => {
      const text = String(note.content || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      const name = String(note.authorName || '').replace(/\s+/g, ' ').trim() || 'Team';
      return `${name}: ${text}`;
    })
    .filter(Boolean);

  let out = '';
  for (const line of lines) {
    const next = out ? `${out}\n${line}` : line;
    if (next.length <= max) {
      out = next;
      continue;
    }
    const room = max - (out ? out.length + 1 : 0) - 1; // 1 for the ellipsis
    if (room > 20) {
      const cut = line.slice(0, room);
      const space = cut.lastIndexOf(' ');
      const piece = (space > room * 0.6 ? cut.slice(0, space) : cut).trimEnd();
      out = out ? `${out}\n${piece}…` : `${piece}…`;
    }
    break;
  }
  return out.slice(0, max);
}

/** Where a chime-in invite and every ideas notification land: the rollout. */
export function rolloutIdeasPath(releaseId: string): string {
  return `/dashboard?release=${encodeURIComponent(releaseId)}`;
}

/**
 * The `next` an invite link may carry: a same-origin path inside the app's
 * dashboard, nothing else. Null for anything that is not (another site, a
 * protocol-relative URL, control characters, an over-long value).
 */
export function safeInviteNextPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path || path.length > 300) return null;
  if (!isSafeNextPath(path)) return null;
  if (!(path === '/dashboard' || path.startsWith('/dashboard?') || path.startsWith('/dashboard/'))) return null;
  return path;
}

/** The invite link with the rollout to land on after joining. */
export function withInviteNext(inviteUrl: string, releaseId: string): string {
  try {
    const url = new URL(inviteUrl);
    url.searchParams.set('next', rolloutIdeasPath(releaseId));
    return url.toString();
  } catch {
    return inviteUrl;
  }
}

/** "<Name> wants you to chime in on <title>" and the link, for WhatsApp. */
export function chimeInShareText(input: { senderName: string; releaseTitle: string; link: string }): string {
  return `${chimeInAskLine(input.senderName, input.releaseTitle)}\n${input.link}`;
}

export function chimeInAskLine(senderName: string, releaseTitle: string): string {
  const name = String(senderName || '').trim() || 'Your teammate';
  const title = String(releaseTitle || '').trim() || 'a rollout';
  return `${name} wants you to chime in on ${title}`;
}

export function chimedInLine(authorName: string, releaseTitle: string): string {
  const name = String(authorName || '').trim() || 'Your teammate';
  const title = String(releaseTitle || '').trim() || 'your rollout';
  return `${name} chimed in on ${title}`;
}

export function planReadyLine(releaseTitle: string): string {
  const title = String(releaseTitle || '').trim() || 'your rollout';
  return `Your plan for ${title} is ready`;
}

/**
 * Who hears about a new note: a push to everyone who can see the rollout
 * except the author, and an email to the owner unless the owner wrote it.
 */
export function ideaNoteRecipients(input: {
  peopleIds: string[];
  ownerId: string;
  authorId: string;
  /** While an idea round is open the idea is private: only the owner hears of it. */
  ownerOnly?: boolean;
}): { pushIds: string[]; emailOwner: boolean } {
  const seen = new Set<string>();
  const pushIds: string[] = [];
  for (const id of input.ownerOnly ? [input.ownerId] : [input.ownerId, ...input.peopleIds]) {
    if (!id || id === input.authorId || seen.has(id)) continue;
    seen.add(id);
    pushIds.push(id);
  }
  return { pushIds, emailOwner: Boolean(input.ownerId) && input.ownerId !== input.authorId };
}

/**
 * The people an "Ask to chime in" may reach: only ids that can see the
 * rollout, never the asker, each once, at most MAX_CHIME_IN_RECIPIENTS.
 */
export function chimeInAskRecipients(input: {
  requested: unknown;
  allowedIds: string[];
  askerId: string;
}): string[] {
  if (!Array.isArray(input.requested)) return [];
  const allowed = new Set(input.allowedIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.requested) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || id === input.askerId || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_CHIME_IN_RECIPIENTS) break;
  }
  return out;
}

const fold = (value: unknown): string =>
  String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/**
 * Whether a teammate is this rollout's artist, so "Who should chime in?" can
 * tick them by default: an artist account whose artist name (or, failing
 * that, own name) is the rollout's artist. Never guesses on a blank name.
 */
export function isRolloutArtist(
  person: { role?: string | null; artistName?: string | null; name?: string | null },
  rolloutArtistName: string | null | undefined
): boolean {
  const target = fold(rolloutArtistName);
  if (!target || person.role !== 'artist') return false;
  return fold(person.artistName) === target || fold(person.name) === target;
}
