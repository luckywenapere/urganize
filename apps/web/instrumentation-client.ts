import { initializeBrowserPostHog } from './lib/analytics';
import { startErrorMonitoring } from './lib/monitoring/report';

// Fire-and-forget: init is async now (posthog-js loads as a deferred chunk
// instead of riding the first-load bundle), and nothing here needs to await
// it — autocapture/session recording attach once the chunk arrives.
void initializeBrowserPostHog();

// Sentry, errors only (URG-372). The SDK loads as its own chunk after the page
// has loaded; errors thrown before then are queued and sent once it arrives.
startErrorMonitoring();
