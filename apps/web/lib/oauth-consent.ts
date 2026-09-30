/**
 * Where an approved connection will be sent, in words a person can check.
 *
 * The consent screen asked "Let this app read and update your rollouts?" without
 * ever saying which app. Naming it properly needs the client's registered name,
 * and here that name is whatever the client typed when it registered (open
 * dynamic registration, which claude.ai requires), so showing it as if it were
 * verified would lend trust to anyone who calls their client "Claude".
 *
 * The redirect address is the honest thing to show. It is exactly where the
 * authorization code goes if the person allows, and the server refuses to mint
 * one for an address the client did not register. Someone about to press Allow
 * can read "claude.ai" and know whether that is what they expected.
 *
 * Returns null for anything that is not a plain https address or a loopback one
 * (the only two the registration route accepts), so an odd value renders as no
 * line at all rather than as a confusing one.
 */
export function describeRedirectTarget(redirectUri: string): string | null {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!host) return null;

  if (url.protocol === 'https:') return host;

  if (url.protocol === 'http:' && isLoopbackHost(host)) {
    return 'an app running on this computer';
  }
  return null;
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}
