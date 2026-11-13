// Customise Home (#1254): while the editor is open, pressing Home in the top
// menu saves the layout, the same as Done. The editor holds its draft in its
// own state, and the top menu sits far away from it, so the editor registers
// its save here and the menu asks for it. Nothing is registered unless the
// editor is on screen, so everywhere else the Home link is a plain link.

type Save = () => void;

let current: Save | null = null;

/** Called by the open editor. Returns the function that takes it back out. */
export function registerHomeEditSave(save: Save): () => void {
  current = save;
  return () => {
    // A newer editor may have registered since; only remove our own.
    if (current === save) current = null;
  };
}

/** Saves the open editor's layout. False when no editor is open. */
export function saveHomeEdit(): boolean {
  if (!current) return false;
  current();
  return true;
}
