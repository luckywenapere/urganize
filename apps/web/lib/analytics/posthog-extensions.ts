/**
 * Serving PostHog's lazily-loaded extensions from our own bundle instead of
 * letting the SDK fetch them.
 *
 * ── WHY, because the obvious reading of this file is that it is unnecessary ──
 *
 * posthog-js keeps its heavier features out of the main bundle and fetches
 * them on demand from `/static/<name>.js`. Three of them matter here: exception
 * capture, session replay, and dead-click autocapture. Every one of those
 * fetches is refused for a real share of our users.
 *
 * CONTENT BLOCKERS MATCH THE URL PATH, NOT ONLY THE HOST. That is the whole
 * finding, and it is why the reverse proxy (2026-09-04, lib/analytics/
 * posthog-proxy.ts) was necessary and not sufficient: the proxy path
 * `/urg-relay` is opaque, the filenames underneath are not. Measured in
 * production, same-origin, with the proxy live:
 *
 *     Loading failed for the <script> with source
 *     "https://app.urganize.app/urg-relay/static/posthog-recorder.js?v=1.364.7"
 *     "https://app.urganize.app/urg-relay/static/dead-clicks-autocapture.js?v=1.364.7"
 *
 * The same session also refused Vercel's own same-origin
 * /_vercel/insights/script.js, which is what proved this is filename matching
 * rather than anything we serve — this app sets no CSP at all.
 *
 * An `import()` lands in a hashed webpack chunk under /_next/static/chunks/,
 * so there is nothing left to match.
 *
 * ── WHY A LOADER MAP RATHER THAN EAGER IMPORTS ──────────────────────────────
 *
 * The first version of this (#494) imported the exception bundle eagerly and
 * suppressed the SDK's own fetch. That does not scale to session replay:
 * posthog-recorder is 250 KB, and eagerly importing it would download a
 * quarter of a megabyte on every page load for every user whether or not
 * recording ever starts. This repo deleted an animation library over 13
 * fade-ins because of what it cost on a Nigerian mobile link.
 *
 * So we REPLACE the loader instead. Each entry is its own `import()`, so
 * webpack emits a separate chunk and the browser fetches it at exactly the
 * moment PostHog would have fetched the CDN copy — same timing, same laziness,
 * our origin. Extensions we do not map fall through untouched.
 *
 * ── WHY EVERY RECORDER VARIANT ──────────────────────────────────────────────
 *
 * "posthog-recorder" is NOT a literal in posthog-js's core; the recorder's
 * script name comes from remote config, and PostHog ships four of them. Mapping
 * only the one in use today would let a server-side switch silently return
 * replay to blocked, which is precisely the failure mode this file exists to
 * end. They are separate chunks, so mapping all four costs deploy size and no
 * user transfer.
 *
 * ── WHAT IS DELIBERATELY NOT BUNDLED ────────────────────────────────────────
 *
 * `remote-config` resolves to /array/<token>/config.js, which is per-project
 * and generated — there is no static file to import. `toolbar` only ever loads
 * for a signed-in PostHog user. Both keep the network path.
 */

type ExtensionBundleLoader = () => Promise<unknown>;

/**
 * Extension name → the chunk that registers it.
 *
 * Each value must be a bare `import()` of a literal specifier, or webpack
 * cannot see it and will not emit a chunk. Adding an entry is a claim that the
 * file exists in posthog-js's dist; getting it wrong falls back to the network
 * fetch rather than breaking, because of the catch in the guard below.
 */
export const BUNDLED_POSTHOG_EXTENSION_LOADERS: Record<string, ExtensionBundleLoader> = {
  'exception-autocapture': () => import('posthog-js/dist/exception-autocapture.js'),
  'dead-clicks-autocapture': () => import('posthog-js/dist/dead-clicks-autocapture.js'),
  // Every recorder variant — see the docblock. The name is chosen remotely.
  'posthog-recorder': () => import('posthog-js/dist/posthog-recorder.js'),
  'lazy-recorder': () => import('posthog-js/dist/lazy-recorder.js'),
  recorder: () => import('posthog-js/dist/recorder.js'),
  'recorder-v2': () => import('posthog-js/dist/recorder-v2.js'),
};

type PostHogExtensionLoader = (
  instance: unknown,
  name: string,
  callback: (error?: unknown) => void
) => void;

type PostHogExtensionScope = {
  __PosthogExtensions__?: { loadExternalDependency?: PostHogExtensionLoader };
};

const GUARD_FLAG = '__urganizeBundledExtensionGuard';

export function isBundledPostHogExtension(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUNDLED_POSTHOG_EXTENSION_LOADERS, name);
}

/**
 * Replace PostHog's external-script loader with one that imports our own
 * chunks for the extensions we bundle. Returns whether the guard was installed.
 *
 * Must run AFTER posthog-js has been imported (it defines the loader at module
 * evaluation) and BEFORE `init`, which is when the SDK first asks for an
 * extension.
 *
 * `loaders` is injectable so the behaviour can be tested without pulling a
 * 250 KB bundle into the test run.
 */
export function installBundledExtensionGuard(
  scope: object,
  loaders: Record<string, ExtensionBundleLoader> = BUNDLED_POSTHOG_EXTENSION_LOADERS
): boolean {
  // Typed as `object` rather than PostHogExtensionScope so `window` is a legal
  // argument: every field on that type is optional, which makes it a weak type
  // TypeScript refuses to match against Window ("no properties in common").
  const extensions = (scope as PostHogExtensionScope).__PosthogExtensions__;
  if (!extensions) return false;

  const network = extensions.loadExternalDependency;
  if (typeof network !== 'function') return false;

  const bag = extensions as typeof extensions & { [GUARD_FLAG]?: boolean };
  if (bag[GUARD_FLAG]) return false;

  // Names whose chunk has already been imported and whose callback has already
  // been fired once. See the second test: the core is not an if/else, so on a
  // re-trigger it starts capture itself from the registered copy AND calls the
  // loader again. Firing the callback a second time re-registers listeners over
  // the live ones without unsubscribing, which double-reports every event.
  const started = new Set<string>();

  extensions.loadExternalDependency = (instance, name, callback) => {
    const load = loaders[name];
    if (!load) {
      network(instance, name, callback);
      return;
    }

    if (started.has(name)) return;

    void load().then(
      () => {
        started.add(name);
        callback();
      },
      () => {
        // A chunk that will not load (offline, or a 404 after a deploy) must
        // fall back rather than silently disable the feature. The fetch is
        // probably blocked too, but a blocked request is a console line and a
        // capability that just stops is invisible.
        network(instance, name, callback);
      }
    );
  };
  bag[GUARD_FLAG] = true;

  return true;
}
