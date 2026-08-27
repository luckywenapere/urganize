// Pure types + defaults + validation for the editable notification presets
// (mobile push notifications, 2026-08-10). Deliberately no schema library
// (apps/web has none — zod lives only in apps/homepage) — hand-rolled
// field-by-field validation with default fallback, matching the rest of
// this codebase's style (see lib/asset-constants.ts, lib/tasks.ts).
//
// Presets are stored in the `app_settings` KV table under the key
// 'notification_presets' (lib/notification-presets-server.ts) and edited
// from /admin/notifications. Every consumer (release reminders, weekly
// motivational nudges, deadline-tier copy) reads through
// getNotificationPresets, which falls back to DEFAULT_NOTIFICATION_PRESETS
// when no row exists yet — the feature works with zero admin edits.

export const TITLE_MAX_LENGTH = 80; // matches the admin broadcast route's cap
export const BODY_MAX_LENGTH = 300; // matches the admin broadcast route's cap

export type ReleaseReminderStepPreset = {
  /** Stable id — becomes `release_reminder_${id}` in scheduled_notifications.kind.
   * Changing an existing step's id orphans any already-queued rows using the
   * old id (they still send with their original copy; just don't try to
   * cancel/re-identify them by the new id). Adding/removing steps is safe. */
  id: string;
  delayMinutes: number;
  title: string;
  /** May contain the literal placeholder `{releaseTitle}`. */
  body: string;
};

export type MotivationalNudgePreset = {
  id: string;
  title: string;
  body: string;
};

export type DeadlineTierCopy = {
  title: string;
  /** May contain the literal placeholder `{taskTitle}`. */
  body: string;
};

export type DeadlineTierKind = 'task_due_7d' | 'task_due_3d' | 'task_due_soon';

/** Copy for "a collaborator just sent their credits" (2026-08-27). Unlike the
 * three categories above, this one is EVENT-DRIVEN rather than scheduled: it
 * fires inline from the public credits form, so there is no step list and no
 * pool, just one title and body. */
export type CreditSubmissionCopy = {
  /** May contain `{releaseTitle}`. */
  title: string;
  /** May contain `{collaboratorName}` and `{releaseTitle}`. */
  body: string;
};

export type NotificationPresets = {
  releaseReminders: {
    enabled: boolean;
    steps: ReleaseReminderStepPreset[];
  };
  motivational: {
    enabled: boolean;
    pool: MotivationalNudgePreset[];
  };
  deadlineReminders: {
    enabled: boolean;
    copy: Record<DeadlineTierKind, DeadlineTierCopy>;
  };
  creditSubmissions: {
    enabled: boolean;
    copy: CreditSubmissionCopy;
  };
};

export const DEFAULT_NOTIFICATION_PRESETS: NotificationPresets = {
  releaseReminders: {
    enabled: true,
    steps: [
      {
        id: '1d',
        delayMinutes: 24 * 60,
        title: 'Your release is waiting',
        body: '“{releaseTitle}” could use some attention — pick one activity and push it forward.',
      },
      {
        id: '3d',
        delayMinutes: 3 * 24 * 60,
        title: 'Still on the clock',
        body: '“{releaseTitle}” hasn’t moved in a few days. Open Urganize and knock one thing out.',
      },
    ],
  },
  motivational: {
    enabled: true,
    pool: [
      {
        id: 'momentum',
        title: 'Keep the momentum going',
        body: 'Great releases are built one activity at a time. What can you finish today?',
      },
      {
        id: 'consistency',
        title: 'Small steps, real progress',
        body: 'A few minutes in Urganize today keeps your rollout on schedule. Take a look.',
      },
      {
        id: 'focus',
        title: 'One thing at a time',
        body: 'Pick the next activity on your list and give it five minutes. That’s how releases ship.',
      },
      {
        id: 'discipline',
        title: 'Discipline beats motivation',
        body: 'You don’t need to feel ready — just open the app and do the next thing.',
      },
      {
        id: 'teamwork',
        title: 'Your team is counting on you',
        body: 'Check in on your releases — a quick update keeps everyone aligned.',
      },
      {
        id: 'finish-line',
        title: 'Every release has a finish line',
        body: 'You’re closer than you think. See what’s left and keep moving.',
      },
    ],
  },
  deadlineReminders: {
    enabled: true,
    copy: {
      task_due_7d: {
        title: 'An activity is due in 7 days',
        body: '{taskTitle} is due in a week. Plenty of time — get ahead of it.',
      },
      task_due_3d: {
        title: 'An activity is due in 3 days',
        body: '{taskTitle} is due in 3 days. Worth putting on today’s list.',
      },
      task_due_soon: {
        title: 'An activity is due tomorrow',
        body: '{taskTitle} is due within 24 hours.',
      },
    },
  },
  creditSubmissions: {
    enabled: true,
    copy: {
      title: 'New credits for “{releaseTitle}”',
      body: '{collaboratorName} sent their details. Tap to see what they filled in.',
    },
  },
};

function clampString(value: unknown, maxLength: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeDelayMinutes(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeReleaseReminderStep(
  raw: unknown,
  fallback: ReleaseReminderStepPreset
): ReleaseReminderStepPreset {
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Partial<ReleaseReminderStepPreset>;
  return {
    id: clampString(value.id, 40, fallback.id),
    delayMinutes: normalizeDelayMinutes(value.delayMinutes, fallback.delayMinutes),
    title: clampString(value.title, TITLE_MAX_LENGTH, fallback.title),
    body: clampString(value.body, BODY_MAX_LENGTH, fallback.body),
  };
}

function normalizeMotivationalPreset(
  raw: unknown,
  fallback: MotivationalNudgePreset
): MotivationalNudgePreset {
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Partial<MotivationalNudgePreset>;
  return {
    id: clampString(value.id, 40, fallback.id),
    title: clampString(value.title, TITLE_MAX_LENGTH, fallback.title),
    body: clampString(value.body, BODY_MAX_LENGTH, fallback.body),
  };
}

function normalizeDeadlineTierCopy(raw: unknown, fallback: DeadlineTierCopy): DeadlineTierCopy {
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Partial<DeadlineTierCopy>;
  return {
    title: clampString(value.title, TITLE_MAX_LENGTH, fallback.title),
    body: clampString(value.body, BODY_MAX_LENGTH, fallback.body),
  };
}

/** The credit-submission copy has the same two fields as a deadline tier, so it
 * reuses that normalizer rather than adding a byte-identical second one. */
const normalizeCreditSubmissionCopy = normalizeDeadlineTierCopy;

/** Validates an unknown value (typically app_settings.value_json) into a
 * complete NotificationPresets, filling every missing or malformed field
 * from DEFAULT_NOTIFICATION_PRESETS. Never throws. Garbage input (wrong
 * type, empty object, `null`) safely produces the full defaults. */
export function normalizeNotificationPresets(raw: unknown): NotificationPresets {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const releaseRemindersSource =
    source.releaseReminders && typeof source.releaseReminders === 'object'
      ? (source.releaseReminders as Record<string, unknown>)
      : {};
  const rawSteps = Array.isArray(releaseRemindersSource.steps) ? releaseRemindersSource.steps : null;
  const steps = rawSteps
    ? rawSteps
        .map((step, index) =>
          normalizeReleaseReminderStep(step, DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps[index] ?? {
            id: `step-${index}`,
            delayMinutes: 24 * 60 * (index + 1),
            title: DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps[0].title,
            body: DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps[0].body,
          })
        )
        .filter((step) => step.id && step.title && step.body)
    : DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps;

  const motivationalSource =
    source.motivational && typeof source.motivational === 'object'
      ? (source.motivational as Record<string, unknown>)
      : {};
  const rawPool = Array.isArray(motivationalSource.pool) ? motivationalSource.pool : null;
  const pool = rawPool
    ? rawPool
        .map((entry, index) =>
          normalizeMotivationalPreset(
            entry,
            DEFAULT_NOTIFICATION_PRESETS.motivational.pool[index] ?? DEFAULT_NOTIFICATION_PRESETS.motivational.pool[0]
          )
        )
        .filter((entry) => entry.id && entry.title && entry.body)
    : DEFAULT_NOTIFICATION_PRESETS.motivational.pool;

  const deadlineSource =
    source.deadlineReminders && typeof source.deadlineReminders === 'object'
      ? (source.deadlineReminders as Record<string, unknown>)
      : {};
  const deadlineCopySource =
    deadlineSource.copy && typeof deadlineSource.copy === 'object'
      ? (deadlineSource.copy as Record<string, unknown>)
      : {};

  const creditSubmissionsSource =
    source.creditSubmissions && typeof source.creditSubmissions === 'object'
      ? (source.creditSubmissions as Record<string, unknown>)
      : {};

  return {
    releaseReminders: {
      enabled: normalizeBoolean(releaseRemindersSource.enabled, DEFAULT_NOTIFICATION_PRESETS.releaseReminders.enabled),
      steps: steps.length > 0 ? steps : DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps,
    },
    motivational: {
      enabled: normalizeBoolean(motivationalSource.enabled, DEFAULT_NOTIFICATION_PRESETS.motivational.enabled),
      pool: pool.length > 0 ? pool : DEFAULT_NOTIFICATION_PRESETS.motivational.pool,
    },
    deadlineReminders: {
      enabled: normalizeBoolean(deadlineSource.enabled, DEFAULT_NOTIFICATION_PRESETS.deadlineReminders.enabled),
      copy: {
        task_due_7d: normalizeDeadlineTierCopy(
          deadlineCopySource.task_due_7d,
          DEFAULT_NOTIFICATION_PRESETS.deadlineReminders.copy.task_due_7d
        ),
        task_due_3d: normalizeDeadlineTierCopy(
          deadlineCopySource.task_due_3d,
          DEFAULT_NOTIFICATION_PRESETS.deadlineReminders.copy.task_due_3d
        ),
        task_due_soon: normalizeDeadlineTierCopy(
          deadlineCopySource.task_due_soon,
          DEFAULT_NOTIFICATION_PRESETS.deadlineReminders.copy.task_due_soon
        ),
      },
    },
    creditSubmissions: {
      enabled: normalizeBoolean(
        creditSubmissionsSource.enabled,
        DEFAULT_NOTIFICATION_PRESETS.creditSubmissions.enabled
      ),
      copy: normalizeCreditSubmissionCopy(
        creditSubmissionsSource.copy,
        DEFAULT_NOTIFICATION_PRESETS.creditSubmissions.copy
      ),
    },
  };
}
