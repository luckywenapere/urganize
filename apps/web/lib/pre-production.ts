/**
 * Pre-production (URG-280, founder-approved 2026-10-16): "Start the next one".
 *
 * The real pain for managers is upstream of release day: sessions,
 * songwriting, mix and master, artwork and the video are run by hand over
 * WhatsApp. Kept lean on purpose (founder call): not a separate product, just
 * a rollout with no release date whose first phase is Pre-production, seeded
 * with these eight activities in the order the work happens. Undated and
 * unassigned: the manager hands each one to a teammate or a freelancer.
 *
 * Seeded with auto_generated = false so the planner (which refuses a rollout
 * that already has generated activities) still builds Pre-release, Release
 * and Post-release on top once a release date is set. Pure: no I/O here.
 */

import { withTaskPhase } from '@/lib/rollout-phases';

export const PRE_PRODUCTION_PLAN = 'pre_production' as const;

export const PRE_PRODUCTION_TEMPLATE_ID = 'pre_production_v1';

export const PRE_PRODUCTION_TASKS: ReadonlyArray<{ key: string; title: string; description: string }> = [
  { key: 'pp_book_sessions', title: 'Book sessions', description: 'Studio, producer and the dates.' },
  { key: 'pp_finish_song', title: 'Finish the song', description: 'Lyrics, structure and the final demo.' },
  { key: 'pp_production', title: 'Production', description: 'The beat and every part recorded.' },
  { key: 'pp_mix', title: 'Mix', description: 'Mix signed off by the artist.' },
  { key: 'pp_master', title: 'Master', description: 'Final master in hand (WAV).' },
  { key: 'pp_artwork', title: 'Artwork', description: 'Cover art, 3000 by 3000.' },
  { key: 'pp_video_shoot', title: 'Shoot the video', description: 'Director, location and the shoot day.' },
  { key: 'pp_final_video', title: 'Final video (MP4) delivered', description: 'Edited, graded and exported.' },
];

export function isPreProductionPlan(value: unknown): value is typeof PRE_PRODUCTION_PLAN {
  return value === PRE_PRODUCTION_PLAN;
}

/** The task rows a new pre-production rollout starts with. */
export function buildPreProductionTaskRows(input: {
  releaseId: string;
  workspaceId: string;
  createdBy: string;
}): Array<Record<string, unknown>> {
  return PRE_PRODUCTION_TASKS.map((task, index) => ({
    release_id: input.releaseId,
    workspace_id: input.workspaceId,
    group_id: null,
    created_by: input.createdBy,
    assigned_to_user_id: null,
    assigned_to: null,
    assigned_collaborator_id: null,
    title: task.title,
    description: task.description,
    status: 'todo',
    priority: 'none',
    state: 'planning',
    position: index,
    auto_generated: false,
    due_date: null,
    dependencies: [],
    metadata: withTaskPhase(
      {
        template: {
          template_id: PRE_PRODUCTION_TEMPLATE_ID,
          template_version: '1.0.0',
          task_id: task.key,
          role: 'manager',
          task_type: 'task',
          duration_days: 1,
          optional: false,
          tags: ['pre_production'],
          compressed_runway: false,
        },
      },
      'pre_production'
    ),
  }));
}

/** True when every activity on the rollout is pre-production work, so the
 * release plan has not been built yet (or there is no work at all). */
export function onlyPreProductionWork(tasks: ReadonlyArray<{ phase?: string | null }>): boolean {
  return tasks.every((task) => task.phase === 'pre_production');
}
