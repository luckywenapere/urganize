// Whether a key press on a clickable ROW should activate the row itself.
//
// A row that is a `role="button"` and also contains real buttons (the
// completion checkbox, a menu) receives every key press its children get,
// because keydown bubbles. Without this check Enter or Space on the checkbox
// is caught by the row, cancelled with preventDefault and turned into "open
// the task", so a keyboard user can never tick an activity from the list.
export function shouldActivateRow(event: {
  key: string;
  target: unknown;
  currentTarget: unknown;
}): boolean {
  if (event.key !== 'Enter' && event.key !== ' ') return false;
  return event.target === event.currentTarget;
}
