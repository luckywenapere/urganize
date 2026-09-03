import { NextResponse, type NextRequest } from 'next/server';
import {
  createAdminClient,
  flagOffResponse,
  getAuthenticatedUser,
  isIssueReportingEnabled,
} from './_shared';
import { buildIssueDescription, buildIssueTitle, validateIssueReport } from '@/lib/issue-reports';
import {
  ISSUE_REPORTS_TABLE,
  ISSUE_REPORT_RATE_LIMIT,
  hasExceededIssueReportRate,
  resolveReporterContext,
} from '@/lib/issue-reports-server';
import { createLinearIssue } from '@/lib/linear-server';

/**
 * File a bug report or a feature request. Mirrored to Linear.
 *
 * ── THIS ROUTE IS DELIBERATELY NOT BEHIND THE PAYWALL ───────────────────────
 *
 * It uses the OPEN helper (`getAuthenticatedUser`) rather than
 * `requireActiveAuthenticatedUser`, and that is the same call
 * `app/api/account/export` makes for a stronger version of the same reason: a
 * walled, read-only or payment-lapsed team must still be able to tell us
 * something is broken. The gated helper runs `requireActiveAccount`, which
 * answers 402, which `lib/access-redirect.ts` turns into a browser redirect to
 * `/locked` — so a walled user would be ejected from the app by the act of
 * reporting it. `lib/issue-reports-route-guard.test.ts` reads this file and
 * fails if any paywall wrapper appears in it.
 *
 * ── LINEAR NEVER FAILS THE SUBMISSION ───────────────────────────────────────
 *
 * The row is written FIRST and is the durable record; the Linear push is a
 * follow-up whose outcome lands in `status`. A failed push is a retry job in
 * /admin/issue-reports. The reporter is told we have it either way, because by
 * then we do.
 *
 * ── IDENTITY IS RESOLVED SERVER-SIDE ────────────────────────────────────────
 *
 * The client sends only what it alone knows: the page path, and the free text.
 * Name, email, team, plan, role and the release are read from the database
 * against the authenticated user id, so nobody can write a fake plan tier onto
 * the Linear board by editing a request body.
 */
export async function POST(request: NextRequest) {
  if (!isIssueReportingEnabled()) return flagOffResponse();

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let payload: Record<string, unknown> = {};
  try {
    payload = ((await request.json()) || {}) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const validated = validateIssueReport(payload);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  if (await hasExceededIssueReportRate(adminClient, auth.user.id)) {
    return NextResponse.json(
      {
        error: `That is ${ISSUE_REPORT_RATE_LIMIT} reports in an hour. Give it a moment, then send the next one.`,
      },
      { status: 429 }
    );
  }

  const pagePath = typeof payload.pagePath === 'string' ? payload.pagePath : null;
  const claimedReleaseId = typeof payload.releaseId === 'string' ? payload.releaseId : null;

  const resolved = await resolveReporterContext(adminClient, auth.user, {
    pagePath,
    releaseId: claimedReleaseId,
  });

  const { data: inserted, error: insertError } = await adminClient
    .from(ISSUE_REPORTS_TABLE)
    .insert({
      reporter_user_id: auth.user.id,
      workspace_id: resolved.workspaceId,
      release_id: resolved.releaseId,
      kind: validated.value.kind,
      title: validated.value.title,
      body: validated.value.body,
      context: resolved.context,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[issue-reports] insert failed', insertError?.message);
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 });
  }

  const reportId = (inserted as { id: string }).id;

  const linear = await createLinearIssue({
    kind: validated.value.kind,
    title: buildIssueTitle(validated.value.kind, validated.value.title),
    description: buildIssueDescription({
      body: validated.value.body,
      context: resolved.context,
    }),
  });

  // Best-effort: the report is already saved, so a failure to record the
  // outcome must not turn a filed report into an error for the reporter.
  try {
    await adminClient
      .from(ISSUE_REPORTS_TABLE)
      .update(
        linear.ok
          ? {
              status: 'synced',
              linear_issue_id: linear.issue.id,
              linear_identifier: linear.issue.identifier,
              linear_url: linear.issue.url,
              sync_error: null,
              attempts: 1,
            }
          : { status: 'failed', sync_error: linear.error, attempts: 1 }
      )
      .eq('id', reportId);
  } catch (error) {
    console.error('[issue-reports] could not record sync outcome', (error as Error)?.message);
  }

  return NextResponse.json(
    {
      id: reportId,
      // Present only when Linear actually took it — the dialog says "we've got
      // it" either way rather than showing an identifier we invented.
      reference: linear.ok ? linear.issue.identifier : null,
    },
    { status: 201 }
  );
}
