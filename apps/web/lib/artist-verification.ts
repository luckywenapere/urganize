// Artist verification (2026-11-25, issue #1390, founder approved the mock).
//
// Every artist has a status. It only ever SHOWS: a banner on the artist's page
// and emails to the team. It blocks nothing, and nothing happens by itself.
// The one status that hides an artist, 'taken_down', can only be set by an
// admin, by hand. Pure: no IO, so the screens, the routes and the tests all
// read one set of rules.

export const ARTIST_VERIFICATION_STATUSES = ['unverified', 'checking', 'needs_fix', 'verified', 'taken_down'] as const;
export type ArtistVerificationStatus = (typeof ARTIST_VERIFICATION_STATUSES)[number];

export const VERIFICATION_PROVIDERS = ['spotify', 'apple'] as const;
export type VerificationProvider = (typeof VERIFICATION_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<VerificationProvider, string> = {
  spotify: 'Spotify for Artists',
  apple: 'Apple Music for Artists',
};

export type VerificationSender = 'artist' | 'manager';

/** Where a screenshot is stored: the artist's own folder in the private bucket. */
export const verificationPathPrefix = (artistId: string): string => `artist/${artistId}/verification/`;

/** A status read from the database. Anything unknown is "not verified": the
 *  safe answer is never "verified". */
export function parseVerificationStatus(value: unknown): ArtistVerificationStatus {
  return typeof value === 'string' && (ARTIST_VERIFICATION_STATUSES as readonly string[]).includes(value)
    ? (value as ArtistVerificationStatus)
    : 'unverified';
}

export function parseProvider(value: unknown): VerificationProvider | null {
  return typeof value === 'string' && (VERIFICATION_PROVIDERS as readonly string[]).includes(value)
    ? (value as VerificationProvider)
    : null;
}

export function parseSender(value: unknown): VerificationSender {
  return value === 'artist' ? 'artist' : 'manager';
}

/** Somebody signed in as an artist is the artist; everyone else sending is the
 *  manager. The admin queue shows which. */
export function senderFromRole(role: unknown): VerificationSender {
  return role === 'artist' ? 'artist' : 'manager';
}

export function statusLabel(status: ArtistVerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'Verified artist';
    case 'checking':
      return 'Checking';
    case 'needs_fix':
      return 'Needs a new screenshot';
    case 'taken_down':
      return 'Taken down';
    default:
      return 'Not verified';
  }
}

export type VerificationBanner = {
  title: string;
  body: string;
  /** Null when there is nothing for the person to do. */
  button: string | null;
};

/**
 * What the banner says. Null once verified: the badge takes over. The words
 * avoid gendered pronouns because the app does not know who an artist is.
 */
export function bannerFor(
  status: ArtistVerificationStatus,
  artistName: string,
  note: string | null | undefined
): VerificationBanner | null {
  const reason = typeof note === 'string' ? note.trim() : '';
  switch (status) {
    case 'verified':
      return null;
    case 'checking':
      return {
        title: `We are checking ${artistName}`,
        body: 'You will get an email when we have looked.',
        button: null,
      };
    case 'needs_fix':
      return {
        title: 'We could not use the screenshot',
        body: reason || 'Send a new one that shows the artist name at the top.',
        button: 'Send a new screenshot',
      };
    case 'taken_down':
      return {
        title: `${artistName} has been taken down`,
        body: reason || 'Send a screenshot and we will check again.',
        button: 'Send a screenshot',
      };
    default:
      return {
        title: `Verify ${artistName}`,
        body: `Confirm ${artistName} is the artist or that you manage the artist.`,
        button: 'Verify',
      };
  }
}

/** The status after a screenshot is sent, or null when sending makes no sense
 *  (one is already being checked, or the artist is verified). A taken-down
 *  artist stays taken down until an admin decides. */
export function nextStatusAfterSubmit(current: ArtistVerificationStatus): ArtistVerificationStatus | null {
  if (current === 'unverified' || current === 'needs_fix') return 'checking';
  if (current === 'taken_down') return 'taken_down';
  return null;
}

export type VerificationAction = 'approve' | 'ask_again' | 'remove_badge' | 'take_down' | 'bring_back';

/** The kinds of email the team gets. 'received' is sent when a screenshot
 *  arrives; the rest follow an admin action. */
export type VerificationEmailKind =
  | 'received'
  | 'approved'
  | 'needs_fix'
  | 'badge_removed'
  | 'taken_down'
  | 'brought_back';

export type ActionResult =
  | { ok: true; status: ArtistVerificationStatus; email: VerificationEmailKind }
  | { ok: false; error: string };

/** What an admin action does to a status, or why it cannot. */
export function applyVerificationAction(
  current: ArtistVerificationStatus,
  action: VerificationAction,
  note: string | null | undefined
): ActionResult {
  const hasNote = typeof note === 'string' && note.trim().length > 0;
  switch (action) {
    case 'approve':
      if (current === 'checking' || current === 'taken_down') {
        return { ok: true, status: 'verified', email: 'approved' };
      }
      return { ok: false, error: 'There is no screenshot waiting for this artist.' };
    case 'ask_again':
      if (current !== 'checking') return { ok: false, error: 'This artist has no screenshot being checked.' };
      if (!hasNote) return { ok: false, error: 'Say what was wrong with the screenshot.' };
      return { ok: true, status: 'needs_fix', email: 'needs_fix' };
    case 'remove_badge':
      if (current !== 'verified') return { ok: false, error: 'Only a verified artist has a badge to remove.' };
      return { ok: true, status: 'unverified', email: 'badge_removed' };
    case 'take_down':
      if (current === 'taken_down') return { ok: false, error: 'This artist is already taken down.' };
      if (!hasNote) return { ok: false, error: 'Give the team a reason.' };
      return { ok: true, status: 'taken_down', email: 'taken_down' };
    case 'bring_back':
      if (current !== 'taken_down') return { ok: false, error: 'This artist is not taken down.' };
      return { ok: true, status: 'unverified', email: 'brought_back' };
    default:
      return { ok: false, error: 'Unknown action.' };
  }
}

/** Only a taken-down artist is hidden. */
export function isHiddenStatus(status: ArtistVerificationStatus): boolean {
  return status === 'taken_down';
}

/** True for every status except taken down: verification never blocks import,
 *  covers, UPC and ISRC, or smart links. */
export function blocksNothing(status: ArtistVerificationStatus): boolean {
  return !isHiddenStatus(status);
}
