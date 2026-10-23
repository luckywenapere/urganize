import type { SupabaseClient } from '@supabase/supabase-js';
import { buildIdentifiers } from './person-identity';
import { identifierKey } from './person-match';
import { isRecapEligible } from './recap-eligibility';
import { readTestRelease } from './test-release';
import { IN_LIST_CHUNK, inChunks, readInChunks } from './paged-rows';
import { seedRelationship } from './relationships-server';
import { randomSlugTail, unclaimedSlug } from './claim';
import {
  planCreditProfiles,
  summarizeSweep,
  type SweepContext,
  type SweepDecision,
  type SweepSummary,
  type SweepSubmission,
} from './claim-sweep';
import { RELEASE_CREDIT_ROLE_LABELS, type ReleaseCreditRole } from '@/types/credits';

// The daily step that makes unclaimed profiles from credits, and the same
// logic as a dry run the admin reads before anything is written.
//
// It rides the existing daily cron (both schedule slots are taken, Hobby plan),
// so a day's delay is normal. It never throws, and it fails toward NOT creating
// a profile: an unreadable table or an uncertain match is a skip.

const SUBMISSIONS = 'release_credit_submissions';
const RELEASES = 'releases';
const SETTINGS = 'app_settings';
const SETTINGS_KEY = 'credit_profile_sweep';

/** Credits looked at per run, and profiles made per run. */
const SCAN_LIMIT = 1000;
export const MAX_PROFILES_PER_RUN = 100;

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type SweepReport = SweepSummary & {
  dryRun: boolean;
  /** True when the scan limit was reached, so the numbers are a floor. */
  truncated: boolean;
  created: number;
  linked: number;
  failed: number;
  /** Profiles left for tomorrow because of the per-run cap. */
  deferred: number;
};

const EMPTY_REPORT = (dryRun: boolean): SweepReport => ({
  dryRun,
  scanned: 0,
  wouldCreate: 0,
  wouldLink: 0,
  skipped: { not_delivered: 0, not_confirmed: 0, hidden: 0, no_contact: 0, has_account: 0 },
  truncated: false,
  created: 0,
  linked: 0,
  failed: 0,
  deferred: 0,
});

type LoadedCredit = SweepSubmission & {
  workspaceId: string | null;
  ownerUserId: string;
  label: string;
  roleLabel: string;
};

function roleLabel(roles: unknown): string {
  if (!Array.isArray(roles)) return '';
  const names = (roles as unknown[])
    .filter((role): role is ReleaseCreditRole => typeof role === 'string' && role in RELEASE_CREDIT_ROLE_LABELS)
    .map((role) => RELEASE_CREDIT_ROLE_LABELS[role]);
  return names.join(', ').slice(0, 40).replace(/[, ]+$/, '');
}

/**
 * Which of these rollouts count as delivered: the lib/recap-eligibility.ts rule
 * (release day passed, or every task done), never archived, never a test
 * rollout. The rows are `releases` rows with at least id, release_date, status
 * and metadata. Null when the task read fails, so a caller does nothing rather
 * than guess. Shared with the automatic claim email (lib/claim-auto-email-server.ts),
 * so "has this come out" has one answer.
 */
export async function deliveredReleaseIds(
  admin: SupabaseClient,
  releases: Map<string, Record<string, unknown>>,
  now: Date = new Date()
): Promise<Set<string> | null> {
  const releaseIds = [...releases.keys()];
  const delivered = new Set<string>();
  if (releaseIds.length === 0) return delivered;
  let tasks;
  try {
    tasks = await readInChunks(releaseIds, (group, from, to) =>
      admin.from('tasks').select('release_id, status').in('release_id', group).range(from, to)
    );
  } catch {
    return null;
  }
  const totals = new Map<string, { total: number; done: number }>();
  for (const task of tasks.rows.map(asRow)) {
    const id = text(task.release_id);
    // Cancelled work is out of the count (URG-389): dropped is neither done nor owed.
    if (text(task.status) === 'cancelled') continue;
    const entry = totals.get(id) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (text(task.status) === 'done') entry.done += 1;
    totals.set(id, entry);
  }

  for (const [id, release] of releases) {
    if (text(release.status) === 'archived') continue;
    if (readTestRelease((release.metadata as never) ?? {})) continue;
    const total = totals.get(id) ?? { total: 0, done: 0 };
    const date = text(release.release_date);
    if (
      isRecapEligible(
        { releaseDate: date || null, status: text(release.status) },
        { totalTasks: total.total, allTasksDone: total.total > 0 && total.done === total.total },
        now
      )
    ) {
      delivered.add(id);
    }
  }
  return delivered;
}

/** Reads what the planner needs. Returns null when a read it cannot do
 *  without fails, so the run does nothing instead of guessing. */
async function loadSweepInput(
  admin: SupabaseClient
): Promise<{ credits: LoadedCredit[]; context: SweepContext; truncated: boolean } | null> {
  const submissionResult = await admin
    .from(SUBMISSIONS)
    .select('id, release_id, legal_name, stage_name, roles, email, phone, confirmed_accurate, person_hidden')
    .is('person_id', null)
    .eq('confirmed_accurate', true)
    .eq('person_hidden', false)
    .or('email.not.is.null,phone.not.is.null')
    .order('created_at', { ascending: true })
    .limit(SCAN_LIMIT);
  if (submissionResult.error) return null;
  const rows = (submissionResult.data || []).map(asRow);
  if (rows.length === 0) {
    return {
      credits: [],
      context: { deliveredReleaseIds: new Set(), accountEmails: new Set(), personByIdentifier: new Map() },
      truncated: false,
    };
  }

  const releaseIds = [...new Set(rows.map((row) => text(row.release_id)).filter(Boolean))];
  const releases = new Map<string, Record<string, unknown>>();
  for (const ids of inChunks(releaseIds, IN_LIST_CHUNK)) {
    const result = await admin
      .from(RELEASES)
      .select('id, owner_user_id, artist_id, release_date, status, metadata')
      .in('id', ids)
      .is('deleted_at', null);
    if (result.error) return null;
    for (const row of (result.data || []).map(asRow)) releases.set(text(row.id), row);
  }

  const delivered = await deliveredReleaseIds(admin, releases);
  if (!delivered) return null;

  // The team each rollout belongs to: its artist's team, else the owner's.
  const artistIds = [...new Set([...releases.values()].map((r) => text(r.artist_id)).filter(Boolean))];
  const artistWorkspace = new Map<string, string>();
  for (const ids of inChunks(artistIds, IN_LIST_CHUNK)) {
    const result = await admin.from('artists').select('id, workspace_id').in('id', ids);
    for (const row of (result.data || []).map(asRow)) {
      if (text(row.workspace_id)) artistWorkspace.set(text(row.id), text(row.workspace_id));
    }
  }
  const ownerIds = [...new Set([...releases.values()].map((r) => text(r.owner_user_id)).filter(Boolean))];
  const ownerWorkspace = new Map<string, string>();
  for (const ids of inChunks(ownerIds, IN_LIST_CHUNK)) {
    const result = await admin.from('workspaces').select('id, owner_id').in('owner_id', ids);
    for (const row of (result.data || []).map(asRow)) ownerWorkspace.set(text(row.owner_id), text(row.id));
  }

  // A credit on a rollout in Trash is not in `releases` (read above with deleted_at null), so it is dropped.
  const credits: LoadedCredit[] = rows.filter((row) => releases.has(text(row.release_id))).map((row) => {
    const release = releases.get(text(row.release_id)) ?? {};
    const ownerUserId = text(release.owner_user_id);
    return {
      id: text(row.id),
      releaseId: text(row.release_id),
      email: row.email ? text(row.email) : null,
      phone: row.phone ? text(row.phone) : null,
      confirmedAccurate: row.confirmed_accurate === true,
      personHidden: row.person_hidden === true,
      ownerUserId,
      workspaceId: artistWorkspace.get(text(release.artist_id)) ?? ownerWorkspace.get(ownerUserId) ?? null,
      label: (text(row.stage_name).trim() || text(row.legal_name).trim()).slice(0, 80),
      roleLabel: roleLabel(row.roles),
    };
  });

  // Who is already known, by identifier, across every team.
  const wanted = new Map<string, { kind: 'email' | 'phone'; value: string }>();
  const emails = new Set<string>();
  for (const credit of credits) {
    for (const identifier of buildIdentifiers({ email: credit.email, phone: credit.phone })) {
      wanted.set(identifierKey(identifier), identifier);
      if (identifier.kind === 'email') emails.add(identifier.value);
    }
  }
  const personByIdentifier = new Map<string, { personId: string }>();
  for (const ids of inChunks([...wanted.values()].map((entry) => entry.value), IN_LIST_CHUNK)) {
    const result = await admin.from('person_identifiers').select('person_id, kind, value').in('value', ids);
    if (result.error) return null;
    for (const row of (result.data || []).map(asRow)) {
      const key = `${text(row.kind)}:${text(row.value)}`;
      if (wanted.has(key)) personByIdentifier.set(key, { personId: text(row.person_id) });
    }
  }

  const accountEmails = new Set<string>();
  for (const ids of inChunks([...emails], IN_LIST_CHUNK)) {
    const result = await admin.from('profiles').select('email').in('email', ids);
    if (result.error) return null;
    for (const row of (result.data || []).map(asRow)) {
      if (text(row.email)) accountEmails.add(text(row.email).toLowerCase());
    }
  }

  return {
    credits,
    context: { deliveredReleaseIds: delivered, accountEmails, personByIdentifier },
    truncated: rows.length >= SCAN_LIMIT,
  };
}

async function ensureSlug(admin: SupabaseClient, personId: string, name: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = unclaimedSlug(name, randomSlugTail());
    const result = await admin
      .from('person_profiles')
      .update({ slug })
      .eq('id', personId)
      .eq('status', 'unclaimed')
      .is('slug', null)
      .select('id')
      .maybeSingle();
    // Success, or somebody already gave it one. Only a slug clash retries.
    if (!result.error) return;
  }
}

/**
 * Plans the run and, unless it is a dry run, applies it. Each credit is
 * handled on its own: one bad credit costs that credit, never the run.
 */
export async function runCreditProfileSweep(
  admin: SupabaseClient,
  options: { dryRun: boolean; maxProfiles?: number }
): Promise<SweepReport> {
  const report = EMPTY_REPORT(options.dryRun);
  try {
    const input = await loadSweepInput(admin);
    if (!input) return report;
    const decisions = planCreditProfiles(input.credits, input.context);
    Object.assign(report, summarizeSweep(decisions), { dryRun: options.dryRun, truncated: input.truncated });
    if (options.dryRun) return report;

    const byId = new Map(input.credits.map((credit) => [credit.id, credit]));
    const cap = options.maxProfiles ?? MAX_PROFILES_PER_RUN;
    const startedGroups = new Set<number>();
    const madeGroups = new Set<number>();

    const apply = async (decision: SweepDecision): Promise<void> => {
      if (decision.kind === 'skip') return;
      const credit = byId.get(decision.submissionId);
      if (!credit || !credit.workspaceId || !credit.ownerUserId) {
        report.failed += 1;
        return;
      }
      if (decision.kind === 'create') {
        if (!startedGroups.has(decision.group) && startedGroups.size >= cap) {
          report.deferred += 1;
          return;
        }
        startedGroups.add(decision.group);
      }
      const seeded = await seedRelationship(admin, {
        workspaceId: credit.workspaceId,
        actorUserId: credit.ownerUserId,
        data: {
          label: credit.label || 'Credited collaborator',
          role: credit.roleLabel,
          email: credit.email,
          phone: credit.phone,
          tags: [],
          notes: '',
          rateNote: null,
          lastContactAt: null,
        },
        source: 'credit_submission',
      });
      if (!seeded.ok) {
        report.failed += 1;
        return;
      }
      const linked = await admin
        .from(SUBMISSIONS)
        .update({ person_id: seeded.personId })
        .eq('id', credit.id)
        .is('person_id', null);
      if (linked.error) {
        report.failed += 1;
        return;
      }
      if (decision.kind === 'create' && !madeGroups.has(decision.group)) {
        madeGroups.add(decision.group);
        await ensureSlug(admin, seeded.personId, credit.label);
        report.created += 1;
        return;
      }
      // A link to somebody known, or a later credit from a person this run
      // already made a profile for.
      report.linked += 1;
    };

    for (const decision of decisions) await apply(decision);
    return report;
  } catch (error) {
    console.error('[claim-sweep] run failed', error);
    return report;
  }
}

// ---- The switch --------------------------------------------------------------

/** The daily run writes only while this is on. Off until the admin has read a
 *  dry run, like the directory backfill. */
export async function isCreditSweepEnabled(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await admin.from(SETTINGS).select('value_json').eq('key', SETTINGS_KEY).maybeSingle();
    return asRow(asRow(data).value_json).enabled === true;
  } catch {
    return false;
  }
}

export async function setCreditSweepEnabled(
  admin: SupabaseClient,
  enabled: boolean,
  updatedBy: string
): Promise<boolean> {
  try {
    const { error } = await admin.from(SETTINGS).upsert(
      { key: SETTINGS_KEY, value_json: { enabled }, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    return !error;
  } catch {
    return false;
  }
}

/** The cron passenger: writes only when the admin has switched it on. */
export async function runCreditProfileSweepIfEnabled(admin: SupabaseClient): Promise<SweepReport | { skipped: true }> {
  if (!(await isCreditSweepEnabled(admin))) return { skipped: true };
  return runCreditProfileSweep(admin, { dryRun: false });
}
