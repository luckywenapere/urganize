// The name a composer preview is addressed to (2026-11-12, #1241): the first
// person on the list, so you read the email the way they will. Anything empty,
// too long or odd falls back to the example name the preview always used.

export const PREVIEW_EXAMPLE_NAME = 'Ada';
const MAX_LENGTH = 60;

export function previewRecipientName(raw: unknown): string {
  if (typeof raw !== 'string') return PREVIEW_EXAMPLE_NAME;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name || name.length > MAX_LENGTH || /[<>@\u0000-\u001f]/.test(name)) return PREVIEW_EXAMPLE_NAME;
  return name;
}
