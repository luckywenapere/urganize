/**
 * Describing a failed image upload for telemetry, without leaking anything.
 *
 * Pure so it can be unit tested, and so both uploaders describe a failure the
 * same way. Pairs with the `asset_upload_failed` event in lib/analytics/shared.ts.
 *
 * WHY: both upload flows already catch every error and set a message that only
 * the person at the screen ever sees. When a partner reports "it doesn't
 * upload", that message is gone, and asking them to open a browser console is
 * not something you can do to a customer. This turns the same failure into one
 * event the founder can read.
 *
 * The sanitiser is the load-bearing part. An upload error message can carry a
 * file name (the user's, often their artist name) or a signed Storage URL (a
 * live credential for an hour). Neither belongs in analytics, so the reason is
 * reduced to a short, bounded, allowlisted classification rather than passed
 * through.
 */

export type UploadSurface = 'workspace_logo' | 'curator_photo';
export type UploadStep = 1 | 2 | 3;

export type UploadFailureReport = {
  surface: UploadSurface;
  step: UploadStep;
  status?: number;
  reason: string;
};

/** Longest reason we will send. Anything longer is a message, not a class. */
const MAX_REASON_LENGTH = 60;

/**
 * Classify a failure into something safe to send.
 *
 * Deliberately an allowlist of shapes rather than a denylist of secrets: a
 * denylist would need to anticipate every way a file name or URL can appear in
 * an error string, and it only takes one miss to publish someone's credential.
 */
export function classifyUploadFailure(input: {
  status?: number | null;
  message?: string | null;
}): string {
  const status = Number(input.status);
  if (Number.isFinite(status) && status > 0) {
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not_found';
    if (status === 413) return 'too_large';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server_error';
    if (status >= 400) return 'rejected';
    return 'http_other';
  }

  const message = String(input.message ?? '').toLowerCase();
  if (!message) return 'unknown';
  // No response at all. The single most useful class here, because it is the
  // one the user's connection causes rather than our code.
  if (message.includes('failed to fetch') || message.includes('networkerror')) return 'network';
  if (message.includes('session') || message.includes('sign in')) return 'session_expired';
  if (message.includes('abort')) return 'aborted';
  return 'unknown';
}

export function buildUploadFailureReport(input: {
  surface: UploadSurface;
  step: UploadStep;
  status?: number | null;
  message?: string | null;
}): UploadFailureReport {
  const status = Number(input.status);
  return {
    surface: input.surface,
    step: input.step,
    ...(Number.isFinite(status) && status > 0 ? { status } : {}),
    reason: classifyUploadFailure(input).slice(0, MAX_REASON_LENGTH),
  };
}
