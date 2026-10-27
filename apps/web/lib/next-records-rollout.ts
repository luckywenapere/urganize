// From the next record to its rollout (step 4, v2 mocks approved 27 Oct 2026).
// Pure rules: the hint under "Plan the rollout", what the "Here's what I'll
// use" sheet shows, what the planner is told, and the "Finish ..." tasks a song
// not yet done becomes. Server side in lib/next-records-rollout-server.ts. See
// docs/notes/2026-10-27-next-record.md, "v2 decisions".

import type { ReleaseCreditRole } from '@/types/credits';
import type { MusicStage } from './planner-v2/answers';
import type { PlanV2, PlanV2Task } from './planner-v2/plan';
import type { PlanReleaseType } from './release-planning';
import {
  formatSessionDay,
  pickNextSession,
  recordKindLabel,
  type NextRecord,
  type RecordSong,
  type SessionPerson,
  type SongStage,
} from './next-records';

const STILL: Record<Exclude<SongStage, 'done'>, string> = {
  idea: 'still an idea',
  recording: 'still recording',
  mixing: 'still mixing',
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The line under the button. It follows the songs; it never stops anyone planning. */
export function planHint(songs: readonly Pick<RecordSong, 'title' | 'stage'>[]): string {
  if (songs.length === 0) return 'Plan now, or add the songs first';
  const open = songs.filter((song) => song.stage !== 'done');
  if (open.length === 0) return 'Every song is done';
  if (open.length === 1) {
    const [song] = open;
    return `You can plan while ${song.title} is ${STILL[song.stage as Exclude<SongStage, 'done'>]}`;
  }
  return `You can plan while ${open.length} songs are still being made`;
}

/** "3 of 4 songs done", and the next session when there is one (shown in amber). */
export function recordStatusLine(
  record: Pick<NextRecord, 'songs' | 'sessions'>,
  today: string
): { main: string; next: string | null } {
  const done = record.songs.filter((song) => song.stage === 'done').length;
  const main = record.songs.length ? `${done} of ${plural(record.songs.length, 'song')} done` : 'No songs yet';
  const session = pickNextSession(record.sessions, today);
  if (!session) return { main, next: null };
  const when = session.date ? formatSessionDay(session.date) : session.dateHint;
  const who = session.people[0]?.name;
  return { main, next: `next session ${when}${who ? ` with ${who}` : ''}` };
}

/** Single, EP or album: what the record says, else the number of songs. */
export function recordReleaseType(record: Pick<NextRecord, 'kind' | 'songs'>): PlanReleaseType {
  if (record.kind) return record.kind;
  if (record.songs.length >= 7) return 'album';
  if (record.songs.length >= 3) return 'ep';
  return 'single';
}

/** Planner v2's "Where's the music": finished only when every song is done. */
export function recordMusicStage(record: Pick<NextRecord, 'songs'>): Extract<MusicStage, 'making' | 'finished'> {
  return record.songs.length > 0 && record.songs.every((song) => song.stage === 'done') ? 'finished' : 'making';
}

/** Everyone from the sessions that did not fall through, once each, in the order met. */
export function recordCredits(record: Pick<NextRecord, 'sessions'>): SessionPerson[] {
  const seen = new Set<string>();
  const people: SessionPerson[] = [];
  for (const session of record.sessions) {
    if (session.status === 'cancelled') continue;
    for (const person of session.people) {
      const key = person.personId ?? `${person.name.trim().toLowerCase()}|${person.role.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      people.push(person);
    }
  }
  return people;
}

/** A typed role ("mix engineer") as the credit sheet's roles. Unknown reads as other. */
export function creditRolesFor(role: string): ReleaseCreditRole[] {
  const text = role.trim().toLowerCase();
  if (!text) return ['other'];
  if (/\bmix/.test(text)) return ['mixing_engineer'];
  if (/\bmaster/.test(text)) return ['mastering_engineer'];
  if (/\bengineer/.test(text)) return ['engineer'];
  if (/\bproduc/.test(text)) return ['producer'];
  if (/\bfeat/.test(text)) return ['featured_artist'];
  if (/\blyric/.test(text)) return ['lyricist'];
  if (/\bcompos/.test(text)) return ['composer'];
  if (/\b(song)?writ/.test(text)) return ['songwriter'];
  if (/\b(vocal|singer)/.test(text)) return ['vocalist'];
  if (/\b(musician|player|instrument)/.test(text)) return ['musician'];
  return ['other'];
}

/** "EP · 4 songs · 2 credits", on the planner's first question. */
export function fromRecordLine(record: Pick<NextRecord, 'kind' | 'songs' | 'sessions'>): string {
  const credits = recordCredits(record).length;
  return [
    recordKindLabel(recordReleaseType(record)),
    plural(record.songs.length, 'song'),
    credits ? plural(credits, 'credit') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "4 songs · 2 sessions · 2 credits", on the rollout's "Made from your record". */
export function madeFromLine(record: Pick<NextRecord, 'songs' | 'sessions'>): string {
  return [
    plural(record.songs.length, 'song'),
    plural(record.sessions.length, 'session'),
    plural(recordCredits(record).length, 'credit'),
  ].join(' · ');
}

export function finishTaskTitle(song: Pick<RecordSong, 'title' | 'stage'>): string {
  if (song.stage === 'mixing') return `Finish the ${song.title} mix`;
  if (song.stage === 'recording') return `Finish recording ${song.title}`;
  return `Finish writing ${song.title}`;
}

/** The sheet's line about songs not done, or null when every song is. */
export function recordUseNote(songs: readonly Pick<RecordSong, 'title' | 'stage'>[]): string | null {
  const open = songs.filter((song) => song.stage !== 'done');
  if (open.length === 0) return null;
  if (open.length === 1) {
    const [song] = open;
    const still = STILL[song.stage as Exclude<SongStage, 'done'>];
    return `${song.title} is ${still}. I'll add "${finishTaskTitle(song)}" as the first task.`;
  }
  return `${open.length} songs aren't done yet. I'll add a task to finish each one, first.`;
}

/** Keys of the tasks the record adds. The browser's copy of them is never trusted. */
export const RECORD_TASK_PREFIX = 'rec_';

/** Where an undated plan starts (lib/planner-v2: day -56 to day 42). */
const EARLIEST_UNDATED_OFFSET = -56;

/**
 * One "Finish ..." task per song not yet done: first up, prep for now, free,
 * on the plan's earliest day, so it leads the list and blocks nothing.
 */
export function recordLeadTasks(songs: readonly Pick<RecordSong, 'title' | 'stage'>[], plan: Pick<PlanV2, 'tasks'>): PlanV2Task[] {
  const offsets = plan.tasks.map((task) => task.offset_days);
  const offset = offsets.length ? Math.min(...offsets) : EARLIEST_UNDATED_OFFSET;
  return songs
    .filter((song) => song.stage !== 'done')
    .map((song, index) => ({
      key: `${RECORD_TASK_PREFIX}${index + 1}`,
      library_id: null,
      title: finishTaskTitle(song).slice(0, 80),
      why: 'This song was still being made when the rollout was planned.',
      done_when: `${song.title} is done and mastered.`.slice(0, 100),
      phase: 'pre_release' as const,
      offset_days: offset,
      duration_days: 7,
      owner_role: 'artist' as const,
      channel: 'none' as const,
      cost_naira: 0,
      depends_on: [],
      first_up: true,
      now: true,
    }));
}

/** The plan as UrgAns wrote it, without any record task a browser sent back. */
export function withoutRecordTasks<T extends Pick<PlanV2, 'tasks'>>(plan: T): T {
  return { ...plan, tasks: plan.tasks.filter((task) => !task.key.startsWith(RECORD_TASK_PREFIX)) };
}
