/**
 * Shared types, validation, and prompt construction for the AI rollout planner
 * (Phase 5). Client-safe (no node imports) so the modal can import the option
 * constants and types while the API route imports the prompt builder and
 * validators.
 *
 * Note: `apps/web/lib/release-templates/types.ts` has a differently-shaped
 * `ReleaseContext` (the older, unbuilt tailoring-input sketch). This module's
 * `ReleaseContext` is the authoritative Phase 5 shape — see the migration
 * 20260527_release_context_and_tailoring.sql. The template-module type should
 * be reconciled/removed in a follow-up.
 *
 * @see CLAUDE.md "v1 scope" item 2 and the "templates carry domain knowledge,
 *   AI is a removable polish layer" principle.
 */

export type ArtistScale = 'emerging' | 'established' | 'major';
export type MarketingBudget = 'none' | 'small' | 'standard' | 'large';
export type DistributorType = 'self_release' | 'indie_distributor' | 'major_label';

export type ReleaseContext = {
  artist_scale: ArtistScale;
  marketing_budget: MarketingBudget;
  distributor_type: DistributorType;
  target_audience?: string;
  special_considerations?: string;
};

export type TailoringResponse = {
  remove_task_ids: string[];
  modify_tasks: Array<{ id: string; new_description: string }>;
  rationale: string;
};

export type TailorableTask = {
  id: string;
  title: string;
  description: string;
  optional: boolean;
  tags: string[];
  template_task_id: string;
};

export const ARTIST_SCALE_OPTIONS: Array<{ value: ArtistScale; label: string }> = [
  { value: 'emerging', label: 'Emerging' },
  { value: 'established', label: 'Established' },
  { value: 'major', label: 'Major' },
];

export const MARKETING_BUDGET_OPTIONS: Array<{ value: MarketingBudget; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'small', label: 'Small' },
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
];

export const DISTRIBUTOR_TYPE_OPTIONS: Array<{ value: DistributorType; label: string }> = [
  { value: 'self_release', label: 'Self-release' },
  { value: 'indie_distributor', label: 'Indie distributor' },
  { value: 'major_label', label: 'Major label' },
];

const ARTIST_SCALES = ARTIST_SCALE_OPTIONS.map((o) => o.value);
const MARKETING_BUDGETS = MARKETING_BUDGET_OPTIONS.map((o) => o.value);
const DISTRIBUTOR_TYPES = DISTRIBUTOR_TYPE_OPTIONS.map((o) => o.value);

const TARGET_AUDIENCE_MAX = 400;
const SPECIAL_CONSIDERATIONS_MAX = 600;

/**
 * Validate (and normalize) a release context from an untrusted source (request
 * body). Returns the normalized context or an error message. Free-text fields
 * are trimmed and length-capped.
 */
export function parseReleaseContext(
  value: unknown
): { ok: true; context: ReleaseContext } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'context must be an object.' };
  }
  const record = value as Record<string, unknown>;

  if (!ARTIST_SCALES.includes(record.artist_scale as ArtistScale)) {
    return { ok: false, error: `artist_scale must be one of: ${ARTIST_SCALES.join(', ')}.` };
  }
  if (!MARKETING_BUDGETS.includes(record.marketing_budget as MarketingBudget)) {
    return { ok: false, error: `marketing_budget must be one of: ${MARKETING_BUDGETS.join(', ')}.` };
  }
  if (!DISTRIBUTOR_TYPES.includes(record.distributor_type as DistributorType)) {
    return { ok: false, error: `distributor_type must be one of: ${DISTRIBUTOR_TYPES.join(', ')}.` };
  }

  const context: ReleaseContext = {
    artist_scale: record.artist_scale as ArtistScale,
    marketing_budget: record.marketing_budget as MarketingBudget,
    distributor_type: record.distributor_type as DistributorType,
  };

  if (typeof record.target_audience === 'string' && record.target_audience.trim()) {
    context.target_audience = record.target_audience.trim().slice(0, TARGET_AUDIENCE_MAX);
  }
  if (typeof record.special_considerations === 'string' && record.special_considerations.trim()) {
    context.special_considerations = record.special_considerations
      .trim()
      .slice(0, SPECIAL_CONSIDERATIONS_MAX);
  }

  return { ok: true, context };
}

/**
 * Parse the raw model output into a TailoringResponse. Shape-only validation
 * (does not check that ids reference real tasks — that's
 * validateTailoringAgainstTasks). Returns null on any structural problem so
 * the provider treats it as a malformed response.
 */
export function parseTailoringResponse(raw: string): TailoringResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;

  if (!Array.isArray(record.remove_task_ids)) return null;
  const removeIds = record.remove_task_ids;
  if (!removeIds.every((id) => typeof id === 'string')) return null;

  if (!Array.isArray(record.modify_tasks)) return null;
  const modifyTasks: Array<{ id: string; new_description: string }> = [];
  for (const entry of record.modify_tasks) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.new_description !== 'string') return null;
    if (!e.new_description.trim()) return null;
    modifyTasks.push({ id: e.id, new_description: e.new_description.trim() });
  }

  const rationale = typeof record.rationale === 'string' ? record.rationale.trim() : '';

  return {
    remove_task_ids: removeIds as string[],
    modify_tasks: modifyTasks,
    rationale,
  };
}

/**
 * Confirm the model only referenced tasks that actually exist on this release,
 * and only flagged optional tasks for removal. This is the hard correctness
 * gate — if the model fabricated an id or tried to remove a required task,
 * reject the whole response and make no changes.
 */
export function validateTailoringAgainstTasks(
  response: TailoringResponse,
  tasks: TailorableTask[]
): { ok: true } | { ok: false; error: string } {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const id of response.remove_task_ids) {
    const task = byId.get(id);
    if (!task) {
      return { ok: false, error: `remove_task_ids references unknown task: ${id}` };
    }
    if (!task.optional) {
      return { ok: false, error: `remove_task_ids references a required (non-optional) task: ${id}` };
    }
  }

  for (const mod of response.modify_tasks) {
    if (!byId.has(mod.id)) {
      return { ok: false, error: `modify_tasks references unknown task: ${mod.id}` };
    }
  }

  return { ok: true };
}

const CONTEXT_LABELS = {
  artist_scale: Object.fromEntries(ARTIST_SCALE_OPTIONS.map((o) => [o.value, o.label])),
  marketing_budget: Object.fromEntries(MARKETING_BUDGET_OPTIONS.map((o) => [o.value, o.label])),
  distributor_type: Object.fromEntries(DISTRIBUTOR_TYPE_OPTIONS.map((o) => [o.value, o.label])),
};

/**
 * Build the system + user messages for the tailoring call. The model is told
 * to remove only optional tasks and to return JSON matching the schema. The
 * full task list (with ids, optional flags, tags) is embedded so the model
 * references real ids.
 */
export function buildTailoringMessages(params: {
  release: { title: string; artistName: string; releaseDate: string | null; releaseType: string };
  context: ReleaseContext;
  tasks: TailorableTask[];
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { release, context, tasks } = params;

  const system = [
    'You are tailoring a music release rollout plan for a specific release. The plan was generated from a hand-crafted template; your job is to remove tasks that do not apply to this release\'s context and optionally adjust the cadence wording of post-release content tasks.',
    '',
    'Rules:',
    '- Only remove a task when its "optional" field is true. NEVER remove a task whose "optional" is false.',
    '- Be conservative: when in doubt, keep the task.',
    '- You may rewrite the description of post-release content tasks (the "Week +1/+2/+3" follow-up content tasks) to specify a realistic cadence given the artist scale and budget — e.g., weekly rather than daily for an emerging artist with a small or no budget. Do not change task titles.',
    '- remove_task_ids and modify_tasks[].id MUST be ids drawn verbatim from the provided task list. Never invent ids.',
    '- Return ONLY valid JSON matching the schema below. No prose, no markdown, no text outside the JSON object.',
    '',
    'Output schema:',
    '{',
    '  "remove_task_ids": ["<task id>", ...],',
    '  "modify_tasks": [{ "id": "<task id>", "new_description": "<rewritten description>" }],',
    '  "rationale": "<2-3 sentence explanation for the manager>"',
    '}',
  ].join('\n');

  const guidance = [
    'Guidance for common cases:',
    '- marketing_budget "none": remove optional paid-promotion / ads tasks.',
    '- distributor_type "self_release": remove optional tasks that assume a distributor relationship (e.g., confirming a distributor accepted the submission, distributor-contact coordination).',
    '- artist_scale "emerging" with "none"/"small" budget: rewrite the post-release content tasks to a weekly cadence instead of daily.',
    '- artist_scale "major" or budget "large": keep promotional and PR tasks.',
  ].join('\n');

  const taskListJson = JSON.stringify(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      optional: t.optional,
      tags: t.tags,
    })),
    null,
    2
  );

  const user = [
    'Release:',
    `- Title: ${release.title}`,
    `- Artist: ${release.artistName}`,
    `- Release date: ${release.releaseDate || 'not set'}`,
    `- Type: ${release.releaseType}`,
    '',
    'Manager context:',
    `- Artist scale: ${CONTEXT_LABELS.artist_scale[context.artist_scale] || context.artist_scale}`,
    `- Marketing budget: ${CONTEXT_LABELS.marketing_budget[context.marketing_budget] || context.marketing_budget}`,
    `- Distributor type: ${CONTEXT_LABELS.distributor_type[context.distributor_type] || context.distributor_type}`,
    `- Target audience: ${context.target_audience || 'not specified'}`,
    `- Special considerations: ${context.special_considerations || 'none'}`,
    '',
    guidance,
    '',
    'Current tasks (only these ids may appear in your response):',
    taskListJson,
    '',
    'Return the JSON now.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
