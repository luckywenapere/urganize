type AnalyticsEventName =
  | 'signup_completed'
  | 'artist_created'
  | 'release_created'
  | 'ai_plan_generated'
  | 'task_completed'
  | 'trial_started'
  | 'trial_converted';

export type AnalyticsEvent = {
  id: string;
  name: AnalyticsEventName;
  userId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
};

const STORAGE_KEY = 'urganize.analytics.events';
const MAX_EVENTS = 400;

export const trackEvent = (
  name: AnalyticsEventName,
  options?: {
    userId?: string | null;
    payload?: Record<string, unknown>;
  }
) => {
  if (typeof window === 'undefined') return;
  const event: AnalyticsEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    userId: options?.userId || null,
    timestamp: new Date().toISOString(),
    payload: options?.payload || {},
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const current = raw ? ((JSON.parse(raw) as AnalyticsEvent[]) || []) : [];
    const next = [...current, event].slice(-MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore analytics persistence failures.
  }
};

export const readTrackedEvents = (): AnalyticsEvent[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AnalyticsEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const clearTrackedEvents = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
};
