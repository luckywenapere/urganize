import { type DirectoryRole } from './directory-roles';
import type { PersonAvailability } from '@/types/directory';

/**
 * Profile types: which part of a profile LEADS, and what "open to" says.
 *
 * Everyone gets the same profile shape. What differs is the first thing a
 * reader sees, because the readers differ: an artist scanning managers wants
 * releases run, a manager scanning creatives wants delivered credits. Pure and
 * in lib/ so the card, the public page and the editor read one set of rules.
 *
 * A TYPE IS DERIVED, NOT CHOSEN, UNLESS THE OWNER OVERRIDES IT. The directory's
 * sixteen roles are all professions, so nothing derives an artist; that type
 * only ever comes from the override (person_profiles.profile_type).
 */

export const PROFILE_TYPES = ['manager', 'artist', 'creative', 'adjacent'] as const;
export type ProfileType = (typeof PROFILE_TYPES)[number];

export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  manager: 'Manager',
  artist: 'Artist',
  creative: 'Creative',
  adjacent: 'Adjacent pro',
};

export const isProfileType = (value: unknown): value is ProfileType =>
  typeof value === 'string' && (PROFILE_TYPES as readonly string[]).includes(value);

/** Producers, directors, designers, photographers, engineers, writers. */
const CREATIVE_ROLES: readonly DirectoryRole[] = [
  'producer',
  'mix_engineer',
  'master_engineer',
  'songwriter',
  'videographer',
  'video_director',
  'photographer',
  'graphic_designer',
];

/** Curators, publicists, A&R, promoters and the like. */
const ADJACENT_ROLES: readonly DirectoryRole[] = [
  'a_and_r',
  'pr',
  'digital_marketer',
  'playlist_curator',
  'booking_agent',
  'tour_manager',
  'distributor',
];

/**
 * The type the roles imply, or null when there are none.
 *
 * ORDER IS THE RULE: a manager role wins, then a creative one, then an adjacent
 * one. Somebody who manages AND mixes is read as a manager, because that is
 * the question a reader arrives with ("who runs releases?") and the delivered
 * credits are still on the page. Every role is covered by exactly one list, and
 * the test pins it, so a new role cannot silently derive nothing.
 */
export function deriveProfileType(roles: readonly DirectoryRole[]): ProfileType | null {
  if (roles.includes('manager')) return 'manager';
  if (roles.some((role) => CREATIVE_ROLES.includes(role))) return 'creative';
  if (roles.some((role) => ADJACENT_ROLES.includes(role))) return 'adjacent';
  return null;
}

/** The owner's override wins; an unknown stored value is ignored, never shown. */
export function effectiveProfileType(
  override: unknown,
  roles: readonly DirectoryRole[]
): ProfileType | null {
  return isProfileType(override) ? override : deriveProfileType(roles);
}

/** Exposed so the coverage test can check every role lands somewhere. */
export const ROLE_GROUPS = { creative: CREATIVE_ROLES, adjacent: ADJACENT_ROLES } as const;

// ---------------------------------------------------------------------------
// What leads
// ---------------------------------------------------------------------------

/** Counts the lead line reads. Every field defaults to 0, which prints nothing. */
export type LeadStats = {
  rolloutsRun: number;
  artistsManaged: number;
  activeRollouts: number;
  /** An artist's own releases. */
  releases: number;
  /** People on the team around them, themselves included. */
  teamSize: number;
  rolloutsWorkedOn: number;
  shows: number;
};

export const EMPTY_LEAD_STATS: LeadStats = {
  rolloutsRun: 0,
  artistsManaged: 0,
  activeRollouts: 0,
  releases: 0,
  teamSize: 0,
  rolloutsWorkedOn: 0,
  shows: 0,
};

export type LeadItem = { key: string; value: number; label: string };

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The numbers a type leads with, in reading order.
 *
 * A ZERO IS NEVER PRINTED. "0 shows" reads as a verdict on somebody who has
 * simply not used that part of the product, and an invented-looking empty is
 * worse than a shorter line. A creative has no stats here at all: their lead is
 * the delivered credits by role, which the page already renders from the
 * delivery records.
 */
export function leadItems(type: ProfileType | null, stats: LeadStats): LeadItem[] {
  const items: LeadItem[] = [];
  const add = (key: string, value: number, one: string, many: string) => {
    if (value > 0) items.push({ key, value, label: plural(value, one, many) });
  };

  if (type === 'manager') {
    add('rolloutsRun', stats.rolloutsRun, 'rollout run', 'rollouts run');
    add('artistsManaged', stats.artistsManaged, 'artist', 'artists');
    if (stats.activeRollouts > 0) {
      items.push({
        key: 'activeRollouts',
        value: stats.activeRollouts,
        label: `${stats.activeRollouts} still active`,
      });
    }
  } else if (type === 'artist') {
    add('releases', stats.releases, 'release', 'releases');
    // A team of one is just them, which is not worth saying.
    if (stats.teamSize > 1) {
      add('teamSize', stats.teamSize, 'person on the team', 'people on the team');
    }
  } else if (type === 'adjacent') {
    add('rolloutsWorkedOn', stats.rolloutsWorkedOn, 'rollout worked on', 'rollouts worked on');
    add('shows', stats.shows, 'show', 'shows');
  }
  return items;
}

/** The one-line version for a directory card. */
export function leadLine(type: ProfileType | null, stats: LeadStats): string {
  return leadItems(type, stats)
    .map((item) => item.label)
    .join(' · ');
}

/** True when the delivered credits, not a stat line, are what a type leads with. */
export const leadsWithCredits = (type: ProfileType | null): boolean =>
  type === 'creative' || type === null;

// ---------------------------------------------------------------------------
// Open to
// ---------------------------------------------------------------------------

/**
 * The words for an availability, which change with the type.
 *
 * The stored values stay open / selective / closed: only the label moves, so
 * nothing already saved needs migrating and "Not taking work" keeps meaning
 * what the request rules say it means.
 */
export function openToLabel(type: ProfileType | null, availability: PersonAvailability): string {
  if (availability === 'closed') return 'Not taking work';
  if (availability === 'selective') return 'Selective';
  if (type === 'manager') return 'Taking new artists';
  if (type === 'artist') return 'Open to collaborate';
  return 'Open to hire';
}

/**
 * The choices the editor offers.
 *
 * TWO CHOICES, and a third only for somebody who already holds it. "Selective"
 * was a dead state in a directory where the Message button shows only for open:
 * nobody could reach them and nothing told them so. It stays valid and is shown
 * to whoever has it, so saving the form never silently changes it.
 */
export function openToChoices(
  type: ProfileType | null,
  current: PersonAvailability
): { value: PersonAvailability; label: string; hint: string }[] {
  const choices: { value: PersonAvailability; label: string; hint: string }[] = [
    {
      value: 'open',
      label: openToLabel(type, 'open'),
      hint: 'A Message button shows on your card.',
    },
  ];
  if (current === 'selective') {
    choices.push({
      value: 'selective',
      label: openToLabel(type, 'selective'),
      hint: 'You stay listed. There is no Message button.',
    });
  }
  choices.push({
    value: 'closed',
    label: openToLabel(type, 'closed'),
    hint: 'You stay findable. People know not to ask yet.',
  });
  return choices;
}

// ---------------------------------------------------------------------------
// Who sees the Message button
// ---------------------------------------------------------------------------

/**
 * What kind of reader is looking.
 *
 * Their own profile type wins. Without a profile, an artist account reads as an
 * artist; everybody else reads as a manager, because the manager is who
 * Urganize is sold to and who is hiring.
 */
export function viewerTypeFor(input: {
  profileType: ProfileType | null;
  accountRole: string | null | undefined;
}): ProfileType {
  if (input.profileType) return input.profileType;
  return input.accountRole === 'artist' ? 'artist' : 'manager';
}

/**
 * The Message button rule.
 *
 *   - only for somebody who is Open (a "Taking new artists" manager, or a
 *     creative or adjacent pro who is "Open to hire"),
 *   - a MANAGER is messaged by artists, everybody else by managers.
 *
 * Profiles stay VISIBLE either way. This decides one button, never a listing.
 * canReceiveRequests (lib/work-requests.ts) still refuses a closed person on
 * the server, so this is a courtesy to the reader and not the gate.
 */
export function canShowMessageButton(input: {
  targetType: ProfileType | null;
  availability: PersonAvailability;
  viewerType: ProfileType;
}): boolean {
  if (input.availability !== 'open') return false;
  if (input.targetType === 'manager') return input.viewerType === 'artist';
  if (input.targetType === 'artist') return input.viewerType !== 'artist';
  return input.viewerType !== 'artist';
}

// ---------------------------------------------------------------------------
// Who comes first
// ---------------------------------------------------------------------------

const VIEWER_ORDER: Record<ProfileType, readonly (ProfileType | null)[]> = {
  // An artist is looking for a manager, then the people a manager would hire.
  artist: ['manager', 'creative', 'adjacent', 'artist', null],
  // A manager is building a release team, then looking for talent.
  manager: ['creative', 'adjacent', 'artist', 'manager', null],
  creative: ['manager', 'artist', 'adjacent', 'creative', null],
  adjacent: ['manager', 'artist', 'creative', 'adjacent', null],
};

/**
 * The list reordered for who is reading. STABLE inside each group, so the order
 * the server chose (most recently updated first) still decides ties. Used only
 * while nobody has typed a search: a typed query ranks by name.
 */
export function orderForViewer<T extends { profileType?: ProfileType | null }>(
  entries: readonly T[],
  viewerType: ProfileType
): T[] {
  const order = VIEWER_ORDER[viewerType];
  const rank = (entry: T): number => {
    const index = order.indexOf(entry.profileType ?? null);
    return index === -1 ? order.length : index;
  };
  return entries
    .map((entry, position) => ({ entry, position, rank: rank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.position - b.position)
    .map((item) => item.entry);
}
