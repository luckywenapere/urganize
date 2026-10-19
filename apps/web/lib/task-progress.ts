/**
 * "N of M done" for a set of activities (URG-389, Oct 19, 2026).
 *
 * Cancelled work is out of BOTH numbers: it was dropped, so it is neither done
 * nor still owed. Counting it in the denominator held every rollout with one
 * cancelled activity below 100% forever, and kept "every activity is done"
 * (what decides a rollout reads Released early) from ever being true.
 */
export function countProgress(tasks: ReadonlyArray<{ status: string }>): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const task of tasks) {
    if (task.status === 'cancelled') continue;
    total += 1;
    if (task.status === 'done') done += 1;
  }
  return { done, total };
}
