// Emails a team's owner when the founder gives the team free access or extends
// its free trial. Server only.
//
// Every such change sends one email, live, from the team billing console. The
// backfill catches up the changes made before that existed: one email per past
// comp or trial extension, plus one for a team that is comped now but has no
// comp row in the ledger (comped before the ledger recorded it).
//
// NOTHING HERE THROWS. The change has already been made by the time we send, so
// a failed email must never fail the admin action that made it.
//
// THE BACKFILL IS ONCE ONLY. Each email carries a dedupe key: the ledger row's
// id, or the workspace id for a comp with no row. Before sending, the backfill
// looks for a log row with that key that is still pending, sent or delivered,
// and skips it. A run that is interrupted, or pressed twice, sends nothing twice.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailConfigured, sendEmail } from './email';
import type { TeamAdminNoticeKind } from './email/templates/TeamAdminNoticeEmail';

const EMAIL_LOG_TABLE = 'email_log';
const BILLING_EVENTS_TABLE = 'billing_events';

/** Statuses that mean the email is on its way or arrived. A failed or skipped
 *  row does not count, so a backfill run retries it. */
const DONE_STATUSES = ['pending', 'sent', 'delivered', 'delayed'];

/** One press sends at most this many, so it finishes inside the function limit.
 *  Press again for the rest; the dedupe keys make that safe. */
export const BACKFILL_RUN_LIMIT = 80;

/** The ledger actions that earn a notice, and the notice each one earns. */
const EVENT_KIND: Record<string, TeamAdminNoticeKind> = {
  comped: 'comped',
  trial_extended: 'trial_extended',
};

export type TeamNoticeWhen = 'now' | 'earlier';

export type SendTeamNoticeInput = {
  workspaceId: string;
  ownerUserId: string;
  kind: TeamAdminNoticeKind;
  when: TeamNoticeWhen;
  trigger: string;
  actorUserId?: string | null;
  /** Resend's idempotency header (24 hours). Live sends only. */
  idempotencyKey?: string;
  /** The log row's dedupe key. Backfill sends only. */
  dedupeKey?: string | null;
};

export type SendTeamNoticeResult = 'sent' | 'skipped' | 'failed';

/** Emails a team's owner about one change. Never throws. */
export async function sendTeamAdminNotice(
  admin: SupabaseClient,
  input: SendTeamNoticeInput
): Promise<SendTeamNoticeResult> {
  try {
    if (!isEmailConfigured()) return 'skipped';

    const { data: userData } = await admin.auth.admin.getUserById(input.ownerUserId);
    const email = userData?.user?.email;
    if (!email) return 'skipped';
    const metadataName = userData.user?.user_metadata?.name;

    // The trial line is only true while the trial still has time left, so it is
    // read now rather than taken from the ledger.
    let trialEndsAt: string | null = null;
    if (input.kind === 'trial_extended') {
      const { data: workspace } = await admin
        .from('workspaces')
        .select('trial_ends_at')
        .eq('id', input.workspaceId)
        .maybeSingle();
      const ends = (workspace as { trial_ends_at: string | null } | null)?.trial_ends_at ?? null;
      if (ends && Date.parse(ends) > Date.now()) trialEndsAt = ends;
    }

    const result = await sendEmail(admin, {
      templateId: 'team_admin_notice',
      to: email,
      props: {
        recipientName: typeof metadataName === 'string' ? metadataName : '',
        kind: input.kind,
        when: input.when,
        trialEndsAt,
      },
      trigger: input.trigger,
      recipientUserId: input.ownerUserId,
      actorUserId: input.actorUserId ?? null,
      idempotencyKey: input.idempotencyKey,
      dedupeKey: input.dedupeKey ?? null,
    });
    if (result.ok) return 'sent';
    if (result.skipped) return 'skipped';
    console.error('[team-notices] send failed', input.kind, result.error);
    return 'failed';
  } catch (error) {
    console.error('[team-notices] send threw', error instanceof Error ? error.message : error);
    return 'failed';
  }
}

// ----------------------------------------------------------------- backfill

export type BackfillItem = {
  /** The dedupe key on the email log: `team-notice:<ledger id>` for a ledger
   *  row, `team-notice:comp-state:<workspace id>` for a comp with no row. */
  key: string;
  workspaceId: string;
  ownerUserId: string;
  kind: TeamAdminNoticeKind;
};

export type BackfillPlan = {
  /** Every change that should have an email and does not yet. */
  toSend: BackfillItem[];
  /** Changes whose email already went out, so a run skips them. */
  alreadySent: number;
  /** Changes whose team has no owner to email. */
  noOwner: number;
};

/** Reads what should have been emailed and what already was. Writes nothing. */
export async function planTeamNoticeBackfill(admin: SupabaseClient): Promise<BackfillPlan> {
  const candidates: BackfillItem[] = [];
  const coveredWorkspaces = new Set<string>();
  let noOwner = 0;

  const { data: events, error: eventsError } = await admin
    .from(BILLING_EVENTS_TABLE)
    .select('id, workspace_id, owner_user_id, type')
    .in('type', Object.keys(EVENT_KIND))
    .order('created_at', { ascending: true })
    .limit(5000);
  if (eventsError) throw new Error(`Could not read the ledger: ${eventsError.message}`);

  for (const row of (events ?? []) as Array<{
    id: string;
    workspace_id: string | null;
    owner_user_id: string | null;
    type: string;
  }>) {
    const kind = EVENT_KIND[row.type];
    if (!kind || !row.workspace_id) continue;
    if (row.type === 'comped') coveredWorkspaces.add(row.workspace_id);
    if (!row.owner_user_id) {
      noOwner += 1;
      continue;
    }
    candidates.push({
      key: `team-notice:${row.id}`,
      workspaceId: row.workspace_id,
      ownerUserId: row.owner_user_id,
      kind,
    });
  }

  // A team comped now with no comp row in the ledger: comped before the ledger
  // recorded it. One email, keyed on the workspace.
  const { data: comped, error: compedError } = await admin
    .from('workspaces')
    .select('id, owner_id')
    .not('comped_at', 'is', null);
  if (compedError) throw new Error(`Could not read comped teams: ${compedError.message}`);
  for (const row of (comped ?? []) as Array<{ id: string; owner_id: string | null }>) {
    if (coveredWorkspaces.has(row.id)) continue;
    if (!row.owner_id) {
      noOwner += 1;
      continue;
    }
    candidates.push({
      key: `team-notice:comp-state:${row.id}`,
      workspaceId: row.id,
      ownerUserId: row.owner_id,
      kind: 'comped',
    });
  }

  const done = await loadDoneKeys(admin, candidates.map((c) => c.key));
  const toSend = candidates.filter((c) => !done.has(c.key));
  return { toSend, alreadySent: candidates.length - toSend.length, noOwner };
}

async function loadDoneKeys(admin: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  for (let start = 0; start < keys.length; start += 100) {
    const chunk = keys.slice(start, start + 100);
    const { data, error } = await admin
      .from(EMAIL_LOG_TABLE)
      .select('dedupe_key')
      .in('dedupe_key', chunk)
      .in('status', DONE_STATUSES);
    if (error) throw new Error(`Could not read the email log: ${error.message}`);
    for (const row of (data ?? []) as Array<{ dedupe_key: string | null }>) {
      if (row.dedupe_key) done.add(row.dedupe_key);
    }
  }
  return done;
}

export type BackfillRunResult = { sent: number; skipped: number; failed: number; remaining: number };

/** Sends up to BACKFILL_RUN_LIMIT of the plan, one at a time. */
export async function runTeamNoticeBackfill(
  admin: SupabaseClient,
  items: BackfillItem[],
  actorUserId: string
): Promise<BackfillRunResult> {
  const batch = items.slice(0, BACKFILL_RUN_LIMIT);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of batch) {
    const result = await sendTeamAdminNotice(admin, {
      workspaceId: item.workspaceId,
      ownerUserId: item.ownerUserId,
      kind: item.kind,
      when: 'earlier',
      trigger: `backfill_${item.kind}`,
      actorUserId,
      dedupeKey: item.key,
    });
    if (result === 'sent') sent += 1;
    else if (result === 'skipped') skipped += 1;
    else failed += 1;
  }
  return { sent, skipped, failed, remaining: items.length - batch.length };
}
