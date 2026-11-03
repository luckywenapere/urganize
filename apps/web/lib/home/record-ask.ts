// Home asks about the next record (2026-10-27, step 3, mock screen 1 approved).
//
// Two questions, one card at a time, in Home's One Thing:
//
//   "What's next for <artist>?" a week after the artist's latest release went
//   live (the scoreboard's releaseLiveAt, which is lib/recap-eligibility.ts's
//   rule answering WHEN), until the artist has a record in the making.
//
//   "Did it happen?" the day after a dated session that is still planned.
//
// Pure: the clock is passed in. Reads live in lib/next-records-server.ts
// (loadHomeRecordAsk). See docs/notes/2026-10-27-next-record.md.

import { formatSessionDay, type RecordSession, type SessionStatus } from '@/lib/next-records';

const DAY_MS = 86_400_000;

/** Days after a release goes live before Home asks what's next. */
export const WHATS_NEXT_AFTER_DAYS = 7;
/** A release out longer than this is no longer the moment to ask. */
export const WHATS_NEXT_UNTIL_DAYS = 90;
/** "Nothing yet, ask me in 2 weeks." */
export const SNOOZE_DAYS = 14;
/** A planned session older than this is let go rather than asked about. */
export const SESSION_CHECK_DAYS = 14;

export type AskRelease = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  /** When it went live (releaseLiveAt), in ms, or null if it has not. */
  liveAt: number | null;
  /** Dated ahead of today: the artist's next release is already planned. */
  upcoming: boolean;
};

export type WhatsNextAsk = {
  kind: 'whats_next';
  artistId: string;
  artistName: string;
  releaseTitle: string;
  daysOut: number;
};

export type SessionCheckAsk = {
  kind: 'session_check';
  recordId: string;
  recordTitle: string;
  artistId: string;
  artistName: string;
  /** The whole session, so the answer can PUT it back with one thing changed. */
  session: RecordSession;
};

export type RecordAsk = WhatsNextAsk | SessionCheckAsk;

/** Check-ins go to the manager only (settled question 2): owners and admins. */
export function canSeeRecordAsks(memberRole: string | null | undefined): boolean {
  return memberRole === 'owner' || memberRole === 'admin';
}

export function pickWhatsNext(
  input: {
    releases: readonly AskRelease[];
    /** Artists with a record whose status is 'making'. */
    artistsMaking: ReadonlySet<string>;
    /** artist id to snooze_until (ISO). */
    snoozedUntil: ReadonlyMap<string, string>;
    scopeArtistId: string | null;
  },
  now: Date
): WhatsNextAsk | null {
  const byArtist = new Map<string, AskRelease[]>();
  for (const release of input.releases) {
    if (input.scopeArtistId && release.artistId !== input.scopeArtistId) continue;
    const list = byArtist.get(release.artistId) ?? [];
    list.push(release);
    byArtist.set(release.artistId, list);
  }

  let best: { release: AskRelease; liveAt: number } | null = null;
  for (const [artistId, releases] of byArtist) {
    if (input.artistsMaking.has(artistId)) continue;
    if (releases.some((release) => release.upcoming)) continue;
    const snooze = Date.parse(input.snoozedUntil.get(artistId) ?? '');
    if (Number.isFinite(snooze) && snooze > now.getTime()) continue;

    let latest: { release: AskRelease; liveAt: number } | null = null;
    for (const release of releases) {
      if (release.liveAt === null) continue;
      if (!latest || release.liveAt > latest.liveAt) latest = { release, liveAt: release.liveAt };
    }
    if (!latest) continue;
    const days = Math.floor((now.getTime() - latest.liveAt) / DAY_MS);
    if (days < WHATS_NEXT_AFTER_DAYS || days > WHATS_NEXT_UNTIL_DAYS) continue;
    if (!best || latest.liveAt > best.liveAt) best = latest;
  }
  if (!best) return null;
  return {
    kind: 'whats_next',
    artistId: best.release.artistId,
    artistName: best.release.artistName,
    releaseTitle: best.release.title,
    daysOut: Math.floor((now.getTime() - best.liveAt) / DAY_MS),
  };
}

export type CheckableSession = { id: string; recordId: string; date: string | null; status: SessionStatus };

/** YYYY-MM-DD minus n days. */
function minusDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The session to ask about: still planned, dated before today and not more
 * than two weeks back, the most recent first. Answering changes its status
 * (or, for Moved, its day), so each one is asked once.
 */
export function pickSessionToCheck<T extends CheckableSession>(sessions: readonly T[], today: string): T | null {
  const oldest = minusDays(today, SESSION_CHECK_DAYS);
  const due = sessions
    .filter((s) => s.status === 'planned' && s.date !== null && s.date < today && s.date >= oldest)
    .sort((a, b) => (b.date as string).localeCompare(a.date as string));
  return due[0] ?? null;
}

/** One card at a time: a session check first (it is once and dated), then what's next. */
export function pickRecordAsk<A, B>(input: { whatsNext: A | null; sessionCheck: B | null }): A | B | null {
  return input.sessionCheck ?? input.whatsNext ?? null;
}

export function snoozeUntil(now: Date): string {
  return new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString();
}

/** "a week", "2 weeks", "a month", "2 months". */
export function describeOutFor(days: number): string {
  if (days < 14) return 'a week';
  if (days < 30) return `${Math.floor(days / 7)} weeks`;
  if (days < 60) return 'a month';
  return `${Math.floor(days / 30)} months`;
}

export function describeSessionQuestion(
  session: { date: string | null; people: readonly { name: string }[] },
  today: string
): string {
  const when =
    session.date && session.date === minusDays(today, 1)
      ? "yesterday's session"
      : session.date
        ? `the session on ${formatSessionDay(session.date)}`
        : 'the session';
  const names = session.people.map((person) => person.name);
  const withWho =
    names.length === 0
      ? ''
      : names.length === 1
        ? ` with ${names[0]}`
        : names.length === 2
          ? ` with ${names[0]} and ${names[1]}`
          : ` with ${names[0]} and ${names.length - 1} others`;
  return `Did ${when}${withWho} happen?`;
}

export const RECORD_ASK_COPY = {
  label: 'AI',
  whatsNextTitle: (ask: Pick<WhatsNextAsk, 'releaseTitle' | 'artistName' | 'daysOut'>) =>
    `"${ask.releaseTitle}" has been out ${describeOutFor(ask.daysOut)}. What's next for ${ask.artistName}?`,
  whatsNextLine: "Tell me in a line. I'll keep track of the songs and sessions so nothing lives in your head.",
  whatsNextPlaceholder: 'e.g. new EP, 4 songs, recording in Dec',
  send: 'Start the record',
  snooze: 'Nothing yet, ask me in 2 weeks',
  happened: 'Happened',
  moved: 'Moved',
  cancelled: "Didn't happen",
  movedQuestion: 'When is it now?',
  movedHint: 'Or say when, like "next week"',
  save: 'Save',
  back: 'Back',
  failed: 'That did not save. Try again.',
} as const;
