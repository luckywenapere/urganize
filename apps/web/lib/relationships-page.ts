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

// ── My People (URG-306) ─────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/**
 * Quiet: nobody on the team has been in touch for this long. The one place the
 * threshold lives (six weeks, founder mock 2026-10-15); tune it here.
 */
export const QUIET_DAYS = 42;

type Contactable = { lastContactAt: string | null; createdAt: string };

/**
 * When the team was last in touch. Somebody never contacted counts from when
 * they were added, so a person added today is not already Quiet. Null only
 * when neither date can be read.
 */
export function lastTouch(person: Contactable): number | null {
  for (const value of [person.lastContactAt, person.createdAt]) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return null;
}

/** No contact in QUIET_DAYS (or ever readable). Surfacing somebody is the safe way to be wrong. */
export function isQuiet(person: Contactable, now: Date = new Date(), days: number = QUIET_DAYS): boolean {
  const time = lastTouch(person);
  if (time === null) return true;
  return now.getTime() - time >= days * DAY_MS;
}

/** "today", "3d", "2w", "7w", "3mo", "2y": the compact time since, as the mock shows it. */
export function timeSince(iso: string | number | null, now: Date = new Date()): string {
  if (iso === null || iso === '') return '';
  const time = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const days = Math.floor((now.getTime() - time) / DAY_MS);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/**
 * The list order: Quiet people first, longest silence at the top, then
 * everybody else, most recent contact first (founder mock, 2026-10-15).
 */
export function sortByLastContact<T extends Contactable>(items: T[], now: Date = new Date()): T[] {
  const touch = (item: T) => lastTouch(item) ?? 0;
  const quiet = items.filter((item) => isQuiet(item, now)).sort((a, b) => touch(a) - touch(b));
  const recent = items.filter((item) => !isQuiet(item, now)).sort((a, b) => touch(b) - touch(a));
  return [...quiet, ...recent];
}

/** "Producer · Eko Sound", either half alone, or nothing. */
export const roleLine = (person: { role: string; company?: string }): string =>
  [person.role.trim(), (person.company ?? '').trim()].filter(Boolean).join(' · ');

/** WhatsApp wants digits only: "+234 803..." is "234803...". */
export const whatsappHref = (phone: string): string => `https://wa.me/${phone.replace(/\D/g, '')}`;
