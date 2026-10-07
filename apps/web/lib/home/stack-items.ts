import { pickFocusTask, withoutTask, type FocusTask } from './focus';
import type {
  HomePitchItem,
  HomePlacements,
  HomeTaskItem,
  HomeWaitingDjLink,
  HomeWaitingTask,
  HomeYourTasks,
} from './types';

/**
 * The items in each of Home's stacked groups, in the order they stack. Pure so
 * the order and the keys can be tested.
 */

/** The tasks stack: the one to do first on top, the rest behind it. */
export type TaskStack = {
  top: FocusTask;
  rest: HomeTaskItem[];
};

export function buildTaskStack(yourTasks: HomeYourTasks): TaskStack | null {
  const top = pickFocusTask(yourTasks);
  if (!top) return null;
  const rest = withoutTask(yourTasks, top.task.id);
  return { top, rest: [...rest.late, ...rest.today, ...rest.week] };
}

export type WaitingItem =
  | { kind: 'task'; key: string; task: HomeWaitingTask }
  | { kind: 'dj'; key: string; link: HomeWaitingDjLink };

/** Late tasks someone else holds, then DJs who have not opened the tracks. */
export function buildWaitingItems(
  tasks: readonly HomeWaitingTask[],
  djLinks: readonly HomeWaitingDjLink[]
): WaitingItem[] {
  return [
    ...tasks.map((task): WaitingItem => ({ kind: 'task', key: `task-${task.id}`, task })),
    ...djLinks.map(
      (link): WaitingItem => ({ kind: 'dj', key: `dj-${link.showId}-${link.recipientId}`, link })
    ),
  ];
}

export type PlacementItem = {
  key: string;
  pitch: HomePitchItem;
  placed: boolean;
};

/** Playlists that added a song first, then the pitches still under review. */
export function buildPlacementItems(placements: HomePlacements): PlacementItem[] {
  return [
    ...placements.placed.map((pitch) => ({ key: pitch.id, pitch, placed: true })),
    ...placements.underReview.map((pitch) => ({ key: pitch.id, pitch, placed: false })),
  ];
}
