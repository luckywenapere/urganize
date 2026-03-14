export type ReleasePlanTimelinePhase = {
  phase: string;
  window: string;
  objective: string;
};

export type ReleasePlanTask = {
  title: string;
  phase: string;
  description: string;
  owner: string;
  measurable_outcome: string;
  priority: string;
};

export type ReleasePlanMilestone = {
  title: string;
  timing: string;
  success_metric: string;
};

export type ReleasePlanMarketingIdea = {
  idea: string;
  channel: string;
  effort: string;
  why_it_fits: string;
};

export type ReleasePlanAudienceProfile = {
  summary: string;
  age_range: string;
  locations: string;
  platforms: string;
  culture_signals: string;
};

export type ReleasePlanPlaylistSuggestion = {
  playlist_type: string;
  rationale: string;
  pitch_angle: string;
};

export type ReleasePlanResult = {
  summary: string;
  release_strategy: string;
  timeline_phases: ReleasePlanTimelinePhase[];
  tasks: ReleasePlanTask[];
  milestones: ReleasePlanMilestone[];
  marketing_ideas: ReleasePlanMarketingIdea[];
  audience_profile: ReleasePlanAudienceProfile;
  playlist_suggestions: ReleasePlanPlaylistSuggestion[];
  assumptions: string[];
};

const isStringRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

const parseString = (value: unknown): string => String(value || '').trim();

const pickValue = (record: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return '';
};

const parseJoinedString = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map(parseString).filter(Boolean).join(', ');
  }

  return parseString(value);
};

const parseObjectArray = <T>(
  value: unknown,
  map: (item: Record<string, unknown>) => T | null
): T[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (isStringRecord(item) ? map(item) : null))
    .filter((item): item is T => item !== null);
};

export const parseReleasePlanResult = (value: unknown): ReleasePlanResult | null => {
  if (!isStringRecord(value)) return null;
  const audienceProfileValue = pickValue(value, ['audience_profile', 'audienceProfile']);
  const audienceProfile = isStringRecord(audienceProfileValue) ? audienceProfileValue : null;

  const result: ReleasePlanResult = {
    summary: parseString(pickValue(value, ['summary', 'plan_summary', 'overview'])),
    release_strategy: parseString(pickValue(value, ['release_strategy', 'releaseStrategy', 'strategy'])),
    timeline_phases: parseObjectArray(pickValue(value, ['timeline_phases', 'timelinePhases', 'timeline']), (item) => {
      const phase = parseString(pickValue(item, ['phase', 'title', 'name']));
      const window = parseString(pickValue(item, ['window', 'timing', 'period']));
      const objective = parseString(pickValue(item, ['objective', 'goal', 'focus']));
      if (!phase || !window || !objective) return null;
      return { phase, window, objective };
    }),
    tasks: parseObjectArray(pickValue(value, ['tasks', 'action_items', 'actions']), (item) => {
      const title = parseString(pickValue(item, ['title', 'task', 'name']));
      const phase = parseString(pickValue(item, ['phase', 'stage'])) || 'Plan';
      const description = parseString(pickValue(item, ['description', 'details', 'action']));
      const owner = parseString(pickValue(item, ['owner', 'assignee', 'assigned_to'])) || 'Team';
      const measurable_outcome =
        parseString(pickValue(item, ['measurable_outcome', 'measurableOutcome', 'outcome', 'success_metric'])) ||
        'Task completed and ready for review.';
      const priority = parseString(pickValue(item, ['priority', 'importance'])) || 'Medium';
      if (!title || !description) return null;
      return { title, phase, description, owner, measurable_outcome, priority };
    }),
    milestones: parseObjectArray(pickValue(value, ['milestones', 'checkpoints']), (item) => {
      const title = parseString(pickValue(item, ['title', 'milestone', 'name']));
      const timing = parseString(pickValue(item, ['timing', 'window', 'when']));
      const success_metric = parseString(pickValue(item, ['success_metric', 'successMetric', 'metric']));
      if (!title || !timing || !success_metric) return null;
      return { title, timing, success_metric };
    }),
    marketing_ideas: parseObjectArray(pickValue(value, ['marketing_ideas', 'marketingIdeas', 'content_ideas']), (item) => {
      const idea = parseString(pickValue(item, ['idea', 'title', 'concept']));
      const channel = parseString(pickValue(item, ['channel', 'platform']));
      const effort = parseString(pickValue(item, ['effort', 'format', 'level']));
      const why_it_fits = parseString(pickValue(item, ['why_it_fits', 'whyItFits', 'rationale']));
      if (!idea || !channel || !effort || !why_it_fits) return null;
      return { idea, channel, effort, why_it_fits };
    }),
    audience_profile: {
      summary: parseString(audienceProfile?.summary),
      age_range: parseString(audienceProfile?.age_range ?? audienceProfile?.ageRange),
      locations: parseJoinedString(audienceProfile?.locations),
      platforms: parseJoinedString(audienceProfile?.platforms),
      culture_signals: parseJoinedString(audienceProfile?.culture_signals ?? audienceProfile?.cultureSignals),
    },
    playlist_suggestions: parseObjectArray(
      pickValue(value, ['playlist_suggestions', 'playlistSuggestions', 'playlists']),
      (item) => {
      const playlist_type = parseString(pickValue(item, ['playlist_type', 'playlistType', 'type']));
      const rationale = parseString(pickValue(item, ['rationale', 'reason']));
      const pitch_angle = parseString(pickValue(item, ['pitch_angle', 'pitchAngle', 'angle']));
      if (!playlist_type || !rationale || !pitch_angle) return null;
      return { playlist_type, rationale, pitch_angle };
    }),
    assumptions: Array.isArray(pickValue(value, ['assumptions', 'notes']))
      ? (pickValue(value, ['assumptions', 'notes']) as unknown[]).map(parseString).filter(Boolean)
      : [],
  };

  const hasCoreContent =
    result.summary ||
    result.release_strategy ||
    result.timeline_phases.length > 0 ||
    result.tasks.length > 0 ||
    result.milestones.length > 0;

  return hasCoreContent ? result : null;
};
