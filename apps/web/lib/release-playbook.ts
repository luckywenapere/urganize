export type ReleasePlaybookPhaseKey =
  | 'foundation'
  | 'distribution_prep'
  | 'rollout_prep'
  | 'release_day'
  | 'post_release';

export type ReleasePlaybookTemplateItem = {
  itemKey: string;
  title: string;
};

export type ReleasePlaybookTemplatePhase = {
  key: ReleasePlaybookPhaseKey;
  title: string;
  description: string;
  items: ReleasePlaybookTemplateItem[];
};

export type ReleasePlaybookSnapshotItem = {
  itemKey: string;
  isCompleted: boolean;
  completedAt: string | null;
};

export interface PlaybookStep {
  id: string;
  releaseId: string;
  userId: string;
  phaseKey: ReleasePlaybookPhaseKey;
  templateKey: string | null;
  title: string;
  description: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  isCustom: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type PlaybookStepSeed = {
  phaseKey: ReleasePlaybookPhaseKey;
  templateKey: string | null;
  title: string;
  description: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  isCustom: boolean;
  position: number;
};

export type ReleasePlaybookPhase = {
  key: ReleasePlaybookPhaseKey;
  title: string;
  description: string;
  items: PlaybookStep[];
  completedCount: number;
  totalCount: number;
};

export type ReleasePlaybookState = {
  phases: ReleasePlaybookPhase[];
  steps: PlaybookStep[];
  completedCount: number;
  totalCount: number;
  remainingCount: number;
  completionPercent: number;
};

export const RELEASE_PLAYBOOK_PHASE_ORDER: ReleasePlaybookPhaseKey[] = [
  'foundation',
  'distribution_prep',
  'rollout_prep',
  'release_day',
  'post_release',
];

const buildItemKey = (phaseKey: ReleasePlaybookPhaseKey, itemKey: string) => `${phaseKey}.${itemKey}`;

export const RELEASE_PLAYBOOK_PHASES: ReleasePlaybookTemplatePhase[] = [
  {
    key: 'foundation',
    title: 'Foundation',
    description: 'Lock the essentials before the release starts moving.',
    items: [
      { itemKey: buildItemKey('foundation', 'final_audio_ready'), title: 'Final audio ready' },
      { itemKey: buildItemKey('foundation', 'release_title_confirmed'), title: 'Release title confirmed' },
      { itemKey: buildItemKey('foundation', 'main_collaborators_identified'), title: 'Main collaborators identified' },
      { itemKey: buildItemKey('foundation', 'release_date_selected'), title: 'Release date selected' },
    ],
  },
  {
    key: 'distribution_prep',
    title: 'Distribution Prep',
    description: 'Prepare the release package before sending it to distribution.',
    items: [
      {
        itemKey: buildItemKey('distribution_prep', 'distributor_submission_prepared'),
        title: 'Distributor submission prepared',
      },
      { itemKey: buildItemKey('distribution_prep', 'isrc_captured'), title: 'ISRC captured' },
      { itemKey: buildItemKey('distribution_prep', 'upc_captured'), title: 'UPC captured' },
      {
        itemKey: buildItemKey('distribution_prep', 'release_date_confirmed_with_distributor'),
        title: 'Release date confirmed with distributor',
      },
    ],
  },
  {
    key: 'rollout_prep',
    title: 'Rollout Prep',
    description: 'Get the release assets and communications lined up before the drop.',
    items: [
      {
        itemKey: buildItemKey('rollout_prep', 'announcement_content_prepared'),
        title: 'Announcement content prepared',
      },
      {
        itemKey: buildItemKey('rollout_prep', 'cover_art_assets_resized_for_social'),
        title: 'Cover art assets resized for social',
      },
      { itemKey: buildItemKey('rollout_prep', 'outreach_list_prepared'), title: 'Outreach list prepared' },
    ],
  },
  {
    key: 'release_day',
    title: 'Release Day',
    description: 'Use release day as an execution checklist, not a scramble.',
    items: [
      {
        itemKey: buildItemKey('release_day', 'release_checked_live_on_platforms'),
        title: 'Release checked live on platforms',
      },
      { itemKey: buildItemKey('release_day', 'launch_posts_published'), title: 'Launch posts published' },
      { itemKey: buildItemKey('release_day', 'team_aligned_on_release_push'), title: 'Team aligned on release push' },
      { itemKey: buildItemKey('release_day', 'release_links_shared'), title: 'Release links shared' },
    ],
  },
  {
    key: 'post_release',
    title: 'Post-Release',
    description: 'Close the loop after the release with follow-through and learnings.',
    items: [
      { itemKey: buildItemKey('post_release', 'follow_up_promo_scheduled'), title: 'Follow-up promo scheduled' },
      { itemKey: buildItemKey('post_release', 'performance_reviewed'), title: 'Performance reviewed' },
      { itemKey: buildItemKey('post_release', 'release_assets_archived'), title: 'Release assets archived' },
      {
        itemKey: buildItemKey('post_release', 'notes_captured_for_next_release'),
        title: 'Notes captured for next release',
      },
    ],
  },
];

const TEMPLATE_ITEM_MAP = new Map(
  RELEASE_PLAYBOOK_PHASES.flatMap((phase) =>
    phase.items.map((item) => [
      item.itemKey,
      {
        itemKey: item.itemKey,
        phaseKey: phase.key,
        title: item.title,
      },
    ])
  )
);

const TEMPLATE_ITEM_KEYS = RELEASE_PLAYBOOK_PHASES.flatMap((phase) => phase.items.map((item) => item.itemKey));

const PHASE_META_BY_KEY = new Map(RELEASE_PLAYBOOK_PHASES.map((phase) => [phase.key, phase]));

const getPhaseOrder = (phaseKey: ReleasePlaybookPhaseKey): number => {
  const index = RELEASE_PLAYBOOK_PHASE_ORDER.indexOf(phaseKey);
  return index < 0 ? RELEASE_PLAYBOOK_PHASE_ORDER.length : index;
};

const normalizeCompletedAt = (value: unknown): string | null => {
  const completedAt = String(value || '').trim();
  return completedAt ? completedAt : null;
};

const normalizeNullableString = (value: unknown): string | null => {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
};

export const isReleasePlaybookPhaseKey = (value: string): value is ReleasePlaybookPhaseKey =>
  RELEASE_PLAYBOOK_PHASE_ORDER.includes(value as ReleasePlaybookPhaseKey);

export const parseReleasePlaybookPhaseKey = (value: unknown): ReleasePlaybookPhaseKey | null => {
  const normalized = String(value || '').trim();
  return isReleasePlaybookPhaseKey(normalized) ? normalized : null;
};

export const getReleasePlaybookPhase = (
  phaseKey: ReleasePlaybookPhaseKey
): ReleasePlaybookTemplatePhase => PHASE_META_BY_KEY.get(phaseKey) || RELEASE_PLAYBOOK_PHASES[0];

export const findReleasePlaybookTemplateItem = (itemKey: string) => {
  const normalized = String(itemKey || '').trim();
  return TEMPLATE_ITEM_MAP.get(normalized) || null;
};

export const normalizeReleasePlaybookSnapshot = (value: unknown): ReleasePlaybookSnapshotItem[] => {
  const entries = Array.isArray(value) ? value : [];
  const stateByItemKey = new Map<string, ReleasePlaybookSnapshotItem>();

  for (const entry of entries) {
    const itemKey = String((entry as { itemKey?: unknown } | null)?.itemKey || '').trim();
    if (!TEMPLATE_ITEM_MAP.has(itemKey)) continue;

    stateByItemKey.set(itemKey, {
      itemKey,
      isCompleted: Boolean((entry as { isCompleted?: unknown } | null)?.isCompleted),
      completedAt: normalizeCompletedAt((entry as { completedAt?: unknown } | null)?.completedAt),
    });
  }

  return TEMPLATE_ITEM_KEYS.map((itemKey) => {
    const existing = stateByItemKey.get(itemKey);
    return {
      itemKey,
      isCompleted: existing?.isCompleted || false,
      completedAt: existing?.isCompleted ? existing.completedAt : null,
    };
  });
};

export const buildDefaultPlaybookSeedRows = (snapshotInput?: unknown): PlaybookStepSeed[] => {
  const snapshotItems = normalizeReleasePlaybookSnapshot(snapshotInput);
  const snapshotByItemKey = new Map(snapshotItems.map((item) => [item.itemKey, item]));

  return RELEASE_PLAYBOOK_PHASES.flatMap((phase) =>
    phase.items.map((item, index) => {
      const saved = snapshotByItemKey.get(item.itemKey);
      return {
        phaseKey: phase.key,
        templateKey: item.itemKey,
        title: item.title,
        description: null,
        isCompleted: saved?.isCompleted || false,
        completedAt: saved?.isCompleted ? saved.completedAt : null,
        isCustom: false,
        position: index + 1,
      };
    })
  );
};

const comparePlaybookSteps = (left: PlaybookStep, right: PlaybookStep): number => {
  const phaseDelta = getPhaseOrder(left.phaseKey) - getPhaseOrder(right.phaseKey);
  if (phaseDelta !== 0) return phaseDelta;

  const positionDelta = left.position - right.position;
  if (positionDelta !== 0) return positionDelta;

  const createdDelta = left.createdAt.localeCompare(right.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return left.title.localeCompare(right.title);
};

export const normalizePlaybookSteps = (value: unknown): PlaybookStep[] => {
  const entries = Array.isArray(value) ? value : [];
  const steps: PlaybookStep[] = [];

  for (const entry of entries) {
    const row = (entry || {}) as Record<string, unknown>;
    const phaseKey = parseReleasePlaybookPhaseKey(row.phase_key ?? row.phaseKey);
    const id = String(row.id || '').trim();
    const title = String(row.title || '').trim();

    if (!phaseKey || !id || !title) {
      continue;
    }

    const templateKeyCandidate = String((row.template_key ?? row.templateKey) || '').trim();
    const templateKey = templateKeyCandidate && TEMPLATE_ITEM_MAP.has(templateKeyCandidate) ? templateKeyCandidate : null;
    const rawPosition = Number(row.position ?? 0);

    steps.push({
      id,
      releaseId: String((row.release_id ?? row.releaseId) || '').trim(),
      userId: String((row.user_id ?? row.userId) || '').trim(),
      phaseKey,
      templateKey,
      title,
      description: normalizeNullableString(row.description),
      isCompleted: Boolean(row.is_completed ?? row.isCompleted),
      completedAt: normalizeCompletedAt(row.completed_at ?? row.completedAt),
      isCustom: Boolean(row.is_custom ?? row.isCustom),
      position: Number.isFinite(rawPosition) && rawPosition > 0 ? Math.floor(rawPosition) : 1,
      createdAt: String((row.created_at ?? row.createdAt) || '').trim(),
      updatedAt: String((row.updated_at ?? row.updatedAt) || '').trim(),
    });
  }

  return steps.sort(comparePlaybookSteps);
};

export const buildReleasePlaybookState = (stepsInput?: unknown): ReleasePlaybookState => {
  const steps = normalizePlaybookSteps(stepsInput);

  const phases = RELEASE_PLAYBOOK_PHASES.map((phase) => {
    const items = steps.filter((item) => item.phaseKey === phase.key);
    const completedCount = items.filter((item) => item.isCompleted).length;

    return {
      key: phase.key,
      title: phase.title,
      description: phase.description,
      items,
      completedCount,
      totalCount: items.length,
    };
  });

  const totalCount = steps.length;
  const completedCount = steps.filter((item) => item.isCompleted).length;
  const remainingCount = Math.max(totalCount - completedCount, 0);
  const completionPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return {
    phases,
    steps,
    completedCount,
    totalCount,
    remainingCount,
    completionPercent,
  };
};

export const getNextPlaybookPosition = (stepsInput: unknown, phaseKey: ReleasePlaybookPhaseKey): number => {
  const steps = normalizePlaybookSteps(stepsInput).filter((step) => step.phaseKey === phaseKey);
  const currentMax = steps.reduce((max, step) => Math.max(max, step.position), 0);
  return currentMax + 1;
};

export const buildMissingDefaultPlaybookSeedRows = (stepsInput: unknown): PlaybookStepSeed[] => {
  const steps = normalizePlaybookSteps(stepsInput);
  const existingTemplateKeys = new Set(
    steps.map((step) => step.templateKey).filter((templateKey): templateKey is string => Boolean(templateKey))
  );
  const nextPositionByPhase = new Map<ReleasePlaybookPhaseKey, number>();

  for (const phaseKey of RELEASE_PLAYBOOK_PHASE_ORDER) {
    nextPositionByPhase.set(phaseKey, getNextPlaybookPosition(steps, phaseKey));
  }

  const rows: PlaybookStepSeed[] = [];
  for (const phase of RELEASE_PLAYBOOK_PHASES) {
    for (const item of phase.items) {
      if (existingTemplateKeys.has(item.itemKey)) {
        continue;
      }

      const nextPosition = nextPositionByPhase.get(phase.key) || 1;
      rows.push({
        phaseKey: phase.key,
        templateKey: item.itemKey,
        title: item.title,
        description: null,
        isCompleted: false,
        completedAt: null,
        isCustom: false,
        position: nextPosition,
      });
      nextPositionByPhase.set(phase.key, nextPosition + 1);
    }
  }

  return rows;
};

export const findPlaybookStepByTemplateKey = (
  stepsInput: unknown,
  templateKey: string
): PlaybookStep | null => {
  const normalized = String(templateKey || '').trim();
  if (!normalized) {
    return null;
  }

  return normalizePlaybookSteps(stepsInput).find((step) => step.templateKey === normalized) || null;
};
