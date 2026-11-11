import { finishTaskTitle } from './next-records-rollout';
import type { RecordStatus, SongStage } from './next-records';
import { checklistSeedRows, sameTitle } from './song-checklist';

// The jobs a project suggests next. Since 11 Nov 2026 (#1143) a project opens
// with the whole song checklist (lib/song-checklist.ts), so this offers only
// what the project is missing: one finish job per song still being made, then
// the checklist tasks it does not have. Pure, so the AI's get_project read and
// the chips after an add show the same list, and the AI never invents a job:
// it picks from here (templates carry the knowledge, AI tailors).

export type ProjectSuggestion = { key: string; title: string; description: string };

const DEFAULT_LIMIT = 4;

export function suggestProjectTasks(input: {
  status: RecordStatus;
  songs: ReadonlyArray<{ title: string; stage: SongStage }>;
  /** Titles of the project's tasks, open or done. A job already added is hidden. */
  existingTitles: readonly string[];
  limit?: number;
}): ProjectSuggestion[] {
  if (input.status !== 'idea' && input.status !== 'making') return [];
  const limit = input.limit ?? DEFAULT_LIMIT;
  const perSong =
    input.status === 'making'
      ? input.songs
          .filter((song) => song.stage === 'recording' || song.stage === 'mixing')
          .map((song, index) => ({
            key: `finish_${index}_${sameTitle(song.title).replace(/[^a-z0-9]+/g, '_')}`,
            title: finishTaskTitle(song),
            description: song.stage === 'mixing' ? 'Mix signed off by the artist.' : 'Every part recorded.',
          }))
      : [];
  const checklist = checklistSeedRows({ stage: 'idea', existingTitles: [] }).map((row) => ({
    key: row.key,
    title: row.title,
    description: row.description ?? '',
  }));
  const taken = new Set(input.existingTitles.map(sameTitle));
  return [...perSong, ...checklist].filter((item) => !taken.has(sameTitle(item.title))).slice(0, Math.max(0, limit));
}
