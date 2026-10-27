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
import { isOpportunitiesEnabled, isRelationshipsFlagOn } from '@/lib/paused-features';

const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';
const ARTIST_PAGE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
const RELATIONSHIPS_ENABLED =
  isRelationshipsFlagOn() &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
// Paused Oct 27, 2026 (lib/paused-features.ts).
const OPPORTUNITIES_ENABLED = isOpportunitiesEnabled();
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
      label: 'Rollouts',
      href: '/dashboard',
      keywords: ['catalogue', 'catalog', 'rollouts', 'releases', 'all rollouts', 'all releases'],
      leavesRelease: true,
    },
    {
      key: 'urgans',
      label: 'UrgAns',
      href: '/dashboard/urgans',
      keywords: ['assistant', 'chat', 'ai', 'ask', 'session', 'sessions'],
    }
  );

  if (ARTIST_PAGE_ENABLED) {
    pages.push({
      key: 'artists',
      label: 'Artists',
      href: '/dashboard/artists',
      // The press kit words moved to Pitch this! (Oct 17, 2026), where the
      // artist's bio and contact are edited now.
      keywords: ['artist', 'roster', 'act', 'catalogue', 'catalog'],
    });
  }

  if (RELATIONSHIPS_ENABLED) {
    pages.push({
      key: 'relationships',
      label: 'My People',
      href: '/dashboard/relationships',
      keywords: ['people', 'contacts', 'contact', 'crm', 'network', 'follow up', 'producer', 'dj'],
    });
  }

  if (OPPORTUNITIES_ENABLED) {
    pages.push({
      key: 'opportunities',
      label: 'Opportunities',
      href: '/dashboard/opportunities',
      // Open gig calls sit here since Shows left Relationships (URG-303).
      keywords: ['deal', 'grant', 'sync', 'brand', 'partnership', 'sponsor', 'licensing', 'offer', 'gig', 'gigs', 'show', 'shows'],
    });
  }

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

  // The team side of pitching. Since 2026-10-15 it lives in each rollout's
  // Pitch this! scene; /dashboard/pitching is only a bridge that forwards to
  // the latest rollout's Pitch this!, so the entry is named for where it lands
  // (2026-10-17), not for a standalone page that no longer exists. The flag
  // alone gates it, unlike the curator crossing below, which additionally
  // needs the account to own playlists.
  if (PITCHING_ENABLED) {
    pages.push({
      key: 'pitching',
      label: 'Pitch this!',
      href: '/dashboard/pitching',
      // The platforms are here because a manager thinking about this thinks
      // "get on a Spotify playlist" rather than "pitching".
      keywords: [
        'pitch',
        'pitches',
        'pitching',
        'playlist',
        'playlists',
        'curator',
        'spotify',
        'apple music',
        'audiomack',
        // The standalone press kit is hidden (Oct 17, 2026): the kit link and
        // the artist's bio and contact live in Pitch this!.
        'press kit',
        'epk',
        'bio',
        'kit link',
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
    // (The press-kit words left Oct 17, 2026 with the Settings > Press kits
    // fold; they find Pitch this! now.)
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
    ],
  });

  return pages;
}

/** The text a query is matched against: the label plus every keyword. */
export function appPageHaystack(page: AppPage): string {
  return page.keywords ? `${page.label} ${page.keywords.join(' ')}` : page.label;
}
