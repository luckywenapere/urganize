/**
 * Does anything outside the workspace need the task UI engine? (URG-314
 * batch 6, 2026-10-16)
 *
 * TaskUIProvider sits on the shared chain of every route and must not import
 * stores/useTaskStore. On /dashboard and /settings it loads the engine
 * (components/tasks/TaskUIEngine) anyway. Elsewhere it loads it on demand:
 * when something calls useTaskUI(), or when the task store asks for one of the
 * engine's surfaces (the undo toast or a completion sheet) by calling
 * requestTaskUiEngine(). The store does that from a module-scope subscription,
 * so the provider never needs the store itself.
 *
 * Must stay tiny and import nothing: it is on the shared chain.
 */

let requested = false;
const listeners = new Set<() => void>();

export function requestTaskUiEngine(): void {
  if (requested) return;
  requested = true;
  for (const listener of listeners) listener();
}

export function isTaskUiEngineRequested(): boolean {
  return requested;
}

export function subscribeTaskUiEngineRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
