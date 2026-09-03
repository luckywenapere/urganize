/**
 * Issue reporting — the server half: resolving trustworthy context, and the
 * per-user rate limit.
 *
 * NOTHING HERE THROWS. This runs while somebody is reporting that the product
 * is broken; a context lookup failing must never be the reason their report
 * does not get filed. Every field degrades on its own (the
 * `buildTeamAlertContext` posture: partial context is still useful), and a
 * field we could not read is left ABSENT rather than set to a misleading value
 * — `buildIssueDescription` omits absent fields entirely, so the Linear issue
 * simply does not claim a team rather than claiming an unknown one.
 *
 * WHY THIS DOES ITS OWN NARROW READS instead of calling
 * loadWorkspaceAccessContext: that resolver carries provision-on-miss WRITES
 * and a fair amount of machinery, and this is the one endpoint that has to keep
 * working when the rest of the app does not. A support path should depend on as
 * little of the thing being reported as possible.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_VERSION } from '@urganize/changelog';
import type { IssueReportContext } from './issue-reports';
import { getWorkspaceTier } from './team-billing-server';

const ISSUE_REPORTS_TABLE = 'issue_reports';

/**
 * How many reports one account may file per rolling hour.
 *
 * There is no rate limiting anywhere else in this repo (principle 6 — build for
 * the case we have). This endpoint earns one anyway: it is authenticated but
 * open to every user, and each call writes to a third party we do not control.
 * Ten is far above any honest use and far below anything that would matter.
 */
export const ISSUE_REPORT_RATE_LIMIT = 10;
export const ISSUE_REPORT_RATE_WINDOW_MS = 60 * 60 * 1000;

export type ResolvedReporter = {
  context: IssueReportContext;
  workspaceId: string | null;
  releaseId: string | null;
};

type ProfileRow = { name?: unknown; email?: unknown };
type MembershipRow = { workspace_id?: unknown; role?: unknown };
type WorkspaceRow = { id?: unknown; name?: unknown; owner_id?: unknown };
type ReleaseRow = { id?: unknown; title?: unknown; owner_user_id?: unknown };

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/**
 * Everything identifying on the report, read from the database rather than
 * taken from the request body.
 *
 * `clientContext` carries ONLY the two facts the browser alone knows: which
 * page they were on and which app version they are running. Accepting a name,
 * a plan or a team from the client would let anyone write whatever they liked
 * onto the Linear board.
 */
export async function resolveReporterContext(
  adminClient: SupabaseClient,
  user: { id: string; email?: string | null },
  clientContext: { pagePath?: string | null; releaseId?: string | null }
): Promise<ResolvedReporter> {
  const context: IssueReportContext = {
    reporterEmail: text(user.email),
    pagePath: text(clientContext.pagePath),
    appVersion: CURRENT_VERSION,
  };

  let workspaceId: string | null = null;
  let releaseId: string | null = null;

  try {
    const { data } = await adminClient
      .from('profiles')
      .select('name,email')
      .eq('id', user.id)
      .maybeSingle();
    const profile = (data || {}) as ProfileRow;
    context.reporterName = text(profile.name);
    context.reporterEmail = context.reporterEmail || text(profile.email);
  } catch {
    // Their email from the auth token is enough to reply to.
  }

  try {
    // The team they actually work in: an owned workspace first (a person who
    // owns one is reporting about it), else the first team they joined.
    const { data: owned } = await adminClient
      .from('workspaces')
      .select('id,name,owner_id')
      .eq('owner_id', user.id)
      .maybeSingle();

    let workspace = (owned || null) as WorkspaceRow | null;
    let role: string | null = workspace ? 'owner' : null;

    if (!workspace) {
      const { data: membership } = await adminClient
        .from('workspace_members')
        .select('workspace_id,role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const memberWorkspaceId = text((membership as MembershipRow | null)?.workspace_id);
      if (memberWorkspaceId) {
        role = text((membership as MembershipRow | null)?.role);
        const { data: joined } = await adminClient
          .from('workspaces')
          .select('id,name,owner_id')
          .eq('id', memberWorkspaceId)
          .maybeSingle();
        workspace = (joined || null) as WorkspaceRow | null;
      }
    }

    if (workspace) {
      workspaceId = text(workspace.id);
      context.workspaceName = text(workspace.name);
      context.role = role;
    }
  } catch {
    // A report with no team on it is still a report.
  }

  if (workspaceId) {
    try {
      // Resolved from the team, not sent by the client — the same reason
      // getWorkspaceTier exists for the seat cap.
      context.plan = await getWorkspaceTier(workspaceId);
    } catch {
      // Tier is a nice-to-have on a bug report.
    }
  }

  const claimedReleaseId = text(clientContext.releaseId);
  if (claimedReleaseId) {
    try {
      // Confirm the release exists before naming it. A client-supplied id that
      // resolves to nothing is dropped rather than printed — a Linear issue
      // pointing at a release that does not exist is worse than one with no
      // release on it. Deliberately NOT an access check: this is a label on a
      // support ticket, not a data read, and the only thing it exposes is a
      // title back to the person who was already looking at the page.
      const { data } = await adminClient
        .from('releases')
        .select('id,title')
        .eq('id', claimedReleaseId)
        .maybeSingle();
      const release = (data || null) as ReleaseRow | null;
      if (release) {
        releaseId = text(release.id);
        context.releaseId = releaseId;
        context.releaseTitle = text(release.title);
      }
    } catch {
      // Ignore — the page path usually carries the id anyway.
    }
  }

  return { context, workspaceId, releaseId };
}

/**
 * True when this account has already filed its allowance this hour.
 *
 * FAILS OPEN on an unreadable count, like every other counter in this codebase
 * (seats, releases, UrgAns actions): wrongly refusing somebody's bug report is
 * worse than wrongly allowing an eleventh one.
 */
export async function hasExceededIssueReportRate(
  adminClient: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - ISSUE_REPORT_RATE_WINDOW_MS).toISOString();
    const { count, error } = await adminClient
      .from(ISSUE_REPORTS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('reporter_user_id', userId)
      .gte('created_at', since);

    if (error || typeof count !== 'number') return false;
    return count >= ISSUE_REPORT_RATE_LIMIT;
  } catch {
    return false;
  }
}

export { ISSUE_REPORTS_TABLE };
