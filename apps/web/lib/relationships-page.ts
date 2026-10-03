// Small pure helpers for the Relationships pages, kept out of the components so
// they can be tested. Filtering lives in lib/relationships-filter.ts.

/** The pages need both flags, the way the artist pages do: the team is resolved
 *  through the workspace, so without that flag there is no team to read. */
export const isRelationshipsPageEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_RELATIONSHIPS === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export const RELATIONSHIPS_HREF = '/dashboard/relationships';

export const relationshipHref = (personId: string): string =>
  `${RELATIONSHIPS_HREF}/${encodeURIComponent(personId)}`;

/** "Never", "Today", "3 days ago", "2 months ago". Plain words, no dates to parse. */
export function describeLastContact(lastContactAt: string | null, now: Date = new Date()): string {
  if (!lastContactAt) return 'Not contacted yet';
  const time = new Date(lastContactAt).getTime();
  if (Number.isNaN(time)) return 'Not contacted yet';
  const days = Math.floor((now.getTime() - time) / 86_400_000);
  if (days <= 0) return 'Contacted today';
  if (days === 1) return 'Contacted yesterday';
  if (days < 60) return `Contacted ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 24) return `Contacted ${months} months ago`;
  return `Contacted ${Math.floor(months / 12)} years ago`;
}

/** Comma or newline separated text into tags, trimmed, lowercased, deduped. */
export function parseTagInput(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}
