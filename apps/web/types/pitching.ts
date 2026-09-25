// Playlist pitching. The shapes the /api/curator/* and /api/pitching/* routes
// return.
//
// Note how little the curator-facing shapes carry: a CuratorPitch has no
// release id, no workspace id, no team id, nothing a curator could follow back
// into a team's data. Every display field is denormalized onto the pitch row
// for exactly that reason (see the migration header).

export type PitchPlatform = 'spotify' | 'apple_music' | 'audiomack' | 'youtube' | 'other';

export type PitchStatus = 'new' | 'listened' | 'added' | 'passed';

/** The curator's own profile. */
export interface CuratorProfile {
  displayName: string;
  bio: string;
  /** Signed read URL for the photo, or null. Expires, so it is never cached. */
  photoUrl: string | null;
  /** Storage object path, kept so the client can tell "no photo" from "not loaded". */
  photoPath: string | null;
  /** The handle in her public URL, or null before she has ever published. */
  slug: string | null;
  /** When her public page went live. Null means it is not live; the slug is
   *  deliberately kept either way, so republishing restores the same URL. */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A playlist as its owning curator sees it. */
export interface CuratorPlaylist {
  id: string;
  name: string;
  platform: PitchPlatform;
  genres: string[];
  followerCount: number | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/** A playlist as a pitcher browsing sees it: adds the curator's name. */
export interface BrowsablePlaylist {
  id: string;
  name: string;
  curatorName: string;
  platform: PitchPlatform;
  genres: string[];
  followerCount: number | null;
  url: string;
}

/** A pitch in the curator's inbox. */
export interface CuratorPitch {
  id: string;
  playlistName: string;
  songTitle: string;
  artistName: string;
  pitcherName: string;
  songUrl: string;
  songPlatform: PitchPlatform | null;
  note: string;
  status: PitchStatus;
  reply: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A pitch as the sending team sees it, on the release or on the Pitching page. */
export interface SentPitch {
  id: string;
  /**
   * Which release this went out for. Null when that release was deleted
   * afterwards (`release_id` is `on delete set null`, so a pitch outlives it).
   * Both of these fields are for the team-wide list, which spans releases; the
   * per-release scene already knows which release it is showing.
   */
  releaseId: string | null;
  /** The release's title, resolved by the route. Null when unknown or deleted. */
  releaseTitle: string | null;
  playlistId: string | null;
  playlistName: string;
  curatorName: string;
  songTitle: string;
  songUrl: string;
  songPlatform: PitchPlatform | null;
  note: string;
  status: PitchStatus;
  reply: string | null;
  pitcherName: string;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST /api/pitching/pitches. */
export type PitchInput = {
  releaseId: string;
  playlistId: string;
  songTitle: string;
  songUrl: string;
  note?: string;
};

/** A curator invite row as the admin page sees it. */
export type CuratorInviteState = 'active' | 'used' | 'revoked' | 'expired';

export interface CuratorInvite {
  id: string;
  code: string;
  url: string;
  state: CuratorInviteState;
  /** Display name of the curator who used it, when used. */
  usedByName: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
}
