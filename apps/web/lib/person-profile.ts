import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';
import { isProfileType, type ProfileType } from './directory-profile-type';
import type { PersonAvailability, PersonLink, PersonVisibility, ProfileRole } from '@/types/directory';

/**
 * The self-reported half of a person's record: what they are allowed to say
 * about themselves, and how it is shaped before it is stored.
 *
 * Everything parsed here is a claim. The counts that sit beside it come from
 * delivery records and nothing in this file can touch them, which is the line
 * the whole feature rests on.
 *
 * Pure, so the editor and the route run the same rules rather than two copies
 * that drift, and so a change to what somebody may write is a test failure.
 */

export const PERSON_DISPLAY_NAME_MAX_CHARS = 80;
export const PERSON_BIO_MAX_CHARS = 600;
export const PERSON_ROLES_MAX = 6;
export const PERSON_LINKS_MAX = 6;
export const PERSON_LINK_LABEL_MAX_CHARS = 40;
export const PERSON_PLACE_MAX_CHARS = 80;

export const PERSON_VISIBILITIES: readonly PersonVisibility[] = ['private', 'directory', 'public'];
export const PERSON_AVAILABILITIES: readonly PersonAvailability[] = ['open', 'selective', 'closed'];

/** Copy for the three visibility choices. Plain, and honest about what each
 *  one actually does rather than describing an intention. */
export const PERSON_VISIBILITY_COPY: Record<PersonVisibility, { label: string; hint: string }> = {
  private: {
    label: 'Not listed',
    hint: 'Nobody can find you. Your record is still kept.',
  },
  directory: {
    label: 'Listed in the directory',
    hint: 'People signed in to Urganize can find you.',
  },
  public: {
    label: 'Listed, and your page is open',
    hint: 'Anyone with your link can read your page, signed in or not.',
  },
};

export const PERSON_AVAILABILITY_COPY: Record<PersonAvailability, { label: string; hint: string }> = {
  open: { label: 'Open to work', hint: 'Taking on new rollouts now.' },
  selective: { label: 'Selective', hint: 'Open to the right thing.' },
  closed: { label: 'Not taking work', hint: 'You stay findable. People know not to ask yet.' },
};

/**
 * The one addressable spot in the Settings section, so a link and its target
 * cannot drift apart.
 *
 * It lives HERE rather than beside the component for a bundling reason: the
 * directory page and the settings page both need it, and importing it from a
 * 'use client' component would pull that whole section — and everything it
 * imports — into pages that only wanted a string.
 */
export const DIRECTORY_SETTINGS_ANCHOR = 'directory';

/** A profile is listed once it is anything but private. */
export function isListed(visibility: PersonVisibility): boolean {
  return visibility !== 'private';
}

/**
 * A handle from a name, matching the slug shape the database enforces.
 *
 * Null when nothing usable survives, which the caller has to handle rather
 * than papering over: a person whose name is all punctuation needs to be asked
 * for a handle, not given a generated one that means nothing.
 */
export function suggestSlug(displayName: string): string | null {
  const slug = displayName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  // The CHECK requires at least two characters, so a one-letter result is not
  // a valid handle even though it is not empty.
  return slug.length >= 2 ? slug : null;
}

/**
 * Whether a unique-handle collision is on a handle WE generated rather than one
 * the person chose.
 *
 * It matters because the two need opposite answers. A handle somebody typed is
 * theirs to change, so "that handle is taken" is useful. But on a first save
 * there is no handle field on screen at all — they typed a name and pressed
 * "List me" — so the same message names a thing they never chose and cannot
 * see, which turns the one action this whole feature depends on into a dead
 * end. The caller retries without a handle instead; a profile with no handle is
 * a valid profile (the column is nullable), and they can pick one afterwards.
 */
export function slugConflictIsOurs(input: PersonProfileInput, profileExisted: boolean): boolean {
  // Only a first write suggests one, and only when the caller named none. An
  // explicit null is a choice, not a suggestion, and cannot collide anyway.
  return !profileExisted && input.slug === undefined;
}

export type PersonProfileInput = {
  displayName?: string;
  roles?: DirectoryRole[];
  city?: string | null;
  country?: string | null;
  availability?: PersonAvailability;
  bio?: string | null;
  links?: PersonLink[];
  visibility?: PersonVisibility;
  slug?: string | null;
  /** The owner's override of the derived type. Null clears it. */
  profileType?: ProfileType | null;
};

const isRole = (value: unknown): value is DirectoryRole =>
  typeof value === 'string' && (DIRECTORY_ROLES as readonly string[]).includes(value);

/** A url somebody else's browser will follow. http and https only: a
 *  `javascript:` or `data:` link is the one field here that could hurt a
 *  reader rather than merely look wrong. */
function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseOptionalText(
  payload: Record<string, unknown>,
  key: string,
  max: number,
  label: string
): { error: string } | { value?: string | null } {
  if (!(key in payload)) return {};
  const raw = payload[key];
  if (raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: `${label} must be text.` };
  const trimmed = raw.trim();
  if (trimmed.length > max) return { error: `Keep ${label.toLowerCase()} to ${max} characters or fewer.` };
  return { value: trimmed || null };
}

/**
 * Parse a sparse update.
 *
 * ABSENT AND NULL MEAN DIFFERENT THINGS, and that is load-bearing: the editor
 * saves one field at a time, so an omitted key must leave the stored value
 * alone while an explicit null clears it. Treating absent as null would wipe
 * somebody's bio the moment they edited their city — the same trap the credits
 * PATCH route and the curator profile both had to fix.
 */
export function parsePersonProfileInput(
  body: unknown
): { error: string } | { input: PersonProfileInput } {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const input: PersonProfileInput = {};

  if ('displayName' in payload) {
    const raw = payload.displayName;
    if (typeof raw !== 'string') return { error: 'Your name must be text.' };
    const trimmed = raw.trim();
    if (!trimmed) return { error: 'Add your name.' };
    if (trimmed.length > PERSON_DISPLAY_NAME_MAX_CHARS) {
      return { error: `Keep your name to ${PERSON_DISPLAY_NAME_MAX_CHARS} characters or fewer.` };
    }
    input.displayName = trimmed;
  }

  if ('roles' in payload) {
    const raw = payload.roles;
    if (!Array.isArray(raw)) return { error: 'Roles must be a list.' };
    if (!raw.every(isRole)) return { error: 'That is not a role we know.' };
    const unique = [...new Set(raw)];
    if (unique.length > PERSON_ROLES_MAX) {
      return { error: `Pick up to ${PERSON_ROLES_MAX} roles.` };
    }
    input.roles = unique;
  }

  for (const [key, max, label] of [
    ['city', PERSON_PLACE_MAX_CHARS, 'City'],
    ['country', PERSON_PLACE_MAX_CHARS, 'Country'],
    ['bio', PERSON_BIO_MAX_CHARS, 'Bio'],
  ] as const) {
    const parsed = parseOptionalText(payload, key, max, label);
    if ('error' in parsed) return parsed;
    if ('value' in parsed) input[key] = parsed.value;
  }

  if ('availability' in payload) {
    const raw = payload.availability;
    if (!PERSON_AVAILABILITIES.includes(raw as PersonAvailability)) {
      return { error: 'Pick one of the availability options.' };
    }
    input.availability = raw as PersonAvailability;
  }

  if ('visibility' in payload) {
    const raw = payload.visibility;
    if (!PERSON_VISIBILITIES.includes(raw as PersonVisibility)) {
      return { error: 'Pick one of the listing options.' };
    }
    input.visibility = raw as PersonVisibility;
  }

  if ('profileType' in payload) {
    const raw = payload.profileType;
    if (raw === null) {
      input.profileType = null;
    } else if (isProfileType(raw)) {
      input.profileType = raw;
    } else {
      return { error: 'Pick one of the profile types.' };
    }
  }

  if ('slug' in payload) {
    const raw = payload.slug;
    if (raw === null) {
      input.slug = null;
    } else if (typeof raw !== 'string') {
      return { error: 'Your handle must be text.' };
    } else {
      const slug = raw.trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 60) {
        return { error: 'A handle can use letters, numbers and dashes, and needs 2 to 60 of them.' };
      }
      input.slug = slug;
    }
  }

  if ('links' in payload) {
    const raw = payload.links;
    if (!Array.isArray(raw)) return { error: 'Links must be a list.' };
    if (raw.length > PERSON_LINKS_MAX) return { error: `Add up to ${PERSON_LINKS_MAX} links.` };
    const links: PersonLink[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') return { error: 'Each link needs a label and a link.' };
      const record = entry as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      const url = typeof record.url === 'string' ? record.url.trim() : '';
      if (!label || !url) return { error: 'Each link needs a label and a link.' };
      if (label.length > PERSON_LINK_LABEL_MAX_CHARS) {
        return { error: `Keep a link label to ${PERSON_LINK_LABEL_MAX_CHARS} characters or fewer.` };
      }
      if (!isSafeUrl(url)) return { error: 'A link has to start with http or https.' };
      links.push({ label, url });
    }
    input.links = links;
  }

  return { input };
}

/**
 * The roles a profile shows, with what the product will vouch for.
 *
 * A DELIVERED ROLE THE PERSON NEVER CLAIMED STILL SHOWS. Somebody who
 * delivered artwork and never thought to tick "graphic designer" has the
 * record either way, and dropping it would put the count back at the mercy of
 * self-reporting, which is the thing this feature exists to avoid.
 *
 * Delivered roles sort first, because a count is the only part of a profile
 * anybody came to read.
 */
export function profileRoles(
  claimed: DirectoryRole[],
  records: { role: DirectoryRole }[]
): ProfileRole[] {
  const counts = new Map<DirectoryRole, number>();
  for (const record of records) {
    counts.set(record.role, (counts.get(record.role) ?? 0) + 1);
  }

  const roles = new Set<DirectoryRole>([...claimed, ...counts.keys()]);

  return [...roles]
    .map((role) => ({ role, delivered: counts.get(role) ?? 0 }))
    .sort((a, b) => {
      if ((a.delivered > 0) !== (b.delivered > 0)) return a.delivered > 0 ? -1 : 1;
      return a.role.localeCompare(b.role);
    });
}
