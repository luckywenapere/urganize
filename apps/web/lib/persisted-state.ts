type PersistedEnvelope<T> = {
  version: number;
  savedAt: number;
  value: T;
};

const isBrowser = () => typeof window !== 'undefined';

export function readPersistedState<T>(
  key: string,
  version: number,
  isValid: (value: unknown) => value is T,
  maxAgeMs?: number
): T | null {
  if (!isBrowser() || !key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedEnvelope<unknown>>;
    if (parsed.version !== version) return null;
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null;
    if (typeof maxAgeMs === 'number' && maxAgeMs > 0 && Date.now() - parsed.savedAt > maxAgeMs) return null;
    return isValid(parsed.value) ? (parsed.value as T) : null;
  } catch {
    return null;
  }
}

export function writePersistedState<T>(key: string, version: number, value: T) {
  if (!isBrowser() || !key) return;

  const payload: PersistedEnvelope<T> = {
    version,
    savedAt: Date.now(),
    value,
  };

  window.localStorage.setItem(key, JSON.stringify(payload));
}

export function clearPersistedState(key: string) {
  if (!isBrowser() || !key) return;
  window.localStorage.removeItem(key);
}
