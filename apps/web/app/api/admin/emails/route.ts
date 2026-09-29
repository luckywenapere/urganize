import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../_shared';
import { summarizeEmailLog, type EmailLogRow } from '@/lib/email/admin-summary';
import { EMAIL_LOG_TABLE } from '@/lib/email/log-server';
import { EMAIL_SUPPRESSIONS_TABLE } from '@/lib/email/suppression-server';

/**
 * GET /api/admin/emails — the founder's view of every email Urganize sends: the
 * recent log, what it adds up to, and who is suppressed.
 *
 * NOT flag-gated (the /admin/teams precedent): access is ADMIN_EMAILS through
 * verifyAdmin, and a failing send must stay visible whatever else is switched on.
 * READ ONLY on purpose. Lifting a suppression is not offered, because putting a
 * bounced or complaining address back on the list is how sender reputation gets
 * damaged, and it is not a decision to make with one click.
 *
 * The two reads fail independently: a table that has not been applied answers
 * for itself, so an unapplied migration is a named problem, not a blank page.
 */

const LOG_LIMIT = 300;
const SUPPRESSION_LIMIT = 200;

const LOG_COLUMNS = 'id,recipient,subject,template,category,status,trigger,error,created_at';

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const [logResult, suppressionResult] = await Promise.all([
    admin.supabaseAdmin
      .from(EMAIL_LOG_TABLE)
      .select(LOG_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(LOG_LIMIT),
    admin.supabaseAdmin
      .from(EMAIL_SUPPRESSIONS_TABLE)
      .select('id,email,scope,reason,created_at')
      .order('created_at', { ascending: false })
      .limit(SUPPRESSION_LIMIT),
  ]);

  const rows = (logResult.data || []) as EmailLogRow[];

  return NextResponse.json({
    log: logResult.error ? null : rows,
    logError: logResult.error?.message ?? null,
    summary: logResult.error ? null : summarizeEmailLog(rows),
    truncated: !logResult.error && rows.length >= LOG_LIMIT,
    suppressions: suppressionResult.error ? null : suppressionResult.data || [],
    suppressionsError: suppressionResult.error?.message ?? null,
  });
}
