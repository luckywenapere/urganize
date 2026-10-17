import { parseSearchTerms } from '@/lib/task-search';
import { SETTINGS_SEGMENT_LABELS, type SettingsSegment } from '@/lib/settings-nav';

// "Search settings" (2026-09-29): type what you want to change and jump to the
// segment that holds it. Same job as lib/app-pages.ts's keyword catalog and the
// same reason for keywords over labels — somebody hunting for their card
// details types "invoice", and nothing in Settings is called that.
//
// Pure and in lib/ so the ranking is testable. It reuses task-search's
// `parseSearchTerms` so a query is split the same way everywhere in the app.

export type SettingsSearchEntry = {
  segment: SettingsSegment;
  /** An element id inside the segment to scroll to, or null for the top. */
  section: string | null;
  label: string;
  keywords: readonly string[];
};

const wholeSegment = (
  segment: SettingsSegment,
  keywords: readonly string[]
): SettingsSearchEntry => ({
  segment,
  section: null,
  label: SETTINGS_SEGMENT_LABELS[segment],
  keywords,
});

/**
 * One entry per segment, plus one per section worth jumping straight to. Section
 * ids are the DOM ids the sections carry; an id that is missing on the page just
 * opens the segment at the top, so a stale entry degrades instead of breaking.
 */
export const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = [
  wholeSegment('general', ['profile', 'account', 'you', 'me', 'settings']),
  { segment: 'general', section: 'name', label: 'Name and email', keywords: ['profile', 'details', 'username'] },
  { segment: 'general', section: 'theme', label: 'Theme', keywords: ['appearance', 'dark', 'light', 'mode', 'look'] },
  {
    segment: 'general',
    section: 'view',
    label: 'View',
    keywords: ['menu', 'role', 'persona', 'who are you', 'more', 'tucked', 'hidden'],
  },
  {
    segment: 'general',
    section: 'help',
    label: 'Help and feedback',
    keywords: ['support', 'report', 'bug', 'issue', 'request', 'feedback', 'tour', 'tours', 'guide', 'replay'],
  },

  wholeSegment('notifications', ['alerts', 'push', 'email', 'reminders']),
  {
    segment: 'notifications',
    section: null,
    label: 'Push notifications',
    keywords: ['push', 'alerts', 'device', 'phone'],
  },

  wholeSegment('team', ['people', 'members', 'roster']),
  {
    segment: 'team',
    section: 'teammates',
    label: 'Teammates',
    keywords: ['invite', 'member', 'members', 'seat', 'seats', 'remove', 'people', 'add someone', 'invite link', 'link'],
  },
  // "Team logins" left the index with the feature (hidden Oct 17, 2026). The
  // invite link it shared still lives under Teammates, so its words moved there.

  wholeSegment('artists', ['brand', 'roster']),
  {
    segment: 'artists',
    section: 'team-identity',
    label: 'Team name and logo',
    keywords: ['name', 'logo', 'label', 'picture', 'image'],
  },
  {
    segment: 'artists',
    section: 'artists',
    label: 'Artists',
    keywords: ['roster', 'add artist', 'rename', 'remove artist'],
  },
  {
    segment: 'artists',
    section: 'brand-colors',
    label: 'Brand colors',
    keywords: ['colors', 'colours', 'share images', 'background', 'accent', 'posters'],
  },

  wholeSegment('urgans', ['assistant', 'ai']),
  {
    segment: 'urgans',
    section: 'team-brief',
    label: 'Team brief',
    keywords: ['brief', 'ai', 'context', 'teach', 'how we work', 'vocabulary', 'positioning'],
  },

  wholeSegment('directory', ['find', 'hire', 'listed']),
  {
    segment: 'directory',
    section: 'directory',
    label: 'Your directory profile',
    keywords: ['listed', 'visibility', 'availability', 'roles', 'bio', 'city', 'requests', 'opt in'],
  },

  wholeSegment('billing', ['money', 'pay']),
  {
    segment: 'billing',
    section: null,
    label: 'Plan and trial',
    keywords: [
      'plan',
      'trial',
      'subscription',
      'invoice',
      'payment',
      'card',
      'upgrade',
      'cancel',
      'renew',
      'seats',
    ],
  },

  wholeSegment('connections', ['data', 'apps']),
  {
    segment: 'connections',
    section: 'connected-apps',
    label: 'Connected apps',
    keywords: ['mcp', 'claude', 'chatgpt', 'ai apps', 'disconnect', 'integrations', 'access'],
  },
  {
    segment: 'connections',
    section: 'export',
    label: 'Export your data',
    keywords: ['download', 'csv', 'json', 'backup', 'spreadsheet', 'copy of my data'],
  },

  wholeSegment('security', ['account']),

  wholeSegment('admin', ['internal', 'teams', 'growth', 'metrics', 'waitlist', 'emails', 'dashboard']),
  {
    segment: 'security',
    section: 'password',
    label: 'Password',
    keywords: ['change password', 'sign in', 'login', 'credentials', 'reset'],
  },
  {
    segment: 'security',
    section: 'delete-rollouts',
    label: 'Delete rollouts',
    keywords: ['delete', 'remove', 'release', 'releases', 'danger'],
  },
  {
    segment: 'security',
    section: 'delete-account',
    label: 'Delete account',
    keywords: ['delete', 'close account', 'remove account', 'danger', 'erase'],
  },
];

/** A phone-sized result list. The whole index is ~30 entries, so a handful is a
 *  sign the query is too loose, and the row says so by simply being short. */
export const SETTINGS_SEARCH_LIMIT = 8;

export type SettingsSearchResult = {
  segment: SettingsSegment;
  section: string | null;
  label: string;
  /** The segment's own name, shown beside the label so a result says where it lives. */
  segmentLabel: string;
};

/**
 * Rank for one entry, or null when it does not match. Lower ranks first:
 *
 *   0  the label starts with what was typed — the "I know its name" case
 *   1  every term is somewhere in the label
 *   2  every term is somewhere in label + segment name + keywords
 *
 * A keyword hit ranks last so a passing mention never outranks a name.
 */
function rankEntry(entry: SettingsSearchEntry, terms: string[], joined: string): 0 | 1 | 2 | null {
  const label = entry.label.toLowerCase();
  if (label.startsWith(joined)) return 0;
  if (terms.every((term) => label.includes(term))) return 1;
  const haystack = `${label} ${SETTINGS_SEGMENT_LABELS[entry.segment].toLowerCase()} ${entry.keywords
    .join(' ')
    .toLowerCase()}`;
  if (terms.every((term) => haystack.includes(term))) return 2;
  return null;
}

/**
 * Empty in, empty out: an empty query is "not a search", and the caller shows
 * the normal segment list instead (the opposite of `searchReleases`, which is a
 * filter over a list already on screen — this is a palette that appears on
 * demand).
 */
export function searchSettings(
  query: string,
  visible: readonly SettingsSegment[]
): SettingsSearchResult[] {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return [];
  const joined = terms.join(' ');

  const ranked: Array<{ entry: SettingsSearchEntry; rank: number; order: number }> = [];
  SETTINGS_SEARCH_ENTRIES.forEach((entry, order) => {
    if (!visible.includes(entry.segment)) return;
    const rank = rankEntry(entry, terms, joined);
    if (rank !== null) ranked.push({ entry, rank, order });
  });

  // Ties keep the order the index is written in, which follows the nav's own.
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);

  return ranked.slice(0, SETTINGS_SEARCH_LIMIT).map(({ entry }) => ({
    segment: entry.segment,
    section: entry.section,
    label: entry.label,
    segmentLabel: SETTINGS_SEGMENT_LABELS[entry.segment],
  }));
}
