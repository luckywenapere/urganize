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

  const result: ReleasePlanResult = {
    summary: parseString(value.summary),
    release_strategy: parseString(value.release_strategy),
    timeline_phases: parseObjectArray(value.timeline_phases, (item) => {
      const phase = parseString(item.phase);
      const window = parseString(item.window);
      const objective = parseString(item.objective);
      if (!phase || !window || !objective) return null;
      return { phase, window, objective };
    }),
    tasks: parseObjectArray(value.tasks, (item) => {
      const title = parseString(item.title);
      const phase = parseString(item.phase);
      const description = parseString(item.description);
      const owner = parseString(item.owner);
      const measurable_outcome = parseString(item.measurable_outcome);
      const priority = parseString(item.priority);
      if (!title || !phase || !description || !owner || !measurable_outcome || !priority) return null;
      return { title, phase, description, owner, measurable_outcome, priority };
    }),
    milestones: parseObjectArray(value.milestones, (item) => {
      const title = parseString(item.title);
      const timing = parseString(item.timing);
      const success_metric = parseString(item.success_metric);
      if (!title || !timing || !success_metric) return null;
      return { title, timing, success_metric };
    }),
    marketing_ideas: parseObjectArray(value.marketing_ideas, (item) => {
      const idea = parseString(item.idea);
      const channel = parseString(item.channel);
      const effort = parseString(item.effort);
      const why_it_fits = parseString(item.why_it_fits);
      if (!idea || !channel || !effort || !why_it_fits) return null;
      return { idea, channel, effort, why_it_fits };
    }),
    audience_profile: {
      summary: parseString(isStringRecord(value.audience_profile) ? value.audience_profile.summary : ''),
      age_range: parseString(isStringRecord(value.audience_profile) ? value.audience_profile.age_range : ''),
      locations: parseString(isStringRecord(value.audience_profile) ? value.audience_profile.locations : ''),
      platforms: parseString(isStringRecord(value.audience_profile) ? value.audience_profile.platforms : ''),
      culture_signals: parseString(isStringRecord(value.audience_profile) ? value.audience_profile.culture_signals : ''),
    },
    playlist_suggestions: parseObjectArray(value.playlist_suggestions, (item) => {
      const playlist_type = parseString(item.playlist_type);
      const rationale = parseString(item.rationale);
      const pitch_angle = parseString(item.pitch_angle);
      if (!playlist_type || !rationale || !pitch_angle) return null;
      return { playlist_type, rationale, pitch_angle };
    }),
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.map(parseString).filter(Boolean) : [],
  };

  const hasCoreContent =
    result.summary ||
    result.release_strategy ||
    result.timeline_phases.length > 0 ||
    result.tasks.length > 0 ||
    result.milestones.length > 0;

  return hasCoreContent ? result : null;
};
