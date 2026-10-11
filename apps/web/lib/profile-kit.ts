import { PERSON_LINKS_MAX } from './person-profile';
import { personSubtitle } from './person-public';
import { resolveKitLink } from './press-kit-public';
import type { PersonLink } from '@/types/directory';

/**
 * One record, seen two ways: an artist's directory profile and their press
 * kit are the same person described once.
 *
 * Pure. The loaders that find the kit are lib/profile-kit-server.ts; this file
 * only decides what a profile SHOWS once it knows whether a kit stands behind
 * it, and what a profile may say at all while nobody has claimed it.
 *
 * THE RULES, each one held by a test:
 *
 *  - An artist's profile reads its bio, photo, links, place and genre from the
 *    artist's PUBLISHED press kit. Published, never the draft: the directory is
 *    a public-facing page, and a draft is half-typed copy the team has not
 *    approved.
 *  - Field by field, the kit wins and the profile's own field is the fallback.
 *    A kit with no bio yet must not blank the profile's bio, and a hidden kit
 *    section is simply absent from the published content, so it falls back too.
 *  - Nothing is migrated or deleted. The profile's own fields stay in the
 *    table, untouched, and show again the day the kit stops supplying them.
 *  - A profile nobody has claimed carries NO bio in any payload. A team typed
 *    the name; a bio on top of it would be a team writing about a real person
 *    who has not agreed to anything.
 */

/** Whether a person has claimed their profile. `status` is read when the caller
 *  has it, but a missing user is enough on its own: the database ties the two
 *  together (status = 'claimed' exactly when user_id is set), so deriving it
 *  here keeps readers working on a database that predates the status column. */
export function isClaimedProfile(input: { userId?: string | null; status?: string | null }): boolean {
  if (input.status === 'unclaimed') return false;
  return Boolean(input.userId && String(input.userId).trim());
}

/** The bio a read payload may carry. Null for an unclaimed profile, always. */
export function bioForPayload(input: {
  userId?: string | null;
  status?: string | null;
  bio: string | null | undefined;
}): string | null {
  if (!isClaimedProfile(input)) return null;
  const bio = typeof input.bio === 'string' ? input.bio.trim() : '';
  return bio || null;
}

/** The kit's published facts about one artist, already reduced to what a
 *  profile can show. Built by kitFactsFromPublished. */
export type KitFacts = {
  artistId: string;
  artistName: string;
  slug: string;
  descriptor: string;
  homeCity: string;
  genre: string;
  bios: { short: string; medium: string; long: string };
  links: PersonLink[];
  photoUrl: string | null;
};

export type ProfileOwnFields = {
  bio: string | null;
  city: string | null;
  country: string | null;
  links: PersonLink[];
};

export type ResolvedProfileView = {
  /** 'kit' when a published kit stands behind this profile. */
  source: 'kit' | 'profile';
  bio: string | null;
  /** One line, already joined: the kit's home city or the profile's city and country. */
  location: string | null;
  genre: string | null;
  links: PersonLink[];
  photoUrl: string | null;
  /** Where the editing happens, for the editor to point at. Null with no kit. */
  kit: { artistId: string; artistName: string; slug: string } | null;
  fromKit: { bio: boolean; location: boolean; links: boolean; photo: boolean; genre: boolean };
};

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** medium is the length a profile page wants; short and long are fallbacks
 *  rather than clipped, because the kit already enforces its own lengths. */
function kitBio(bios: KitFacts['bios']): string {
  return bios.medium || bios.short || bios.long;
}

export function resolveProfileView(profile: ProfileOwnFields, kit: KitFacts | null): ResolvedProfileView {
  const own = {
    bio: str(profile.bio),
    location: personSubtitle({ city: profile.city, country: profile.country }),
  };

  const fromKit = {
    bio: Boolean(kit && kitBio(kit.bios)),
    location: Boolean(kit && kit.homeCity),
    links: Boolean(kit && kit.links.length > 0),
    photo: Boolean(kit && kit.photoUrl),
    genre: Boolean(kit && kit.genre),
  };

  return {
    source: kit ? 'kit' : 'profile',
    bio: (fromKit.bio && kit ? kitBio(kit.bios) : own.bio) || null,
    location: (fromKit.location && kit ? kit.homeCity : own.location) || null,
    genre: fromKit.genre && kit ? kit.genre : null,
    links: (fromKit.links && kit ? kit.links : profile.links).slice(0, PERSON_LINKS_MAX),
    photoUrl: fromKit.photo && kit ? kit.photoUrl : null,
    kit: kit ? { artistId: kit.artistId, artistName: kit.artistName, slug: kit.slug } : null,
    fromKit,
  };
}

/**
 * Which artist a person IS, from the one real link the product holds: a team
 * member scoped to a single artist is that artist's own login.
 *
 * A person scoped to several artists, or none, is not matched. Guessing which
 * artist's kit speaks for a manager of five would put one artist's bio on a
 * different person's page, so the answer is "no kit" and the profile's own
 * fields show.
 */
export function pickArtistForMember(artistScopeIds: readonly (string | null | undefined)[]): string | null {
  const distinct = new Set(artistScopeIds.filter((id): id is string => typeof id === 'string' && id.length > 0));
  return distinct.size === 1 ? [...distinct][0] : null;
}

type PublishedKitInput = {
  slug: string;
  artistName: string;
  byKey: Record<string, Record<string, unknown>>;
  photos: { url: string }[];
};

/**
 * Reduce a PUBLISHED kit (what lib/press-kit-public-server.ts loads) to the
 * facts a profile shows.
 *
 * `byKey` holds only published, visible, non-empty sections, so a hidden or
 * unpublished section is not here and its field is empty, which is what sends
 * the resolver to the profile's own value.
 */
export function kitFactsFromPublished(artistId: string, kit: PublishedKitInput): KitFacts {
  const header = kit.byKey.header || {};
  const bios = kit.byKey.bios || {};
  const linksContent = kit.byKey.links || {};
  const rawLinks = Array.isArray(linksContent.links) ? (linksContent.links as Record<string, unknown>[]) : [];

  const links: PersonLink[] = [];
  for (const entry of rawLinks) {
    const link = resolveKitLink(entry || {});
    if (link) links.push({ label: link.label, url: link.href });
  }

  return {
    artistId,
    artistName: kit.artistName,
    slug: kit.slug,
    descriptor: str(header.descriptor),
    homeCity: str(header.homeCity),
    genre: str(header.genreTags),
    bios: { short: str(bios.short), medium: str(bios.medium), long: str(bios.long) },
    links,
    photoUrl: kit.photos[0]?.url || null,
  };
}

/** What the kit supplies to a profile, in words, for the editor's one line:
 *  "Your page uses Dorian's press kit for your bio, your photo". */
export function kitFieldNames(view: Pick<ResolvedProfileView, 'fromKit'>): string[] {
  return [
    view.fromKit.bio ? 'your bio' : null,
    view.fromKit.photo ? 'your photo' : null,
    view.fromKit.location ? 'where you are' : null,
    view.fromKit.genre ? 'your genre' : null,
    view.fromKit.links ? 'your links' : null,
  ].filter((name): name is string => Boolean(name));
}
