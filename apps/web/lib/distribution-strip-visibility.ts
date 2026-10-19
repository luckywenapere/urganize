// When the rollout's "check before distribution" strip shows, and what it shows
// (2026-10-09, v1.92.5). Pure logic, kept in lib/ so vitest can hold it (this
// repo has no component tests); WorkspaceView only draws what this returns.
//
// Three answers:
//   - 'none':       not mounted at all. An empty shell (no release day and no
//                   activities, v1.91.1) has nothing to distribute yet, and a
//                   red "Fix these" banner there reads as an error before
//                   anything was done.
//   - 'rejections': a rollout that has come out. The readiness list ("Fix these
//                   before you order distribution" / "Worth a look") is a
//                   BEFORE-release check, so on a Released rollout it read as
//                   if the release had not happened while the header said
//                   Released. Anything the distributor sent back still shows,
//                   because that is not a pre-release check and can still need
//                   acting on.
//   - 'full':       everything else, as before.
//
// A DROPPED PLAN (URG-399, Oct 19, 2026). A rollout whose every activity is
// cancelled reads "All clear" on its timeline (URG-389), and a "Ready to
// distribute 0/7" row above that line contradicted it: nothing is owed, so
// nothing is held back. It gets 'rejections', the Released treatment: the
// readiness list goes, a distributor's answer still shows. `tasksDone` and
// `tasksTotal` already leave cancelled work out (lib/task-progress), so the
// cancelled count comes in on its own. Archived keeps its strip, as below.
//
// "Has come out" is `displayStatus` from lib/catalogue-table, the same derived
// Released the Catalogue row and the focused rollout header show, which is
// itself lib/recap-eligibility's rule. Not a third definition. Archived is not
// Released there (displayStatus checks archived first), so an archived rollout
// keeps exactly the strip it had before.

import { displayStatus } from './catalogue-table';

export type DistributionStripMode = 'none' | 'rejections' | 'full';

export type DistributionStripInput = {
  status: string;
  releaseDate: string | null;
  tasksDone: number;
  tasksTotal: number;
  /** Cancelled activities, which tasksTotal leaves out. Omitted reads as 0. */
  tasksCancelled?: number;
};

/** Every activity was cancelled: there was a plan, and none of it is owed. */
export function isPlanDropped(release: Pick<DistributionStripInput, 'tasksTotal' | 'tasksCancelled'>): boolean {
  return release.tasksTotal === 0 && (release.tasksCancelled ?? 0) > 0;
}

export function distributionStripMode(
  release: DistributionStripInput,
  now: Date = new Date()
): DistributionStripMode {
  const isEmptyShell = !release.releaseDate && release.tasksTotal === 0;
  if (isEmptyShell) return 'none';
  if (release.status !== 'archived' && isPlanDropped(release)) return 'rejections';
  return displayStatus(release, now) === 'released' ? 'rejections' : 'full';
}
