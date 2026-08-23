/**
 * Turning a failed curator request into something a playlist owner can act on.
 *
 * Pure, so it can be unit tested and so both the loaders and the save path
 * describe the same failure the same way.
 *
 * This exists because the curator surfaces used to swallow every failure: the
 * store recorded a 403 in an `isForbidden` flag that no component ever read,
 * so a curator whose profile failed to load saw an empty form and no
 * explanation. That is how a real report reached us as "the profile section has
 * an issue" with nothing to act on.
 *
 * Rule: prefer what the SERVER said. Our routes already return copy written for
 * this person ("This is only for playlist owners.", "Not found."), and relaying
 * it verbatim is both more accurate and more debuggable than re-deriving a
 * message from the status code. The status map is only the fallback.
 */

/** No response at all: DNS, offline, a dropped connection, a killed tab. */
export const CURATOR_NETWORK_ERROR =
  'We could not reach Urganize. Check your connection and try again.';

const GENERIC = 'Something went wrong. Try again.';

export function describeCuratorFailure(input: {
  status: number;
  serverMessage?: string | null;
}): string {
  const fromServer = String(input.serverMessage ?? '').trim();
  if (fromServer) return fromServer;

  const { status } = input;
  if (status === 401) return 'Your session expired. Sign in again.';
  if (status === 403) return 'This is only for playlist owners.';
  if (status === 404) return 'This is not available right now. Try again shortly.';
  if (status === 429) return 'Too many requests. Give it a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Try again.';
  return GENERIC;
}

/**
 * Read the `error` field out of a response body without throwing on a body that
 * is not JSON at all — an HTML error page from a proxy, or an empty 502.
 */
export async function readServerMessage(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { error?: unknown } | null;
    const message = payload?.error;
    return typeof message === 'string' && message.trim() ? message.trim() : null;
  } catch {
    return null;
  }
}
