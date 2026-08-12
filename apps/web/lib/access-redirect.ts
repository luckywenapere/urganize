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

const SAFE_PATHS = new Set(['/locked', '/auth', '/onboarding', '/invite', '/redeem']);

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

/**
 * Speculative background requests (the release-scene prefetch) opt out of the
 * redirect by carrying this header. A prefetch the user never asked for must
 * not be able to navigate them off the page they're reading — if their access
 * really has lapsed, the next request they DO initiate carries the same 402
 * and redirects then, which is the moment it makes sense to.
 */
const PREFETCH_HEADER = 'x-urganize-prefetch';

const isPrefetchRequest = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  const headers = init?.headers;
  if (headers) {
    if (headers instanceof Headers) return headers.has(PREFETCH_HEADER);
    if (Array.isArray(headers)) {
      return headers.some(([name]) => String(name).toLowerCase() === PREFETCH_HEADER);
    }
    if (
      Object.keys(headers).some((name) => name.toLowerCase() === PREFETCH_HEADER)
    ) {
      return true;
    }
  }
  if (typeof input === 'object' && input !== null && 'headers' in input) {
    const requestHeaders = (input as Request).headers;
    if (requestHeaders && typeof requestHeaders.has === 'function') {
      return requestHeaders.has(PREFETCH_HEADER);
    }
  }
  return false;
};

let installed = false;

export function installAccessRedirect(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);

    if (response.status === 402 && isSameOrigin(input) && !isPrefetchRequest(input, init)) {
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
