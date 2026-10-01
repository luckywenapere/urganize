/**
 * The page's half of Sign in with Apple (2026-10-01). Apple's rule 4.8: an app
 * that offers a third-party login (Google) must offer this too. The iPhone
 * app shows Apple's own sheet through the native bridge ('appleSignIn'); this
 * file is the part that needs no phone, so it can be tested: the nonce, the
 * name Apple only gives once, and the decision to show the button.
 */
import { getPlatform } from '@/lib/platform';
import { shellSupports } from '@/lib/native-bridge';

/** A random value only this sign-in attempt knows. 32 bytes, hex. */
export function generateRawNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 as lowercase hex: what Apple stamps into the token for the nonce. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Apple hands over the person's name only the first time they ever sign in to
 * this app, and never again, so it has to be saved straight away. Either half
 * can be missing, and people can leave both blank.
 */
export function formatAppleName(parts: {
  givenName?: string | null;
  familyName?: string | null;
}): string | null {
  const joined = [parts.givenName, parts.familyName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ');
  return joined || null;
}

/**
 * Hands Apple's one-use code to the server so deleting this account can later
 * revoke the Sign in with Apple link. Fire and forget: the person is already
 * signed in, and a failure here is housekeeping the server logs.
 */
export async function linkAppleAccount(accessToken: string, authorizationCode: string): Promise<void> {
  try {
    await fetch('/api/auth/apple/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ authorizationCode }),
    });
  } catch {
    // Nothing to tell the person; sign-in already worked.
  }
}

/**
 * Show Apple's button only inside the iPhone app, where the native sheet
 * exists. A browser tab, Android and an old build of the app all answer false,
 * so nobody is ever offered a button that cannot work.
 */
export function canSignInWithApple(): boolean {
  return getPlatform() === 'ios' && shellSupports('appleSignIn');
}
