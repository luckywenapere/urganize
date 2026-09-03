import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdmin } from '../_shared';
import { buildIssueDescription, buildIssueTitle, isIssueKind } from '@/lib/issue-reports';
import { ISSUE_REPORTS_TABLE } from '@/lib/issue-reports-server';
import { createLinearIssue, isLinearConfigured } from '@/lib/linear-server';

/**
 * The founder's view of what users have reported, and the retry for anything
 * Linear refused or never received.
 *
 * DELIBERATELY NOT FLAG-GATED — the /admin/teams precedent. Access is
 * ADMIN_EMAILS via verifyAdmin, and a failed sync must stay visible whether or
 * not the reporting feature itself is currently switched on.
 */

const LIST_LIMIT = 200;

const COLUMNS =
  'id,reporter_user_id,workspace_id,release_id,kind,title,body,context,status,linear_issue_id,linear_identifier,linear_url,sync_error,attempts,created_at,updated_at';

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const { data, error } = await adminResult.supabaseAdmin
    .from(ISSUE_REPORTS_TABLE)
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load reports.' },
      { status: 500 }
    );
  }

  const reports = (data || []) as Array<Record<string, unknown>>;
  const counts = reports.reduce<Record<string, number>>((acc, row) => {
    const status = String(row.status || 'pending');
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    reports,
    counts,
    linearConfigured: isLinearConfigured(),
  });
}

/** Retry one report's Linear push. */
export async function POST(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  let payload: Record<string, unknown> = {};
  try {
    payload = ((await req.json()) || {}) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const reportId = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!reportId) {
    return NextResponse.json({ error: 'A report id is required.' }, { status: 400 });
  }

  const { data, error } = await adminResult.supabaseAdmin
    .from(ISSUE_REPORTS_TABLE)
    .select(COLUMNS)
    .eq('id', reportId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load that report.' }, { status: 500 });
  }
  const report = (data || null) as Record<string, unknown> | null;
  if (!report) {
    return NextResponse.json({ error: 'That report does not exist.' }, { status: 404 });
  }

  // Already in Linear: return what we have rather than filing a duplicate.
  if (report.status === 'synced') {
    return NextResponse.json({ status: 'synced', linearUrl: report.linear_url ?? null });
  }

  const kind = isIssueKind(report.kind) ? report.kind : 'bug';
  const linear = await createLinearIssue({
    kind,
    title: buildIssueTitle(kind, String(report.title || 'Report')),
    description: buildIssueDescription({
      body: String(report.body || ''),
      context: (report.context || {}) as Record<string, string | null>,
    }),
  });

  const attempts = typeof report.attempts === 'number' ? report.attempts + 1 : 1;

  const { error: updateError } = await adminResult.supabaseAdmin
    .from(ISSUE_REPORTS_TABLE)
    .update(
      linear.ok
        ? {
            status: 'synced',
            linear_issue_id: linear.issue.id,
            linear_identifier: linear.issue.identifier,
            linear_url: linear.issue.url,
            sync_error: null,
            attempts,
          }
        : { status: 'failed', sync_error: linear.error, attempts }
    )
    .eq('id', reportId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Could not record the retry.' },
      { status: 500 }
    );
  }

  if (!linear.ok) {
    return NextResponse.json({ status: 'failed', error: linear.error }, { status: 200 });
  }

  return NextResponse.json({
    status: 'synced',
    linearUrl: linear.issue.url,
    reference: linear.issue.identifier,
  });
}
