import { initializeBrowserPostHog } from './lib/analytics';

// Fire-and-forget: init is async now (posthog-js loads as a deferred chunk
// instead of riding the first-load bundle), and nothing here needs to await
// it — autocapture/session recording attach once the chunk arrives.
void initializeBrowserPostHog();
