import { captureServerAnalyticsEvent, createServerPostHogClient, shutdownServerAnalytics } from './analytics/server';
import { createPostHogEvent } from './analytics/shared';
import { afterResponse } from './after-response';
import {
  requestAnsweredProperties,
  requestSentProperties,
  type RequestAnsweredProperties,
  type RequestSentProperties,
} from './directory-events';

// Captures the directory's request events from the server (2026-10-10).
//
// WHY THE SERVER. A request being sent or answered is a fact the route knows
// for certain, and this app has already lost months of browser events to a
// content blocker once. The properties are built by lib/directory-events.ts
// from an allowlist, so no name, note or reply text can reach PostHog.
//
// NEVER THROWS and never delays the reply (afterResponse keeps the work alive
// without waiting for it). Missing an event costs a data point; failing a
// request because of it would cost a customer.

function capture(label: string, distinctId: string, name: 'request_sent' | 'request_answered', properties: RequestSentProperties | RequestAnsweredProperties) {
  afterResponse(label, async () => {
    const posthog = createServerPostHogClient();
    try {
      captureServerAnalyticsEvent(
        posthog,
        distinctId,
        name === 'request_sent'
          ? createPostHogEvent('request_sent', properties as RequestSentProperties)
          : createPostHogEvent('request_answered', properties as RequestAnsweredProperties)
      );
    } finally {
      await shutdownServerAnalytics(posthog);
    }
  });
}

export function captureRequestSent(
  senderUserId: string,
  request: { role: unknown; releaseId: string | null | undefined }
): void {
  capture('directory request_sent', senderUserId, 'request_sent', requestSentProperties(request));
}

export function captureRequestAnswered(
  answererUserId: string,
  request: {
    role: unknown;
    createdAt: string | null | undefined;
    reply: string | null | undefined;
    status: 'interested' | 'passed';
  }
): void {
  capture('directory request_answered', answererUserId, 'request_answered', requestAnsweredProperties(request));
}
