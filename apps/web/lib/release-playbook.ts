export type ReleasePlaybookPhaseKey =
  | 'foundation'
  | 'credits_metadata'
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

export type ReleasePlaybookItem = ReleasePlaybookSnapshotItem & {
  phaseKey: ReleasePlaybookPhaseKey;
  title: string;
};

export type ReleasePlaybookPhase = {
  key: ReleasePlaybookPhaseKey;
  title: string;
  description: string;
  items: ReleasePlaybookItem[];
  completedCount: number;
  totalCount: number;
};

export type ReleasePlaybookState = {
  phases: ReleasePlaybookPhase[];
  completedCount: number;
  totalCount: number;
  remainingCount: number;
  completionPercent: number;
  snapshotItems: ReleasePlaybookSnapshotItem[];
};

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
    key: 'credits_metadata',
    title: 'Credits & Metadata',
    description: 'Make sure credits, artwork, and metadata are organized before delivery.',
    items: [
      { itemKey: buildItemKey('credits_metadata', 'collect_all_collaborator_credits'), title: 'Collect all collaborator credits' },
      { itemKey: buildItemKey('credits_metadata', 'review_metadata'), title: 'Review metadata' },
      { itemKey: buildItemKey('credits_metadata', 'confirm_producer_and_songwriter_credits'), title: 'Confirm producer and songwriter credits' },
      { itemKey: buildItemKey('credits_metadata', 'artwork_ready'), title: 'Artwork ready' },
    ],
  },
  {
    key: 'distribution_prep',
    title: 'Distribution Prep',
    description: 'Prepare the release package before sending it to distribution.',
    items: [
      { itemKey: buildItemKey('distribution_prep', 'distributor_submission_prepared'), title: 'Distributor submission prepared' },
      { itemKey: buildItemKey('distribution_prep', 'isrc_captured'), title: 'ISRC captured' },
      { itemKey: buildItemKey('distribution_prep', 'upc_captured'), title: 'UPC captured' },
      { itemKey: buildItemKey('distribution_prep', 'release_date_confirmed_with_distributor'), title: 'Release date confirmed with distributor' },
    ],
  },
  {
    key: 'rollout_prep',
    title: 'Rollout Prep',
    description: 'Get the release assets and communications lined up before the drop.',
    items: [
      { itemKey: buildItemKey('rollout_prep', 'announcement_content_prepared'), title: 'Announcement content prepared' },
      { itemKey: buildItemKey('rollout_prep', 'cover_art_assets_resized_for_social'), title: 'Cover art assets resized for social' },
      { itemKey: buildItemKey('rollout_prep', 'pre_save_or_pre_release_plan_ready'), title: 'Pre-save or pre-release plan ready' },
      { itemKey: buildItemKey('rollout_prep', 'outreach_list_prepared'), title: 'Outreach list prepared' },
    ],
  },
  {
    key: 'release_day',
    title: 'Release Day',
    description: 'Use release day as an execution checklist, not a scramble.',
    items: [
      { itemKey: buildItemKey('release_day', 'release_checked_live_on_platforms'), title: 'Release checked live on platforms' },
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
      { itemKey: buildItemKey('post_release', 'notes_captured_for_next_release'), title: 'Notes captured for next release' },
    ],
  },
];

const TEMPLATE_ITEM_MAP = new Map(
  RELEASE_PLAYBOOK_PHASES.flatMap((phase) =>
    phase.items.map((item) => [
      item.itemKey,
      {
        phaseKey: phase.key,
        title: item.title,
      },
    ])
  )
);

const TEMPLATE_ITEM_KEYS = RELEASE_PLAYBOOK_PHASES.flatMap((phase) => phase.items.map((item) => item.itemKey));

const normalizeCompletedAt = (value: unknown): string | null => {
  const completedAt = String(value || '').trim();
  return completedAt ? completedAt : null;
};

export const normalizeReleasePlaybookSnapshot = (value: unknown): ReleasePlaybookSnapshotItem[] => {
  const entries = Array.isArray(value) ? value : [];
  const stateByItemKey = new Map<string, ReleasePlaybookSnapshotItem>();

  for (const entry of entries) {
    const itemKey = String((entry as { itemKey?: unknown } | null)?.itemKey || '').trim();
    if (!TEMPLATE_ITEM_MAP.has(itemKey)) continue;

    const previous = stateByItemKey.get(itemKey);
    const nextState: ReleasePlaybookSnapshotItem = {
      itemKey,
      isCompleted: Boolean((entry as { isCompleted?: unknown } | null)?.isCompleted),
      completedAt: normalizeCompletedAt((entry as { completedAt?: unknown } | null)?.completedAt),
    };

    stateByItemKey.set(itemKey, previous ? { ...previous, ...nextState } : nextState);
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

export const buildReleasePlaybookState = (snapshotInput?: unknown): ReleasePlaybookState => {
  const snapshotItems = normalizeReleasePlaybookSnapshot(snapshotInput);

  const phases = RELEASE_PLAYBOOK_PHASES.map((phase) => {
    const items = phase.items.map<ReleasePlaybookItem>((item) => {
      const saved = snapshotItems.find((entry) => entry.itemKey === item.itemKey);
      return {
        itemKey: item.itemKey,
        phaseKey: phase.key,
        title: item.title,
        isCompleted: saved?.isCompleted || false,
        completedAt: saved?.isCompleted ? saved.completedAt : null,
      };
    });

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

  const totalCount = snapshotItems.length;
  const completedCount = snapshotItems.filter((item) => item.isCompleted).length;
  const remainingCount = Math.max(totalCount - completedCount, 0);
  const completionPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return {
    phases,
    completedCount,
    totalCount,
    remainingCount,
    completionPercent,
    snapshotItems,
  };
};

export const updateReleasePlaybookSnapshot = (
  snapshotInput: unknown,
  itemKey: string,
  isCompleted: boolean,
  updatedAt: string
): ReleasePlaybookSnapshotItem[] | null => {
  if (!TEMPLATE_ITEM_MAP.has(itemKey)) return null;

  return normalizeReleasePlaybookSnapshot(snapshotInput).map((item) => {
    if (item.itemKey !== itemKey) return item;

    return {
      itemKey: item.itemKey,
      isCompleted,
      completedAt: isCompleted ? item.completedAt || updatedAt : null,
    };
  });
};

export const playbookSnapshotsMatch = (left: unknown, right: unknown): boolean => {
  return JSON.stringify(normalizeReleasePlaybookSnapshot(left)) === JSON.stringify(normalizeReleasePlaybookSnapshot(right));
};
