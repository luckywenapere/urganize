/**
 * What a public press kit shows, and to whom.
 *
 * Pure, so both the page and its tests can hold it without a database. The
 * loading half is lib/press-kit-public-server.ts.
 */

import { PRESS_KIT_SECTIONS } from '@/types/press-kits';
import type {
  PressKitSectionContent,
  PressKitSectionKey,
  PressKitVisibility,
} from '@/types/press-kits';

/**
 * Whether a search engine may index this kit.
 *
 * Every other public page in this product is noindex, so this is the one
 * surface that can be found rather than only reached. It is opt in: a kit is
 * private until somebody deliberately picks the listed setting, which is what
 * gives the three visibility values distinct meanings. `link_only` and
 * `public` both work for anyone holding the link and both stay out of search.
 */
export function isKitIndexable(visibility: PressKitVisibility): boolean {
  return visibility === 'public_listed';
}

/**
 * Whether the public page renders at all.
 *
 * Published is the only gate. An unpublished kit is a 404, indistinguishable
 * from a slug that never existed, for the same reason the EPK page refuses to
 * tell a revoked link apart from a made up one.
 */
export function isKitLive(publishedAt: string | null | undefined): boolean {
  return Boolean(publishedAt);
}

/**
 * The embargo is a NOTICE, not a gate, and that is the decision to know here.
 *
 * A standing kit holds the bio, the photos and who to email. Hiding all of
 * that behind a date would break the kit for the ordinary reader in order to
 * protect one piece of news, and a manager who wants it dark already has
 * unpublish. So the date is rendered as a line press are expected to honour,
 * which is what an embargo means in this trade.
 *
 * A date in the past says nothing: the embargo has lifted.
 */
export function embargoNotice(
  embargoDate: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!embargoDate) return null;
  const at = new Date(`${embargoDate}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  if (at.getTime() <= today.getTime()) return null;
  // Same shape the public EPK page already prints a date in, so the two
  // outward-facing surfaces do not word a date two different ways.
  const label = new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(at);
  return `Under embargo until ${label}. Please do not publish before then.`;
}

/** A value counts as filled when a person would say they had answered. */
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return false;
}

export type PublicKitSection = {
  section: PressKitSectionKey;
  content: PressKitSectionContent;
};

/**
 * The sections the public page renders, in the standard order.
 *
 * Three rules, and each one exists to stop the page saying something untrue:
 *
 *   - PUBLISHED content only. `content` is what the team is editing right now,
 *     and rendering it would put half typed copy in front of a journalist.
 *   - Hidden sections are dropped, because hiding one is the whole point of
 *     being able to hide it.
 *   - Empty sections are dropped, because an empty heading reads as a product
 *     fault rather than as a kit with nothing to say there.
 *
 * Assets is special: its content is always empty (photos are their own table),
 * so it is decided by the photo count instead and never by this filter.
 */
export function publicSections(
  sections: readonly {
    section: PressKitSectionKey;
    publishedContent: PressKitSectionContent | null;
    hidden: boolean;
  }[]
): PublicKitSection[] {
  const order = new Map(PRESS_KIT_SECTIONS.map((key, index) => [key, index]));
  return sections
    .filter((section) => !section.hidden)
    .filter((section) => section.section !== 'assets')
    .map((section) => ({
      section: section.section,
      content: section.publishedContent || {},
    }))
    .filter((section) => Object.values(section.content).some(isFilled))
    .sort((a, b) => (order.get(a.section) ?? 99) - (order.get(b.section) ?? 99));
}

/**
 * The one line under the artist's name.
 *
 * Built from the header section rather than invented: the descriptor if there
 * is one, then the home city. Never a placeholder, and never a genre list
 * dressed up as a sentence.
 */
export function kitTagline(header: PressKitSectionContent): string {
  const descriptor = typeof header.descriptor === 'string' ? header.descriptor.trim() : '';
  const city = typeof header.homeCity === 'string' ? header.homeCity.trim() : '';
  const country = typeof header.homeCountry === 'string' ? header.homeCountry.trim() : '';
  const place = [city, country].filter(Boolean).join(', ');
  if (descriptor && place) return `${descriptor} · ${place}`;
  return descriptor || place;
}

/**
 * What a search engine and a link preview show.
 *
 * The short bio if there is one, else the descriptor line, else the artist's
 * name alone. Never a made up sentence: an empty description is better than a
 * confident one nobody wrote.
 */
export function kitDescription(
  artistName: string,
  header: PressKitSectionContent,
  bios: PressKitSectionContent
): string {
  const short = typeof bios.short === 'string' ? bios.short.trim() : '';
  if (short) return short.length > 300 ? `${short.slice(0, 297).trimEnd()}...` : short;
  const tagline = kitTagline(header);
  if (tagline) return `${artistName}. ${tagline}`;
  return `Press kit for ${artistName}.`;
}

/**
 * Where an old EPK link should send its reader, or null to leave it alone.
 *
 * The release-scoped EPK is retired, but links to it may already be sitting in
 * press inboxes, and each one renders a working page today. So an old link is
 * never broken: it keeps rendering the EPK until the artist's standing kit is
 * PUBLISHED, and only then hands over. The old page retires itself artist by
 * artist as kits go live.
 *
 * Both halves are required. A kit with no slug has nowhere to send anyone, and
 * an unpublished kit is a 404 the reader could not get out of, which would be
 * strictly worse than the page they already had.
 */
export function successorPathForKit(
  kit: { slug: string | null | undefined; publishedAt: string | null | undefined } | null
): string | null {
  if (!kit) return null;
  const slug = typeof kit.slug === 'string' ? kit.slug.trim() : '';
  if (!slug) return null;
  if (!isKitLive(kit.publishedAt)) return null;
  return `/k/${slug}`;
}
