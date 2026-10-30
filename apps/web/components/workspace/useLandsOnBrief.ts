'use client';

import { onlyPreProductionWork } from '@/lib/pre-production';
import { useTaskStore } from '@/stores/useTaskStore';

/**
 * Whether a rollout opens on its brief board (#897, 2026-10-30): once it has a
 * plan. Before that its main view carries the only doors to building one (the
 * planning card, the ideas round), so it keeps landing there. A boolean, so
 * the selector only re-renders when the answer changes.
 */
export function useLandsOnBrief(releaseId: string | null | undefined): boolean {
  return useTaskStore((state) => {
    if (!releaseId) return false;
    const tasks = state.tasks.filter((task) => task.releaseId === releaseId);
    return tasks.length > 0 && !onlyPreProductionWork(tasks);
  });
}
