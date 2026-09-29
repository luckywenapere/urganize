// Unsaved edits in the settings pop-up (2026-09-29).
//
// Founder call: toggles save the instant they are tapped, but a text field keeps
// an explicit Save, so closing the pop-up half-way through typing a bio is a way
// to lose words. The pop-up therefore asks "Discard changes?" — and only when a
// text field was actually edited and not saved. Switching segments does NOT ask,
// because the segments a person has visited stay mounted and keep their drafts
// until the pop-up closes.
//
// This is the pure half: which fields are unsaved, and what closing should do.
// The store and the hook that sections call live beside the components.

/** Field keys that are edited and not yet saved. Presence means dirty. */
export type DirtyKeys = Readonly<Record<string, true>>;

/**
 * Mark or clear one field. Returns the SAME object when nothing changed so a
 * store can skip the notification: every section reports on every render, and
 * without this each report would wake every subscriber.
 */
export function withDirtyKey(current: DirtyKeys, key: string, dirty: boolean): DirtyKeys {
  const isMarked = Object.prototype.hasOwnProperty.call(current, key);
  if (dirty === isMarked) return current;
  if (dirty) return { ...current, [key]: true };
  const { [key]: _removed, ...rest } = current;
  void _removed;
  return rest;
}

export function hasUnsavedEdits(current: DirtyKeys): boolean {
  return Object.keys(current).length > 0;
}

/** What a request to close should do right now. */
export function decideSettingsClose(current: DirtyKeys): 'close' | 'confirm' {
  return hasUnsavedEdits(current) ? 'confirm' : 'close';
}
