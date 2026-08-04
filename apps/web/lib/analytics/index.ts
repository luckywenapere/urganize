export {
  captureAnalyticsEvent,
  captureAnalyticsPageView,
  captureFeatureDiscovery,
  captureFeatureDiscoveryByName,
  clearOnboardingTrackingState,
  clearTrackedEvents,
  getOnboardingElapsedSeconds,
  identifyAnalyticsUser,
  initializeBrowserPostHog,
  markOnboardingStarted,
  readTrackedEvents,
  resetAnalyticsUser,
  trackEvent,
} from './client';

export {
  createPostHogEvent,
  type AnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsEventPropertiesMap,
  type AnalyticsIdentity,
  type ReleaseCreatedSource,
  type StoredAnalyticsEvent,
} from './shared';
