/**
 * posthog-js ships its lazily-loaded extensions as untyped IIFE bundles under
 * dist/. We import them directly so they land in our own webpack chunks rather
 * than being fetched from PostHog-shaped URLs a content blocker will refuse —
 * see lib/analytics/posthog-extensions.ts for why.
 *
 * Declared rather than cast at the call site so webpack can still resolve each
 * specifier statically and emit a chunk for it. None of them export anything:
 * they self-register on window.__PosthogExtensions__ when evaluated.
 */
declare module 'posthog-js/dist/*.js';
