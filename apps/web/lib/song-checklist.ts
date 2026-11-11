import type { SongStage } from './next-records';
import { isTaskClosed, type TaskStatus } from '@/types/tasks';

// The song checklist (2026-11-11, #1143, mocks docs/mocks/song-to-review).
// Opening a project shows the whole job of making a song, in order, with no
// dates: four groups, fifteen tasks. Idea and Making are one "Song" stage on
// screen; the groups are what used to be the stages.
//
// Pure, so the project page, the seeding route and the AI all read one list.
// The tasks are real rows on the project (tasks.record_id), so carry-over at
// Plan the rollout, assignment, chasing and the task pop-up work unchanged.
// A row is matched back to its item by title, the same way suggestions were.

export type ChecklistGroupKey = 'idea' | 'recording' | 'finishing' | 'paperwork';

export type ChecklistItem = { key: string; title: string; description?: string };

export type ChecklistGroup = { key: ChecklistGroupKey; label: string; items: readonly ChecklistItem[] };

export const SONG_CHECKLIST: readonly ChecklistGroup[] = [
  {
    key: 'idea',
    label: 'Idea',
    items: [
      { key: 'song_hook', title: 'Write the hook', description: 'The line people will sing back.' },
      { key: 'song_demo', title: 'Record a voice note demo', description: 'A rough take, even on a phone.' },
      { key: 'song_producer', title: 'Pick the producer' },
    ],
  },
  {
    key: 'recording',
    label: 'Recording',
    items: [
      { key: 'song_session', title: 'Book the studio session', description: 'Studio, engineer and a day.' },
      { key: 'song_vocals', title: 'Record vocals' },
      { key: 'song_feature', title: 'Feature agreed and signed', description: 'Skip if there is no feature.' },
      { key: 'song_files', title: 'Get the session files', description: 'Stems and the project file, saved somewhere safe.' },
    ],
  },
  {
    key: 'finishing',
    label: 'Finishing',
    items: [
      { key: 'song_mix_notes', title: 'Send notes to the mix engineer' },
      { key: 'song_mix_ok', title: 'Mix approved' },
      { key: 'song_master', title: 'Master the song' },
      { key: 'song_master_ok', title: 'Master approved' },
    ],
  },
  {
    key: 'paperwork',
    label: 'Paperwork',
    items: [
      { key: 'song_splits', title: 'Split sheet signed', description: 'Who wrote what, signed by everyone.' },
      { key: 'song_credits', title: 'Write down the credits', description: 'Writers, producers, engineers, players.' },
      { key: 'song_producer_deal', title: 'Producer agreement signed' },
      { key: 'song_samples', title: 'Clear any samples', description: 'Skip if there are none.' },
    ],
  },
];

export const SONG_CHECKLIST_SIZE = SONG_CHECKLIST.reduce((sum, group) => sum + group.items.length, 0);

/** The groups a song has already passed at each stage; their tasks start ticked. */
const DONE_GROUPS_AT: Record<SongStage, readonly ChecklistGroupKey[]> = {
  idea: [],
  recording: ['idea'],
  mixing: ['idea', 'recording'],
  done: ['idea', 'recording', 'finishing'],
};

const STAGE_ORDER: readonly SongStage[] = ['idea', 'recording', 'mixing', 'done'];

export function sameTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

const ITEM_BY_TITLE = new Map(
  SONG_CHECKLIST.flatMap((group) => group.items.map((item) => [sameTitle(item.title), { item, group: group.key }] as const))
);

/** The furthest any song has got; a project with no songs is at idea. */
export function furthestSongStage(songs: ReadonlyArray<{ stage: SongStage }>): SongStage {
  let at = 0;
  for (const song of songs) at = Math.max(at, STAGE_ORDER.indexOf(song.stage));
  return STAGE_ORDER[at] ?? 'idea';
}

export type ChecklistSeedRow = {
  key: string;
  title: string;
  description: string | null;
  group: ChecklistGroupKey;
  groupLabel: string;
  status: Extract<TaskStatus, 'todo' | 'done'>;
  /** Place in the whole checklist, 0 to 14, so the order survives the database. */
  position: number;
};

/**
 * The checklist tasks a project still needs, ticked up to the song's stage.
 * A title the project already has is never added again.
 */
export function checklistSeedRows(input: { stage: SongStage; existingTitles: readonly string[] }): ChecklistSeedRow[] {
  const taken = new Set(input.existingTitles.map(sameTitle));
  const doneGroups = new Set(DONE_GROUPS_AT[input.stage]);
  const rows: ChecklistSeedRow[] = [];
  let position = 0;
  for (const group of SONG_CHECKLIST) {
    for (const item of group.items) {
      if (!taken.has(sameTitle(item.title))) {
        rows.push({
          key: item.key,
          title: item.title,
          description: item.description ?? null,
          group: group.key,
          groupLabel: group.label,
          status: doneGroups.has(group.key) ? 'done' : 'todo',
          position,
        });
      }
      position += 1;
    }
  }
  return rows;
}

type TaskLike = { id: string; title: string; status: string };

export type GroupedTasks<T extends TaskLike> = {
  groups: Array<{ key: ChecklistGroupKey; label: string; tasks: T[]; done: number; total: number }>;
  /** Tasks the team added that are not on the checklist, in the order given. */
  other: T[];
  done: number;
  total: number;
};

const closed = (status: string) => isTaskClosed(status as TaskStatus);

/** A project's tasks sorted into the checklist groups, in checklist order. */
export function groupProjectTasks<T extends TaskLike>(tasks: readonly T[]): GroupedTasks<T> {
  const byGroup = new Map<ChecklistGroupKey, T[]>();
  const other: T[] = [];
  for (const row of tasks) {
    const match = ITEM_BY_TITLE.get(sameTitle(row.title));
    if (!match) {
      other.push(row);
      continue;
    }
    byGroup.set(match.group, [...(byGroup.get(match.group) ?? []), row]);
  }
  const order = (row: T) => {
    const match = ITEM_BY_TITLE.get(sameTitle(row.title));
    const group = SONG_CHECKLIST.find((entry) => entry.key === match?.group);
    return group ? group.items.findIndex((item) => item.key === match?.item.key) : 0;
  };
  const groups = SONG_CHECKLIST.filter((group) => byGroup.has(group.key)).map((group) => {
    const rows = [...(byGroup.get(group.key) ?? [])].sort((a, b) => order(a) - order(b));
    return { key: group.key, label: group.label, tasks: rows, done: rows.filter((row) => closed(row.status)).length, total: rows.length };
  });
  const all = [...groups.flatMap((group) => group.tasks), ...other];
  return { groups, other, done: all.filter((row) => closed(row.status)).length, total: all.length };
}

/** Whether a project already has the checklist (any of its tasks). */
export function hasSongChecklist(tasks: ReadonlyArray<{ title: string }>): boolean {
  return tasks.some((row) => ITEM_BY_TITLE.has(sameTitle(row.title)));
}
