export type ReleaseTaskPlanTask = {
  title: string;
  description: string;
  phase: string;
  priority: 'High' | 'Medium' | 'Low';
  recommended_timing: string;
};

export type ReleaseTaskPlan = {
  plan_title: string;
  plan_summary: string;
  tasks: ReleaseTaskPlanTask[];
};

export type ReleaseTaskPlanResponse = {
  planTitle: string;
  planSummary: string;
  tasks: Array<{
    title: string;
    description: string;
    phase: string;
    priority: 'High' | 'Medium' | 'Low';
    recommendedTiming: string;
  }>;
};

const TOP_LEVEL_KEYS = ['plan_title', 'plan_summary', 'tasks'] as const;
const TASK_KEYS = ['title', 'description', 'phase', 'priority', 'recommended_timing'] as const;
const PRIORITY_VALUES = new Set<ReleaseTaskPlanTask['priority']>(['High', 'Medium', 'Low']);

const isStringRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

const parseString = (value: unknown): string => String(value || '').trim();

const normalizePriority = (value: unknown): ReleaseTaskPlanTask['priority'] | null => {
  const normalized = parseString(value).toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
  return null;
};

const hasExactKeys = (record: Record<string, unknown>, keys: readonly string[]) => {
  const recordKeys = Object.keys(record);
  if (recordKeys.length !== keys.length) return false;
  return recordKeys.every((key) => keys.includes(key));
};

const parseTaskPlanTask = (value: unknown): ReleaseTaskPlanTask | null => {
  if (!isStringRecord(value) || !hasExactKeys(value, TASK_KEYS)) {
    return null;
  }

  const title = parseString(value.title);
  const description = parseString(value.description);
  const phase = parseString(value.phase);
  const priority = normalizePriority(value.priority);
  const recommended_timing = parseString(value.recommended_timing);

  if (!title || !description || !phase || !priority || !recommended_timing) {
    return null;
  }

  return {
    title,
    description,
    phase,
    priority,
    recommended_timing,
  };
};

const parseTaskPlanObject = (value: unknown): ReleaseTaskPlan | null => {
  if (!isStringRecord(value) || !hasExactKeys(value, TOP_LEVEL_KEYS)) {
    return null;
  }

  const plan_title = parseString(value.plan_title);
  const plan_summary = parseString(value.plan_summary);
  const tasks = Array.isArray(value.tasks) ? value.tasks.map(parseTaskPlanTask).filter(Boolean) as ReleaseTaskPlanTask[] : [];

  if (!plan_title || !plan_summary || tasks.length === 0) {
    return null;
  }

  if (!tasks.every((task) => PRIORITY_VALUES.has(task.priority))) {
    return null;
  }

  return {
    plan_title,
    plan_summary,
    tasks,
  };
};

export const extractAiAssistantText = (payload: unknown): string => {
  if (!isStringRecord(payload)) return '';
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text.trim();
  if (typeof payload.response === 'string' && payload.response.trim()) return payload.response.trim();

  const message = isStringRecord(payload.message) ? payload.message : null;
  if (typeof message?.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }

  return '';
};

export const parseReleaseTaskPlan = (raw: string): ReleaseTaskPlan | null => {
  const normalized = parseString(raw);
  if (!normalized) return null;

  const cleaned = normalized
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();

  const parseCandidate = (candidate: string): ReleaseTaskPlan | null => {
    try {
      const firstPass = JSON.parse(candidate) as unknown;
      const parsed = typeof firstPass === 'string' ? JSON.parse(firstPass) : firstPass;
      return parseTaskPlanObject(parsed);
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(cleaned);
  if (direct) return direct;

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return parseCandidate(cleaned.slice(firstBrace, lastBrace + 1));
  }

  return null;
};

export const normalizeReleaseTaskPlanResponse = (plan: ReleaseTaskPlan): ReleaseTaskPlanResponse => ({
  planTitle: plan.plan_title,
  planSummary: plan.plan_summary,
  tasks: plan.tasks.map((task) => ({
    title: task.title,
    description: task.description,
    phase: task.phase,
    priority: task.priority,
    recommendedTiming: task.recommended_timing,
  })),
});
