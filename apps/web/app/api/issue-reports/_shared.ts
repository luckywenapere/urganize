import { NextResponse } from 'next/server';

export { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';

/**
 * Checked FIRST in every handler, before auth, so an unauthenticated probe
 * cannot tell a switched-off feature from a route that does not exist — and so
 * a direct API call cannot reach the feature while the UI is dark (the EPK /
 * notes precedent).
 */
export const isIssueReportingEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_REPORT_ISSUE === 'true';

/** The exact body every flag gate in this app answers with. */
export const flagOffResponse = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });
