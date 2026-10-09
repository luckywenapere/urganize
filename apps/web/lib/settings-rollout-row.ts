/**
 * The "Created …" label on Settings → Delete rollouts rows (v1.92.2), so two
 * rows that both read "Untitled rollout" can be told apart before one is
 * deleted. Date AND time, because rollouts left behind by an abandoned
 * create are usually made on the same day. Empty string when the timestamp
 * is missing or unreadable, so the row never shows "Invalid Date".
 */
export function formatRolloutCreatedLabel(
  createdAt: string | null | undefined,
  locale?: string,
  timeZone?: string
): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = date.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
  return `Created ${formatted}`;
}
