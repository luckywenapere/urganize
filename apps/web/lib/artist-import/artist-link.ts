/**
 * "Paste their link" (Nov 2026, #1129, mock docs/mocks/paste-artist-link).
 * When the streaming search can't find the right artist, the search box takes
 * a link to their artist page instead. These are the pure rules: is this a
 * link, which service, which artist id, and what to say when we can't use it.
 * No network here; `artist-link-server.ts` does the reading.
 *
 * Apple Music and Deezer only, because those are the two services the import
 * reads. Spotify links are named but refused until the Spotify keys are set.
 */

import { isSafeSourceId, type ImportProvider } from './providers';

export type ArtistLinkWhat = 'song' | 'album' | 'playlist' | 'video';

export type ArtistLink =
  | { kind: 'artist'; provider: ImportProvider; id: string; country: string | null }
  /** A Deezer share link (link.deezer.com/s/…): it has to be opened to see where it goes. */
  | { kind: 'short'; url: string }
  | { kind: 'not-artist'; what: ArtistLinkWhat }
  | { kind: 'unsupported'; service: string }
  /** A Deezer or Apple Music link we could not read an artist from. */
  | { kind: 'broken' }
  /** Any other site. */
  | { kind: 'unknown' };

export type ArtistLinkProblem = Extract<ArtistLink, { kind: 'not-artist' | 'unsupported' | 'broken' | 'unknown' }>;

/** The line under the box while it waits for a link (approved mock, 1b). */
export const PASTE_LINK_HELP = 'Open their artist page on Apple Music or Deezer, tap Share, then Copy link.';

/** When Deezer or Apple did not answer. Shared by the route and the Home popup. */
export const LINK_UNREACHABLE = 'Could not reach the music service. Try again.';

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
const WITH_SCHEME = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
/** "deezer.com/artist/27": a domain and then a path. A name like "will.i.am" has no path. */
const BARE_ADDRESS = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\/\S*$/i;
const SPOTIFY_URI = /^spotify:\S+$/i;

/**
 * The link in what the person typed or pasted, or null when it is a name.
 * Share sheets often add words around the link, so a link inside text counts.
 */
export function extractLink(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (SPOTIFY_URI.test(text)) return text;
  const found = URL_IN_TEXT.exec(text)?.[0];
  let raw: string | null = null;
  if (found) raw = found;
  else if (WITH_SCHEME.test(text)) raw = text;
  else if (BARE_ADDRESS.test(text)) raw = `https://${text}`;
  if (!raw) return null;
  return raw.replace(/[).,;:!?'"\]]+$/, '');
}

export const looksLikeLink = (input: string): boolean => extractLink(input) !== null;

const onHost = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);

/** Share-link hosts that redirect to a deezer.com page. */
export const DEEZER_SHORT_HOSTS: readonly string[] = ['link.deezer.com', 'deezer.page.link'];
export const isDeezerShortHost = (host: string): boolean => DEEZER_SHORT_HOSTS.includes(host.toLowerCase());
export const isDeezerHost = (host: string): boolean => onHost(host.toLowerCase(), 'deezer.com') && !isDeezerShortHost(host);

const isAppleHost = (host: string): boolean => onHost(host, 'music.apple.com') || onHost(host, 'itunes.apple.com');

/** Services people paste that the import can't read. Matched on the real host. */
const OTHER_SERVICES: readonly { service: string; domains: readonly string[] }[] = [
  { service: 'Spotify', domains: ['spotify.com', 'spotify.link', 'spoti.fi'] },
  { service: 'Audiomack', domains: ['audiomack.com'] },
  { service: 'Boomplay', domains: ['boomplay.com', 'boomplaymusic.com'] },
  { service: 'YouTube', domains: ['youtube.com', 'youtu.be'] },
  { service: 'SoundCloud', domains: ['soundcloud.com'] },
  { service: 'TIDAL', domains: ['tidal.com'] },
  { service: 'Anghami', domains: ['anghami.com'] },
  { service: 'Instagram', domains: ['instagram.com'] },
  { service: 'TikTok', domains: ['tiktok.com'] },
];

function otherService(host: string): string | null {
  if (/^music\.amazon\./.test(host)) return 'Amazon Music';
  return OTHER_SERVICES.find((entry) => entry.domains.some((domain) => onHost(host, domain)))?.service ?? null;
}

function parseDeezerPath(segments: readonly string[]): ArtistLink {
  const at = segments.findIndex((segment) => ['artist', 'track', 'album', 'playlist'].includes(segment));
  if (at === -1) return { kind: 'broken' };
  const type = segments[at];
  if (type === 'track') return { kind: 'not-artist', what: 'song' };
  if (type === 'album') return { kind: 'not-artist', what: 'album' };
  if (type === 'playlist') return { kind: 'not-artist', what: 'playlist' };
  const id = segments[at + 1];
  return isSafeSourceId(id) ? { kind: 'artist', provider: 'deezer', id, country: null } : { kind: 'broken' };
}

function parseApplePath(segments: readonly string[], url: URL): ArtistLink {
  const country = segments[0] && /^[a-z]{2}$/.test(segments[0]) ? segments[0] : null;
  const rest = country ? segments.slice(1) : segments;
  const type = rest[0];
  if (type === 'album') return { kind: 'not-artist', what: url.searchParams.get('i') ? 'song' : 'album' };
  if (type === 'song') return { kind: 'not-artist', what: 'song' };
  if (type === 'playlist') return { kind: 'not-artist', what: 'playlist' };
  if (type === 'music-video') return { kind: 'not-artist', what: 'video' };
  if (type !== 'artist') return { kind: 'broken' };
  // /artist/burna-boy/1029395036, /artist/1029395036, either with a page after
  // it (/see-all), or on old iTunes links /artist/burna-boy/id1029395036. The
  // part after the name wins, so a name that is all digits ("112") is not the id.
  const parts = rest.slice(1).map((segment) => segment.replace(/^id(?=\d)/, ''));
  const id = [parts[1], parts[0]].find((part) => part !== undefined && /^\d+$/.test(part));
  return isSafeSourceId(id) ? { kind: 'artist', provider: 'itunes', id, country } : { kind: 'broken' };
}

/**
 * What a typed or pasted value points at. Null means it is not a link at all,
 * so the box searches by name as before.
 */
export function parseArtistLink(input: string): ArtistLink | null {
  const link = extractLink(input);
  if (!link) return null;
  if (SPOTIFY_URI.test(link)) return { kind: 'unsupported', service: 'Spotify' };

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { kind: 'unknown' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'unknown' };
  url.protocol = 'https:';
  const host = url.hostname.toLowerCase();
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  if (isDeezerShortHost(host)) return { kind: 'short', url: url.toString() };
  if (isDeezerHost(host)) return parseDeezerPath(segments);
  if (isAppleHost(host)) return parseApplePath(segments, url);
  const service = otherService(host);
  return service ? { kind: 'unsupported', service } : { kind: 'unknown' };
}

const WHAT_WORDS: Record<ArtistLinkWhat, string> = {
  song: 'a song',
  album: 'an album',
  playlist: 'a playlist',
  video: 'a video',
};

/** What to tell the person when a link can't be used. Plain words, one sentence or two. */
export function artistLinkMessage(problem: ArtistLinkProblem): string {
  switch (problem.kind) {
    case 'unsupported':
      return `We can't read ${problem.service} links. Paste their Apple Music or Deezer link.`;
    case 'not-artist':
      return `That's a link to ${WHAT_WORDS[problem.what]}. Paste the link to their artist page.`;
    case 'broken':
      return "That link didn't open an artist. Check it and try again.";
    case 'unknown':
      return "We can't read that link. Paste their Apple Music or Deezer link.";
  }
}
