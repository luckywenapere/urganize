// Which open dialog owns Tab right now.
//
// Overlays stack in this app by design: the completion sheet opens over the
// activity pop-up, the quick-create modal can open over the create-rollout
// modal, a confirmation opens over a sheet. If every open dialog trapped Tab
// on its own, two of them would fight: the lower one sees focus outside its
// panel and pulls it back, the upper one pulls it forward again. Only the
// most recently opened dialog may trap. Kept pure (no DOM) so the ordering
// rule can be tested; lib/use-dialog-focus.ts owns the one shared instance.
export type DialogToken = symbol;

export type DialogStack = {
  /** Registers a newly opened dialog and returns its token. */
  open: () => DialogToken;
  /** Removes a dialog wherever it sits (dialogs need not close in order). */
  close: (token: DialogToken) => void;
  /** True when this dialog is the most recently opened one still open. */
  isTop: (token: DialogToken) => boolean;
};

export function createDialogStack(): DialogStack {
  const open: DialogToken[] = [];
  return {
    open() {
      const token = Symbol('dialog');
      open.push(token);
      return token;
    },
    close(token) {
      const index = open.indexOf(token);
      if (index !== -1) open.splice(index, 1);
    },
    isTop(token) {
      return open[open.length - 1] === token;
    },
  };
}
