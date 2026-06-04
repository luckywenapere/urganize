// Global 402 interception. Monkey-patches window.fetch once on module load so
// that any API response with `402 Payment Required` (the global access gate)
// drops the user on /locked with the gate's `reason` query string.
//
// Why patch fetch and not introduce a typed wrapper? The codebase has dozens
// of ad-hoc `fetch('/api/...')` calls in components and stores. A wrapper
// would require touching every call site. The monkey-patch catches them all
// in one place, including future ones.
//
// Imported (for side effects) from apps/web/lib/auth-store.ts so the
// interceptor installs as soon as any client-side code touches auth.

const SAFE_PATHS = new Set(['/locked', '/auth', '/onboarding']);

const isSafePath = (pathname: string): boolean => {
  if (SAFE_PATHS.has(pathname)) return true;
  for (const safe of SAFE_PATHS) {
    if (pathname.startsWith(`${safe}/`)) return true;
  }
  return false;
};

const extractReason = async (response: Response): Promise<string> => {
  try {
    const cloned = response.clone();
    const payload = (await cloned.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof payload.reason === 'string' ? payload.reason : '';
    return reason || 'unpaid';
  } catch {
    return 'unpaid';
  }
};

const isSameOrigin = (input: RequestInfo | URL): boolean => {
  try {
    const url =
      typeof input === 'string'
        ? new URL(input, window.location.href)
        : input instanceof URL
          ? input
          : new URL((input as Request).url, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    // Relative paths default to same-origin.
    return typeof input === 'string' && !input.startsWith('http');
  }
};

let installed = false;

export function installAccessRedirect(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);

    if (response.status === 402 && isSameOrigin(input)) {
      const currentPath = window.location.pathname || '/';
      if (!isSafePath(currentPath)) {
        const reason = await extractReason(response);
        const target = `/locked?reason=${encodeURIComponent(reason)}`;
        // Defer the redirect so the calling code's try/catch and React
        // commit cycle complete before we navigate away. Avoids tearing
        // through a render in progress.
        setTimeout(() => {
          if (window.location.pathname !== '/locked') {
            window.location.replace(target);
          }
        }, 0);
      }
    }

    return response;
  };
}
