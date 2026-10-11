import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailConfigured } from './email';
import { countEmailsSentToday } from './email/outbox-server';
import { BULK_RESERVE, readDailyEmailLimit } from './email/outbox';
import { captureServerAnalyticsEvent, createServerPostHogClient, shutdownServerAnalytics } from './analytics/server';
import { createPostHogEvent } from './analytics/shared';
import { IN_LIST_CHUNK, inChunks } from './paged-rows';
import { deliveredReleaseIds } from './claim-sweep-server';
import { revokeUnsentInvite } from './claim-server';
import { emailClaimLink, mintClaimLink } from './claim-owner-server';
import {
  afterSend,
  claimEmailBudget,
  claimEmailIdempotencyKey,
  CLAIM_REMINDER_DAYS,
  decideAutoInvite,
  decideReminder,
  isClaimAutoEmailEnabled,
  type AutoEmailCredit,
  type AutoEmailKind,
  type AutoEmailPerson,
  type AutoEmailRecord,
  type ClaimInviteHistory,
} from './claim-auto-email';

// The automatic claim email (2026-10-11), the IO half. The rules are in
// lib/claim-auto-email.ts; the link and the email go through the ONE path the
// owner's "Email" button uses (mintClaimLink + emailClaimLink in
// lib/claim-owner-server.ts).
//
// A passenger on the daily cron (/api/cron/due-date-notifications), after the
// sweep that makes unclaimed profiles, so somebody whose page was made this
// morning is emailed this morning. Off unless NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL
// (and the credits surface, NEXT_PUBLIC_FEATURE_METADATA) are 'true'.
//
// ONCE IS A ROW. person_claim_emails has one row per person per kind, unique.
// The row is inserted BEFORE the send, so a second run, or two cron calls on
// the same morning, lose the insert and send nothing. Only a send that
// certainly reached nobody (email not configured, Resend's daily limit) gives
// the row back for another day.
//
// It never throws, and an unreadable table means it does nothing.

const SUBMISSIONS = 'release_credit_submissions';
const EMAILS = 'person_claim_emails';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Credits looked at per run, newest first. */
const SCAN_LIMIT = 500;
/** First emails looked at for a due reminder per run. */
const REMINDER_SCAN_LIMIT = 200;

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type ClaimAutoEmailReport = {
  ran: boolean;
  /** Why nothing ran, when it did not. */
  reason?: 'off' | 'not_configured' | 'unreadable';
  people: number;
  budget: number;
  invitesSent: number;
  remindersSent: number;
  suppressed: number;
  failed: number;
  /** Given back for another day (no config, daily limit). */
  retryLater: number;
  /** Ready to send but past this run's budget; tomorrow's run picks them up. */
  deferred: number;
  skipped: Record<string, number>;
};

const emptyReport = (reason?: ClaimAutoEmailReport['reason']): ClaimAutoEmailReport => ({
  ran: !reason,
  ...(reason ? { reason } : {}),
  people: 0,
  budget: 0,
  invitesSent: 0,
  remindersSent: 0,
  suppressed: 0,
  failed: 0,
  retryLater: 0,
  deferred: 0,
  skipped: {},
});

type ReleaseFacts = { title: string; artistName: string; ownerUserId: string };

type Loaded = {
  people: AutoEmailPerson[];
  /** Role ids per credit, for the copy. */
  roles: Map<string, string[]>;
  /** Name on each credit, for the greeting. */
  names: Map<string, string>;
  releases: Map<string, ReleaseFacts>;
};

async function selectIn(
  admin: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  ids: string[]
): Promise<Record<string, unknown>[] | null> {
  const out: Record<string, unknown>[] = [];
  for (const group of inChunks(ids, IN_LIST_CHUNK)) {
    const result = await admin.from(table).select(columns).in(column, group);
    if (result.error) return null;
    out.push(...(result.data || []).map(asRow));
  }
  return out;
}

/** Everything the rules need, for the people worth looking at today: the ones
 *  with a fresh-enough credit, and the ones whose first email is a week old.
 *  Null when any read fails. */
async function loadPeople(admin: SupabaseClient, now: Date): Promise<Loaded | null> {
  const recent = await admin
    .from(SUBMISSIONS)
    .select('person_id')
    .not('person_id', 'is', null)
    .not('email', 'is', null)
    .eq('confirmed_accurate', true)
    .eq('person_hidden', false)
    .order('created_at', { ascending: false })
    .limit(SCAN_LIMIT);
  if (recent.error) return null;

  const dueBefore = new Date(now.getTime() - CLAIM_REMINDER_DAYS * DAY_MS).toISOString();
  const due = await admin
    .from(EMAILS)
    .select('person_id')
    .eq('kind', 'invite')
    .eq('status', 'sent')
    .lte('sent_at', dueBefore)
    .order('sent_at', { ascending: true })
    .limit(REMINDER_SCAN_LIMIT);
  // The record table is what makes "once" true. Without it, send nothing.
  if (due.error) return null;

  const personIds = [
    ...new Set(
      [...(recent.data || []), ...(due.data || [])].map((row) => text(asRow(row).person_id)).filter(Boolean)
    ),
  ];
  const empty: Loaded = { people: [], roles: new Map(), names: new Map(), releases: new Map() };
  if (personIds.length === 0) return empty;

  const [profiles, records, invites, seeded, credits] = await Promise.all([
    selectIn(admin, 'person_profiles', 'id, status, user_id, removed_at, removal_requested_at', 'id', personIds),
    selectIn(admin, EMAILS, 'person_id, kind, status, invite_id, submission_id, sent_at', 'person_id', personIds),
    selectIn(
      admin,
      'person_claim_invites',
      'id, person_id, workspace_id, created_by, created_at, used_at, revoked_at, expires_at, failed_attempts',
      'person_id',
      personIds
    ),
    selectIn(admin, 'seeded_profiles', 'person_id', 'person_id', personIds),
    selectIn(
      admin,
      SUBMISSIONS,
      'id, person_id, release_id, legal_name, stage_name, roles, email, confirmed_accurate, person_hidden, created_at',
      'person_id',
      personIds
    ),
  ]);
  if (!profiles || !records || !invites || !seeded || !credits) return null;

  const releaseIds = [...new Set(credits.map((row) => text(row.release_id)).filter(Boolean))];
  const releaseRows = await selectIn(
    admin,
    'releases',
    'id, title, artist_name, artist_id, owner_user_id, release_date, status, metadata',
    'id',
    releaseIds
  );
  if (!releaseRows) return null;
  const releaseMap = new Map(releaseRows.map((row) => [text(row.id), row]));
  const delivered = await deliveredReleaseIds(admin, releaseMap, now);
  if (!delivered) return null;

  // The team each rollout belongs to (its artist's team, else the owner's), and
  // the artist's name when the rollout row does not carry one.
  const artistIds = [...new Set(releaseRows.map((row) => text(row.artist_id)).filter(Boolean))];
  const artists = (await selectIn(admin, 'artists', 'id, name, workspace_id', 'id', artistIds)) ?? [];
  const artistById = new Map(artists.map((row) => [text(row.id), row]));
  const ownerIds = [...new Set(releaseRows.map((row) => text(row.owner_user_id)).filter(Boolean))];
  const owned = (await selectIn(admin, 'workspaces', 'id, owner_id', 'owner_id', ownerIds)) ?? [];
  const workspaceByOwner = new Map(owned.map((row) => [text(row.owner_id), text(row.id)]));

  const releases = new Map<string, ReleaseFacts>();
  const workspaceByRelease = new Map<string, string | null>();
  for (const row of releaseRows) {
    const artist = artistById.get(text(row.artist_id));
    releases.set(text(row.id), {
      title: text(row.title).trim(),
      artistName: (text(row.artist_name).trim() || text(artist?.name).trim()).slice(0, 80),
      ownerUserId: text(row.owner_user_id),
    });
    workspaceByRelease.set(
      text(row.id),
      text(artist?.workspace_id) || workspaceByOwner.get(text(row.owner_user_id)) || null
    );
  }

  const seededIds = new Set(seeded.map((row) => text(row.person_id)));
  const roles = new Map<string, string[]>();
  const names = new Map<string, string>();
  const creditsByPerson = new Map<string, AutoEmailCredit[]>();
  for (const row of credits) {
    const id = text(row.id);
    roles.set(id, Array.isArray(row.roles) ? (row.roles as unknown[]).filter((r): r is string => typeof r === 'string') : []);
    names.set(id, (text(row.stage_name).trim() || text(row.legal_name).trim()).slice(0, 80));
    const list = creditsByPerson.get(text(row.person_id)) ?? [];
    list.push({
      submissionId: id,
      releaseId: text(row.release_id),
      workspaceId: workspaceByRelease.get(text(row.release_id)) ?? null,
      email: row.email ? text(row.email) : null,
      confirmedAccurate: row.confirmed_accurate === true,
      personHidden: row.person_hidden === true,
      delivered: delivered.has(text(row.release_id)),
      createdAt: text(row.created_at),
    });
    creditsByPerson.set(text(row.person_id), list);
  }

  const group = <T>(rows: Record<string, unknown>[], map: (row: Record<string, unknown>) => T) => {
    const out = new Map<string, T[]>();
    for (const row of rows) {
      const list = out.get(text(row.person_id)) ?? [];
      list.push(map(row));
      out.set(text(row.person_id), list);
    }
    return out;
  };
  const recordsByPerson = group<AutoEmailRecord>(records, (row) => ({
    kind: row.kind === 'reminder' ? 'reminder' : 'invite',
    status: (['sending', 'sent', 'suppressed', 'failed'].includes(text(row.status)) ? text(row.status) : 'sending') as AutoEmailRecord['status'],
    inviteId: text(row.invite_id) || null,
    submissionId: text(row.submission_id) || null,
    sentAt: text(row.sent_at) || null,
  }));
  const invitesByPerson = group<ClaimInviteHistory>(invites, (row) => ({
    id: text(row.id),
    // Urganize's own links have a team and no creator. A founder-seeded link
    // has no team, and an owner's link has a creator.
    automatic: !text(row.created_by) && Boolean(text(row.workspace_id)),
    createdAt: text(row.created_at),
    usedAt: text(row.used_at) || null,
    revokedAt: text(row.revoked_at) || null,
    expiresAt: text(row.expires_at),
    failedAttempts: Number(row.failed_attempts) || 0,
  }));

  const people: AutoEmailPerson[] = profiles.map((row) => {
    const id = text(row.id);
    return {
      personId: id,
      status: row.status === 'unclaimed' ? 'unclaimed' : 'claimed',
      hasAccount: Boolean(text(row.user_id)),
      removed: Boolean(row.removed_at || row.removal_requested_at),
      seeded: seededIds.has(id),
      credits: creditsByPerson.get(id) ?? [],
      invites: invitesByPerson.get(id) ?? [],
      emails: recordsByPerson.get(id) ?? [],
    };
  });
  return { people, roles, names, releases };
}

type SendOutcome = 'sent' | 'lost' | 'suppressed' | 'failed' | 'retry' | 'stop';

/** Reserve, make the link, send, record. One person, one kind. */
async function sendOne(
  admin: SupabaseClient,
  input: {
    kind: AutoEmailKind;
    personId: string;
    credit: AutoEmailCredit;
    email: string;
    recipientName: string;
    roles: string[];
    release: ReleaseFacts;
  }
): Promise<SendOutcome> {
  const workspaceId = input.credit.workspaceId;
  if (!workspaceId) return 'lost';

  const reserved = await admin
    .from(EMAILS)
    .insert({
      person_id: input.personId,
      kind: input.kind,
      submission_id: input.credit.submissionId,
      release_id: input.credit.releaseId,
      workspace_id: workspaceId,
      status: 'sending',
    })
    .select('id')
    .single();
  // Somebody else holds this person and kind (another run), or the table is
  // not there. Either way: send nothing.
  if (reserved.error || !reserved.data) return 'lost';
  const recordId = text(asRow(reserved.data).id);
  const giveBack = () => admin.from(EMAILS).delete().eq('id', recordId).eq('status', 'sending');

  const link = await mintClaimLink(admin, {
    personId: input.personId,
    workspaceId,
    releaseId: input.credit.releaseId,
    createdBy: null,
    channel: 'email',
  });
  if (!link) {
    await giveBack();
    return 'retry';
  }
  await admin.from(EMAILS).update({ invite_id: link.inviteId }).eq('id', recordId);

  const result = await emailClaimLink(admin, {
    link,
    to: input.email,
    email: {
      kind: input.kind,
      props: {
        recipientName: input.recipientName,
        artistName: input.release.artistName,
        releaseTitle: input.release.title,
        roles: input.roles,
      },
      idempotencyKey: claimEmailIdempotencyKey(input.kind, link.inviteId),
    },
  });

  const next = afterSend(result);
  if (next.kind === 'sent') {
    await admin.from(EMAILS).update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', recordId);
    return 'sent';
  }
  if (next.kind === 'final') {
    await admin.from(EMAILS).update({ status: next.status, error: next.error }).eq('id', recordId);
    await revokeUnsentInvite(admin, link.inviteId);
    return next.status;
  }
  // Certainly not sent. The link stays open but unsent; it is Urganize's own,
  // so it blocks nothing, and the next try makes a new one.
  await giveBack();
  return 'stop';
}

/**
 * The cron passenger. Emails each credited person whose page is ready once,
 * then sends the one reminder to anybody whose first email is a week old and
 * who has not claimed. Never throws.
 */
export async function runClaimAutoEmailSweep(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<ClaimAutoEmailReport> {
  if (!isClaimAutoEmailEnabled()) return emptyReport('off');
  if (!isEmailConfigured()) return emptyReport('not_configured');
  const report = emptyReport();
  const posthog = createServerPostHogClient();
  try {
    const sentToday = await countEmailsSentToday(admin, now);
    let budget = claimEmailBudget({ dailyLimit: readDailyEmailLimit(), sentToday, reserve: BULK_RESERVE });
    report.budget = budget;

    const loaded = await loadPeople(admin, now);
    if (!loaded) return { ...report, ran: false, reason: 'unreadable' };
    report.people = loaded.people.length;
    const skip = (reason: string) => {
      report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
    };

    let stopped = false;
    const run = async (kind: AutoEmailKind, person: AutoEmailPerson) => {
      const decision = kind === 'invite' ? decideAutoInvite(person) : decideReminder(person, now);
      if (decision.kind === 'skip') {
        // Reminder reasons for people who never got a first email are noise.
        if (!(kind === 'reminder' && decision.reason === 'no_first_email')) skip(`${kind}:${decision.reason}`);
        return;
      }
      if (stopped || budget <= 0) {
        report.deferred += 1;
        return;
      }
      const release = loaded.releases.get(decision.credit.releaseId);
      if (!release) {
        skip(`${kind}:no_release`);
        return;
      }
      budget -= 1;
      const outcome = await sendOne(admin, {
        kind,
        personId: person.personId,
        credit: decision.credit,
        email: decision.email,
        recipientName: loaded.names.get(decision.credit.submissionId) ?? '',
        roles: loaded.roles.get(decision.credit.submissionId) ?? [],
        release,
      });
      if (outcome === 'sent') {
        if (kind === 'invite') report.invitesSent += 1;
        else report.remindersSent += 1;
        captureServerAnalyticsEvent(
          posthog,
          release.ownerUserId,
          kind === 'invite'
            ? createPostHogEvent('claim_email_sent', {
                release_id: decision.credit.releaseId,
                role_count: (loaded.roles.get(decision.credit.submissionId) ?? []).length,
              })
            : createPostHogEvent('claim_reminder_sent', {
                release_id: decision.credit.releaseId,
                first_link_expired: 'firstLink' in decision && decision.firstLink === 'expired',
              })
        );
        // So the reminder pass below cannot see a first email from a second ago.
        person.emails.push({ kind, status: 'sent', inviteId: null, submissionId: decision.credit.submissionId, sentAt: now.toISOString() });
      } else if (outcome === 'suppressed') report.suppressed += 1;
      else if (outcome === 'failed') report.failed += 1;
      else if (outcome === 'lost') skip(`${kind}:lost_reservation`);
      else {
        report.retryLater += 1;
        budget += 1;
        if (outcome === 'stop') stopped = true;
      }
    };

    for (const person of loaded.people) await run('invite', person);
    for (const person of loaded.people) await run('reminder', person);
    return report;
  } catch (error) {
    console.error('[claim-auto-email] run failed', error);
    return report;
  } finally {
    await shutdownServerAnalytics(posthog);
  }
}
