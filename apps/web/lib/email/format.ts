// Pure text helpers shared by the email templates and by tasks-server. No React
// and no I/O, so importing this never pulls react-email (or react-dom/server)
// into a caller — which is why tasks-server reads its due-date/priority/note
// helpers from here rather than from a template module.
//
// Moved verbatim from lib/email-templates.ts (2026-09; the email-module split).

/** First word of a stored name, when it plausibly reads as one. An email handle
 *  like "lucky.wenapere" or a blank falls back to '' so a greeting degrades to
 *  "Hey," rather than "Hey lucky.wenapere,". */
export function firstNameFrom(value: string): string {
  const first = value.trim().split(/\s+/)[0] || '';
  if (!first || first.includes('@') || first.includes('.') || first.length > 20) return '';
  return first;
}

/** "Fri, Sep 4" from a due_date value, in UTC so a date-only string never
 *  shifts a day. '' when absent or unparseable — the template drops it. */
export function formatDueDateForEmail(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

/** Only the two loud tiers earn a word in an email; everything else is noise a
 *  colleague would not bother writing down. */
export function priorityLabelForEmail(raw: string | null | undefined): string {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'urgent') return 'Urgent';
  if (value === 'high') return 'High priority';
  return '';
}

/** First stretch of a description for an email card's note line: first non-empty
 *  line, capped. '' when there is nothing worth quoting. */
export function noteExcerptForEmail(raw: string | null | undefined, maxLength = 160): string {
  const firstLine =
    String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || '';
  if (!firstLine) return '';
  if (firstLine.length <= maxLength) return firstLine;
  return `${firstLine.slice(0, maxLength - 1).trimEnd()}…`;
}
