// Whether the "Done. How did it go?" check-in is allowed to open.
//
// Always yes since 2026-10-17 (founder call): the "Ask me after tasks" toggle
// left Settings and the check-in is on for everyone. A stored
// profiles.ask_after_tasks = false is ignored on purpose (no outside user ever
// set it); the column is kept, no migration.
//
// Kept as a function, rather than inlined at its call site in useTaskStore,
// so the toggle can come back as a one-line change. It used to read the auth
// store's persisted blob (never importing useAuthStore, to avoid a module
// cycle with useTaskStore); it no longer needs to read anything.

export function readAskAfterTasks(): boolean {
  return true;
}
