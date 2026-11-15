import { shareOrigin } from './app-hosts';
// Held accounts share a link to move up the line (2026-10-23).
// Pure rules and copy, safe for the client. Server half: waitlist-share-server.ts.
//
// A held account (not let in yet) gets a personal link, go.urganize.app/r/<code>.
// Each other account that signs up through it is one friend. FRIENDS_NEEDED
// friends lets the sharer in. A friend stays held themselves and gets a link of
// their own.

export const FRIENDS_NEEDED = 3;

export const SHARE_COPY = {
  lineLabel: 'Your place in line',
  goalLabel: `Bring ${FRIENDS_NEEDED} friends to get in early`,
  progress: (friends: number) =>
    `${Math.min(friends, FRIENDS_NEEDED)} of ${FRIENDS_NEEDED} joined. Each friend who joins moves you up.`,
  share: 'Share on WhatsApp',
  copy: 'Copy link',
  copied: 'Copied',
  signOut: 'Sign out',
} as const;

const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 8;

export function looksLikeShareCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z2-9]{8}$/.test(code.toUpperCase()) && !/[IO01]/.test(code.toUpperCase());
}

/** Stored and compared upper case, so a code typed or read aloud still matches. */
export function normalizeShareCode(code: string): string {
  return code.trim().toUpperCase();
}

export function makeShareCode(randomByte: (i: number) => number): string {
  let code = '';
  for (let i = 0; i < SHARE_CODE_LENGTH; i += 1) {
    code += SHARE_CODE_ALPHABET[randomByte(i) % SHARE_CODE_ALPHABET.length];
  }
  return code;
}

export function buildShareUrl(origin: string, code: string): string {
  return `${shareOrigin(origin)}/r/${code}`;
}

export function buildShareMessage(url: string): string {
  return `I'm on the waitlist for Urganize, a planning and coordination app for recording artists, managers and labels. Join with my link and we both move up: ${url}`;
}

export function shareLinkLabel(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function friendsRemaining(friends: number): number {
  return Math.max(0, FRIENDS_NEEDED - friends);
}

export function hasEnoughFriends(friends: number): boolean {
  return friends >= FRIENDS_NEEDED;
}

export function formatPlace(place: number): string {
  return `# ${place.toLocaleString('en-US')}`;
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export type ShareTargetId = 'whatsapp' | 'x' | 'telegram' | 'linkedin' | 'facebook';

/** Web share addresses. Instagram and TikTok have none, so they live in the follow row. */
export function buildShareTargets(url: string, message: string): Array<{ id: ShareTargetId; label: string; href: string }> {
  const text = encodeURIComponent(message);
  const link = encodeURIComponent(url);
  return [
    { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${text}` },
    { id: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${text}` },
    { id: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${link}&text=${text}` },
    { id: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${link}` },
    { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${link}` },
  ];
}
