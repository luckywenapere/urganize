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

/** A note on a rollout's Ideas card, as the ideas routes return it. */
export type IdeaNote = {
  id: string;
  userId: string;
  authorName: string;
  authorInitials: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
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

export const ROLLOUT_IDEAS_COPY = {
  title: "What's the idea?",
  chimeInTitle: (name: string) => `Chime in on ${firstWord(name) || 'the team'}'s idea`,
  holdToTalk: 'Hold to talk',
  listening: 'Listening',
  working: 'Writing it down',
  orType: 'or type it',
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
}): { pushIds: string[]; emailOwner: boolean } {
  const seen = new Set<string>();
  const pushIds: string[] = [];
  for (const id of [input.ownerId, ...input.peopleIds]) {
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
