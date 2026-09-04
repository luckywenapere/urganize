/**
 * Bundling PostHog's exception-autocapture extension instead of fetching it.
 *
 * ── WHY, because the obvious reading of this file is that it is unnecessary ──
 *
 * posthog-js does not ship exception capture in its main bundle. Turning
 * `capture_exceptions` on makes the SDK lazily fetch a SECOND script,
 * `/static/exception-autocapture.js`, and only then start listening. Nothing
 * about the app looks different when that fetch fails — the crashes just go
 * unrecorded, which is precisely the failure this whole feature exists to
 * catch.
 *
 * That fetch is blocked for real users. Content blockers match on the URL PATH
 * as well as the host, so moving PostHog behind our own /urg-relay proxy
 * (2026-09-04) was necessary but not sufficient: the proxy path is opaque, the
 * FILENAMES underneath are not. Measured in production, same-origin, with the
 * proxy live:
 *
 *     Loading failed for the <script> with source
 *     "https://app.urganize.app/urg-relay/static/posthog-recorder.js?v=1.364.7"
 *     "https://app.urganize.app/urg-relay/static/dead-clicks-autocapture.js?v=1.364.7"
 *
 * Same session also blocked Vercel's own same-origin
 * /_vercel/insights/script.js, which is what proves this is filename matching
 * rather than anything we serve — that path is on the public blocklists too.
 *
 * A script we import ourselves lands in a webpack chunk under
 * /_next/static/chunks/ with a hashed name, so there is nothing left to match.
 * The extension bundle is 11.7 KB and self-registers on
 * window.__PosthogExtensions__ at module evaluation, which is exactly what the
 * network copy would have done.
 *
 * ── WHY NOT module.full.no-external.js ──────────────────────────────────────
 *
 * posthog-js ships a build with every extension inlined and no loader at all.
 * It is 445 KB against the current 181 KB, and it carries surveys, product
 * tours and web vitals that this app does not use. This repo deleted an entire
 * animation library over 13 fade-ins because of what it cost on a Nigerian
 * mobile link; 264 KB to reach one 11.7 KB extension is the same trade in the
 * wrong direction.
 *
 * ── WHY THE GUARD BELOW ─────────────────────────────────────────────────────
 *
 * The core's loader is not an if/else. Reduced from the minified bundle:
 *
 *     if (__PosthogExtensions__?.errorWrappingFunctions) { start() }
 *     __PosthogExtensions__?.loadExternalDependency?.(instance, name, start)
 *
 * Both statements run. So with the extension bundled, an UNBLOCKED browser
 * starts capture from our copy and then fetches the network copy and starts it
 * AGAIN — and the start path assigns its listener handles over the previous
 * ones without unsubscribing, so every thrown error would be reported twice.
 * The guard drops that one redundant fetch. It is a deliberate monkey-patch of
 * a third-party internal, which is why the behaviour is pinned by tests rather
 * than left to a comment.
 */

/**
 * Extensions this app imports directly, so the SDK must not also fetch them.
 *
 * Adding a name here is a claim that the corresponding `import()` exists in
 * client.ts. Getting that wrong disables the extension outright rather than
 * degrading it — hence the errorWrappingFunctions precondition below, which
 * refuses to install the guard when the bundled copy is not actually present.
 */
export const BUNDLED_POSTHOG_EXTENSIONS = ['exception-autocapture'] as const;

type PostHogExtensionLoader = (
  instance: unknown,
  name: string,
  callback: (error?: unknown) => void
) => void;

type PostHogExtensionBag = {
  loadExternalDependency?: PostHogExtensionLoader;
  /** Registered by exception-autocapture.js — the core checks this exact key. */
  errorWrappingFunctions?: unknown;
};

type PostHogExtensionScope = {
  __PosthogExtensions__?: PostHogExtensionBag;
};

const GUARD_FLAG = '__urganizeBundledExtensionGuard';

export function shouldLoadExternalPostHogExtension(name: string): boolean {
  return !(BUNDLED_POSTHOG_EXTENSIONS as readonly string[]).includes(name);
}

/**
 * Wrap PostHog's external-script loader so a bundled extension is not also
 * fetched. Returns whether the guard was installed.
 *
 * Refuses in three cases, all of which mean "leave PostHog exactly as it was":
 * the extension bag does not exist yet, there is no loader to wrap, or the
 * bundled copy did not register — that last one is the safety property. A
 * blocked or failed chunk import must fall back to the network fetch, because
 * a redundant request is a console line and no capture at all is a silent hole.
 */
export function installBundledExtensionGuard(scope: object): boolean {
  // Typed as `object` rather than PostHogExtensionScope so `window` is a legal
  // argument: every field on that type is optional, which makes it a weak type
  // TypeScript refuses to match against Window ("no properties in common").
  const extensions = (scope as PostHogExtensionScope).__PosthogExtensions__;
  if (!extensions) return false;

  const original = extensions.loadExternalDependency;
  if (typeof original !== 'function') return false;

  // The bundled copy must actually be here. See the docblock above.
  if (!extensions.errorWrappingFunctions) return false;

  const bag = extensions as PostHogExtensionBag & { [GUARD_FLAG]?: boolean };
  if (bag[GUARD_FLAG]) return false;

  extensions.loadExternalDependency = (instance, name, callback) => {
    if (!shouldLoadExternalPostHogExtension(name)) return;
    original(instance, name, callback);
  };
  bag[GUARD_FLAG] = true;

  return true;
}
