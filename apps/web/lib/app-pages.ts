// The pages a signed-in team account can navigate to, with labels and search
// keywords — so the mobile search surface can find a PAGE, not just an activity
// or a release tool (2026-08-31, founder: "that search should be able to search
// for any page at all").
//
// Keywords are the point of this file rather than decoration: a manager looking
// for their card details types "billing", and nothing in the app is labelled
// that — it is a section inside Settings. Label-only matching would answer
// "No matches" to a query the product can absolutely satisfy.
//
// RELATED BUT DELIBERATELY SEPARATE from lib/prefetch-routes.ts, which lists a
// deliberate SUBSET of these for a different reason: prefetching spends bytes
// on a metered connection, so it warms only the primary nav's destinations.
// Search costs nothing per entry, so it should reach everything reachable. Do
// not collapse the two — the answer to "should this be warmed?" and "should
// this be findable?" are not the same question.

/** Feature flags, read at module scope like every other NEXT_PUBLIC_* gate
 * (inlined at build time). Each mirrors the gate the nav itself uses: with the
 * flag off these pages bounce or 404, so offering one as a search result would
 * be a dead end. */
import { settingsDeepLink } from '@/lib/settings-nav';

const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';
const ARTIST_PAGE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
const RELATIONSHIPS_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_RELATIONSHIPS === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
const HOME_ENABLED = true;

export type AppPage = {
  key: string;
  /** What the result row shows, matching the nav's own wording for the same
   *  destination so the two surfaces cannot disagree about what a page is
   *  called. */
  label: string;
  href: string;
  /** Words that should find this page but are not in its label — the sections
   *  it contains, and what people call it when they do not call it that. */
  keywords?: string[];
  /**
   * True for the one destination that means "leave the release I am in".
   * Navigating there has to forget the scoped release's remembered scene, the
   * same step the back arrow, MobileNavBar's Home tab, the side menu's Catalog
   * row and the topbar's Catalog icon all take — otherwise coming back to that
   * release resumes the scene the user just navigated away from.
   */
  leavesRelease?: boolean;
};

export type AppPageAudience = {
  /**
   * Whether this account owns a curator profile — a dual-capability account,
   * the only kind that can cross into /curator from the team side.
   *
   * TRI-STATE ON PURPOSE: null means the probe has not answered yet and must
   * NOT be read as false. It is a "not yet", so the crossing is simply left
   * out until the answer arrives. Reading null as no is the documented
   * dual-account trap.
   */
  hasCuratorProfile: boolean | null;
};

/**
 * Every page this account can reach, in rough order of how often it is wanted.
 *
 * `/admin` is deliberately ABSENT. Its own availability comes from the
 * workspace-identity payload, which 404s when NEXT_PUBLIC_FEATURE_IDENTITY_PANEL
 * is off — so an `isAdmin` read here would be false in a default deployment and
 * the entry would be unreliable rather than merely restricted. It is an
 * internal surface reachable by a couple of accounts, and those accounts
 * already have it pinned in the side menu. A decision, not an oversight.
 *
 * The release SCENES (Metadata, Content, Press kit, …) are absent for a
 * different reason: they are not pages, they are surfaces inside the scoped
 * release, and the search surface already offers them as release tools.
 */
export function buildAppPages({ hasCuratorProfile }: AppPageAudience): AppPage[] {
  const pages: AppPage[] = [];

  // FIRST — the new landing destination. 'home' used to sit as a keyword on
  // Catalog, back when this bar's own tab used that name for it; now that a
  // literal Home page exists, that keyword moved here so it points at the
  // page it actually names.
  if (HOME_ENABLED) {
    pages.push({
      key: 'home',
      label: 'Home',
      href: '/dashboard/home',
      keywords: ['brief', 'today', 'what needs me'],
    });
  }

  pages.push(
    {
      key: 'catalog',
      label: 'Catalogue',
      href: '/dashboard',
      keywords: ['rollouts', 'releases', 'all rollouts', 'all releases'],
      leavesRelease: true,
    },
    {
      key: 'urgans',
      label: 'UrgAns',
      href: '/dashboard/urgans',
      keywords: ['assistant', 'chat', 'ai', 'ask'],
    }
  );

  if (ARTIST_PAGE_ENABLED) {
    pages.push({
      key: 'artists',
      label: 'Artists',
      href: '/dashboard/artists',
      // The press kit lives on the artist page now, so those words find it.
      keywords: ['artist', 'roster', 'act', 'catalogue', 'catalog', 'press kit', 'epk', 'bio'],
    });
  }

  if (RELATIONSHIPS_ENABLED) {
    pages.push({
      key: 'relationships',
      label: 'Relationships',
      href: '/dashboard/relationships',
      keywords: ['people', 'contacts', 'contact', 'crm', 'network', 'follow up', 'producer', 'dj'],
    });
  }

  pages.push({
    key: 'opportunities',
    label: 'Opportunities',
    href: '/dashboard/opportunities',
    keywords: ['deal', 'grant', 'sync', 'brand', 'partnership', 'sponsor', 'licensing', 'offer'],
  });

  if (NOTES_ENABLED) {
    pages.push({
      key: 'notes',
      label: 'Notes',
      href: '/dashboard/notes',
      keywords: ['note', 'idea', 'capture'],
    });
  }

  if (DIRECTORY_ENABLED) {
    pages.push({
      key: 'directory',
      label: 'Directory',
      href: '/dashboard/directory',
      // Nobody opens this thinking the word "directory". They think of the JOB
      // they need doing, which is why the roles carry it — and "find" and
      // "hire", which is what the manager is actually trying to do.
      keywords: [
        'find',
        'hire',
        'people',
        'producer',
        'engineer',
        'mix',
        'designer',
        'photographer',
        'videographer',
        'pr',
      ],
    });
  }

  if (EVENTS_ENABLED) {
    pages.push({
      key: 'shows',
      label: 'Shows',
      href: '/dashboard/shows',
      keywords: ['event', 'events', 'gig', 'setlist', 'set list', 'dj', 'pack', 'venue'],
    });
  }

  // The team side of pitching: every pitch this team sent, and where a new one
  // is sent from. The flag alone gates it — unlike the curator crossing below,
  // which additionally needs the account to own playlists.
  if (PITCHING_ENABLED) {
    pages.push({
      key: 'pitching',
      label: 'Pitching',
      href: '/dashboard/pitching',
      // The platforms are here because a manager thinking about this thinks
      // "get on a Spotify playlist" rather than "pitching".
      keywords: [
        'pitch',
        'pitches',
        'playlist',
        'playlists',
        'curator',
        'spotify',
        'apple music',
        'audiomack',
      ],
    });
  }

  // Both halves required: the feature has to be on AND this account has to
  // actually be a playlist owner. Everyone else has no such crossing.
  if (PITCHING_ENABLED && hasCuratorProfile === true) {
    pages.push({
      key: 'curator',
      label: 'Playlist pitches',
      href: '/curator',
      keywords: ['curator', 'playlist', 'pitches', 'inbox'],
    });
  }

  pages.push({
    key: 'settings',
    label: 'Settings',
    href: settingsDeepLink(),
    // The sections Settings contains. Someone hunting for their card details
    // types "billing", and no page in this app is called that.
    //
    // The press-kit words are here for exactly that reason, since 2026-09-09:
    // press kits left the menus (founder call) and are reached from a Settings
    // row, so Settings is now the honest answer to "press kit" and "bio". This
    // is Settings being findable by what it holds, not a press kits entry
    // sneaking back in — the destination is /settings.
    keywords: [
      'account',
      'billing',
      'plan',
      'subscription',
      'payment',
      'team',
      'teammates',
      'invite',
      'notifications',
      'appearance',
      'theme',
      'profile',
      'artist name',
      'logo',
      'export',
      'password',
      'delete account',
      'press kit',
      'press kits',
      'epk',
      'bio',
      'biography',
      'media kit',
      'one sheet',
    ],
  });

  return pages;
}

/** The text a query is matched against: the label plus every keyword. */
export function appPageHaystack(page: AppPage): string {
  return page.keywords ? `${page.label} ${page.keywords.join(' ')}` : page.label;
}
