/**
 * posthog-js ships its lazily-loaded extensions as untyped IIFE bundles under
 * dist/. We import one of them directly so it lands in our own webpack chunk
 * rather than being fetched from a PostHog-shaped URL a content blocker will
 * refuse — see lib/analytics/posthog-extensions.ts for why.
 *
 * Declared rather than cast at the call site so webpack can still resolve the
 * specifier statically. The module has no exports: it self-registers on
 * window.__PosthogExtensions__ when evaluated.
 */
declare module 'posthog-js/dist/exception-autocapture.js';
