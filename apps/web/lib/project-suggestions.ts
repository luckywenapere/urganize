import { PRE_PRODUCTION_TASKS } from './pre-production';
import { finishTaskTitle } from './next-records-rollout';
import type { RecordStatus, SongStage } from './next-records';

// The jobs a project suggests next (4 Nov 2026, mocks approved). Pure, so the
// project page, the AI's get_project read and the chips after an add all show
// the same list, and the AI never invents a job: it picks from here, the same
// rule as the release playbooks (templates carry the knowledge, AI tailors).

export type ProjectSuggestion = { key: string; title: string; description: string };

export const IDEA_STAGE_SUGGESTIONS: readonly ProjectSuggestion[] = [
  { key: 'idea_hook', title: 'Write the hook', description: 'The line people will sing back.' },
  { key: 'idea_demo', title: 'Record a demo', description: 'A rough take, even on a phone.' },
  { key: 'idea_session', title: 'Book a session', description: 'Studio, producer and a day.' },
  { key: 'idea_kind', title: 'Decide what it is', description: 'A single, an EP or an album.' },
];

const DEFAULT_LIMIT = 4;

function normalize(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function suggestProjectTasks(input: {
  status: RecordStatus;
  songs: ReadonlyArray<{ title: string; stage: SongStage }>;
  /** Titles of the project's tasks, open or done. A job already added is hidden. */
  existingTitles: readonly string[];
  limit?: number;
}): ProjectSuggestion[] {
  const limit = input.limit ?? DEFAULT_LIMIT;
  let list: ProjectSuggestion[];
  if (input.status === 'idea') {
    list = [...IDEA_STAGE_SUGGESTIONS];
  } else if (input.status === 'making') {
    const inProgress = input.songs.filter((song) => song.stage === 'recording' || song.stage === 'mixing');
    const perSong = inProgress.map((song, index) => ({
      key: `finish_${index}_${normalize(song.title).replace(/[^a-z0-9]+/g, '_')}`,
      title: finishTaskTitle(song),
      description: song.stage === 'mixing' ? 'Mix signed off by the artist.' : 'Every part recorded.',
    }));
    const base = PRE_PRODUCTION_TASKS.filter((task) => !(input.songs.length && task.key === 'pp_finish_song'));
    list = [...perSong, ...base];
  } else {
    return [];
  }
  const taken = new Set(input.existingTitles.map(normalize));
  return list.filter((item) => !taken.has(normalize(item.title))).slice(0, Math.max(0, limit));
}
