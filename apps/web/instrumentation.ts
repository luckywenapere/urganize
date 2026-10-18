// Server-side instrumentation (URG-372): loads the Sentry config for whichever
// runtime is booting, and reports every error thrown while handling a request
// (server components, route handlers, server actions) through onRequestError.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
