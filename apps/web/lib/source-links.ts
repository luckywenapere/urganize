import SOURCE_LINK_DATA from './source-links.json';

/**
 * Short links that say where a visitor came from (2026-11-10, #1185).
 * See docs/notes/2026-11-10-source-links.md.
 *
 * go.urganize.app/x, /ig, /fb ... go in bios and posts. The go host is served
 * by this app with no Vercel domain redirect (#1380), where next.config.js
 * rewrites /<slug> to /api/go/<slug>: one hop, no stop on team. That route counts the
 * tap, remembers the link in a cookie for 30 days and sends the visitor to the
 * marketing site with utm tags. When a new account's team is made, the cookie
 * is reported once as `signup_from_source_link`.
 *
 * THE LIST IS lib/source-links.json (JSON because next.config.js, which is
 * CommonJS, reads it too). To add a link, add one line there. A slug must not
 * be the name of a real page: source-links.test.ts checks.
 *
 * Everything here is pure. Only values from the list ever leave: the slug in
 * the address or the cookie is looked up, never passed on.
 */

export type SourceLink = { slug: string; source: string; medium: string };

const DATA = SOURCE_LINK_DATA as Record<string, { source: string; medium: string }>;

export const SOURCE_LINKS: readonly SourceLink[] = Object.entries(DATA).map(([slug, value]) => ({
  slug,
  source: value.source,
  medium: value.medium,
}));

export const SOURCE_LINK_CAMPAIGN = 'go_link';
export const SOURCE_LINK_LANDING = 'https://urganize.app/';
export const SOURCE_LINK_COOKIE = 'urg_src';
export const SOURCE_LINK_WINDOW_DAYS = 30;
export const SOURCE_LINK_COOKIE_MAX_AGE = SOURCE_LINK_WINDOW_DAYS * 24 * 60 * 60;

/** The link for a slug from an address or a cookie, or null. */
export function resolveSourceLink(raw: unknown): SourceLink | null {
  if (typeof raw !== 'string') return null;
  const slug = raw.trim().toLowerCase();
  return SOURCE_LINKS.find((link) => link.slug === slug) ?? null;
}

/** Where a link sends the visitor: the marketing site, tagged. */
export function sourceLinkDestination(link: SourceLink): string {
  const url = new URL(SOURCE_LINK_LANDING);
  url.searchParams.set('utm_source', link.source);
  url.searchParams.set('utm_medium', link.medium);
  url.searchParams.set('utm_campaign', SOURCE_LINK_CAMPAIGN);
  return url.toString();
}

/**
 * The cookie's Domain. On a urganize.app host it is the whole site, so a tap
 * that lands on urganize.app is still known when the person signs up on
 * team.urganize.app. Anywhere else (localhost, a preview) it is host-only.
 */
export function sourceLinkCookieDomain(hostname: string | null | undefined): string | undefined {
  const host = (hostname || '').trim().toLowerCase().replace(/:\d+$/, '');
  return host === 'urganize.app' || host.endsWith('.urganize.app') ? '.urganize.app' : undefined;
}

export type SourceLinkProperties = { slug: string; source: string; medium: string };

export function sourceLinkProperties(link: SourceLink): SourceLinkProperties {
  return { slug: link.slug, source: link.source, medium: link.medium };
}

/**
 * Tell the server the account's team now exists, so it can read the cookie and
 * record the sign-up. Never throws and never holds sign-up for more than 4
 * seconds. The server clears the cookie, so it is reported once.
 */
export async function reportSourceLinkSignup(token: string | null): Promise<void> {
  if (!token || typeof document === 'undefined') return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    await fetch('/api/source-link/signup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    // Offline or slow: this sign-up is not attributed.
  }
}
