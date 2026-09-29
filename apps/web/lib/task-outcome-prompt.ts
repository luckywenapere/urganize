// Whether the "Done. How did it go?" check-in is allowed to open, read
// straight off the auth store's persisted blob (the lib/scene-memory.ts
// `readSessionUserId` trick) rather than importing useAuthStore.
//
// useTaskStore.completeTask used to read `useAuthStore.getState().user?.
// ask_after_tasks` directly, which meant useTaskStore.ts imported auth-store.ts.
// auth-store.ts's SIGNED_OUT handler now needs to import useTaskStore.ts's own
// resetTaskStore() (the same class of fix already applied to Chappi, Notes,
// Events and the artist roster) — importing back would make a real cycle
// between two module-scope stores. Reading the raw storage entry instead
// removes the only edge going the other way.
//
// "undefined counts as on" is the house rule for this flag (lib/motivation-
// server.ts carries the same line for the server side): a profile that
// predates the column, or one this read simply cannot reach, defaults to
// prompting.

export function readAskAfterTasks(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem('urganize-auth');
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { state?: { user?: { ask_after_tasks?: unknown } } };
    return parsed?.state?.user?.ask_after_tasks !== false;
  } catch {
    return true;
  }
}
