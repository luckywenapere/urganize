// Pure FCM HTTP v1 message-shape helpers — no network, no env, no Node
// crypto. Kept separate from fcm-server.ts (which does the OAuth + network
// work) so the message contract and the error-classification rule can be
// unit tested without mocking fetch or a service account.

import type { PushPayload } from '@/lib/push-server';

export type FcmSendOutcome = 'sent' | 'prune' | 'error';

/**
 * Builds the body for a single POST to
 * https://fcm.googleapis.com/v1/projects/{project_id}/messages:send.
 *
 * `notification` drives the system tray display when the app is
 * backgrounded/killed; `data` carries the same fields so the client's
 * pushNotificationActionPerformed / pushNotificationReceived handlers can
 * read them without re-parsing notification text. `android.notification.tag`
 * gives Android the same collapse-by-tag behavior Web Push gets from the
 * `tag` field in public/sw.js — a newer notification with the same tag
 * replaces the older one in the system tray instead of stacking.
 */
export function buildFcmMessage(token: string, payload: PushPayload): Record<string, unknown> {
  const url = payload.url || '/dashboard';
  const tag = payload.tag || '';

  return {
    message: {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        url,
        tag,
      },
      android: {
        notification: {
          tag: tag || undefined,
        },
        collapse_key: tag || undefined,
      },
    },
  };
}

/**
 * Classifies an FCM error response so the caller knows whether to prune the
 * device token (it will never succeed again) or just log and move on.
 *
 * FCM v1 returns 404 for a token that no longer exists, and 400 with
 * errorCode UNREGISTERED or an "Invalid registration token"-style message
 * for tokens the app itself invalidated. Everything else (429 rate limit,
 * 5xx, network errors) is transient and must not delete a user's device.
 */
export function classifyFcmError(status: number, body: unknown): 'prune' | 'other' {
  if (status === 404) return 'prune';

  const errorCode = extractErrorCode(body);
  if (errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT') return 'prune';

  return 'other';
}

function extractErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;

  const details = (error as { details?: unknown }).details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (detail && typeof detail === 'object' && 'errorCode' in detail) {
        const code = (detail as { errorCode?: unknown }).errorCode;
        if (typeof code === 'string') return code;
      }
    }
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === 'string' ? status : null;
}
