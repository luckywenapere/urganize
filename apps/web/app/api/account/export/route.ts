import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import { toCsv } from '@/lib/csv';
import {
  TASK_CSV_HEADER,
  buildExportEnvelope,
  buildExportFileName,
  buildSection,
  buildTaskCsvRows,
  parseExportFormat,
  type ExportRow,
  type ExportSection,
} from '@/lib/account-export';

// GET /api/account/export[?format=csv] — hand the user everything we hold.
//
// DELIBERATELY OPEN-ROUTE AUTH (getAuthenticatedUser, not
// requireActiveAuthenticatedUser), and this is the single most important line
// in the file. lib/entitlements.ts declares data_export true on EVERY tier and
// a test enforces it, because a buyer who cannot get their catalogue back out
// has been trapped rather than sold to. The people who most need this are
// exactly the ones a paywall would stop: a walled team, a failed card, a
// cancellation inside its 90-day window. If someone later "tidies" this to
// match the other protected routes, the trust feature becomes a hostage.
// The same reasoning is why it is not gated on the hard paywall's grace either.
//
// Scope is the account-deletion boundary — releases owned by the user,
// everything cascading from them, the workspace they own, and their own profile
// (see app/api/account/delete-now/route.ts). "You can export exactly what
// deleting your account would destroy" is a rule that is easy to check and
// impossible to argue with.
//
// Every table is read with select('*') on purpose. A column allowlist would
// quietly shrink the export each time the schema grew; a denylist in
// lib/account-export.ts removes the handful of credential fields after the
// fact. Each section fails independently: a table that does not exist in this
// environment (migration not applied, feature never switched on) is reported as
// `unavailable` rather than failing the whole export, the defensive-probe
// pattern lib/release-recap already uses for playlist_pitches.

export const maxDuration = 60;

const FEATURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DATA_EXPORT === 'true';

/** Signed download links for the user's files. An hour is the same TTL the rest
 * of the app signs at; the envelope tells the reader they expire. */
const ASSET_URL_TTL_SECONDS = 60 * 60;

type Query = { table: string; column: string; values: readonly string[] };

/** Read a table, never throw, and distinguish "no rows" from "could not read".
 * The second is what makes a missing table survivable. */
async function readSection(
  admin: SupabaseClient,
  { table, column, values }: Query
): Promise<ExportSection> {
  if (values.length === 0) return buildSection([]);
  try {
    const { data, error } = await admin.from(table).select('*').in(column, values as string[]);
    if (error) {
      console.error(`[account/export] could not read ${table}:`, error.message);
      return buildSection(null, error.message);
    }
    return buildSection((data ?? []) as ExportRow[]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[account/export] could not read ${table}:`, message);
    return buildSection(null, message);
  }
}

/** Attach a fresh signed URL to each asset row so the export is genuinely
 * usable rather than a list of paths. Signing is best-effort per row: one
 * unsignable object must not cost the user the other 200. */
async function withDownloadUrls(
  admin: SupabaseClient,
  section: ExportSection
): Promise<ExportSection> {
  if (section.unavailable || section.rows.length === 0) return section;

  const rows = await Promise.all(
    section.rows.map(async (row) => {
      const path = typeof row.storage_path === 'string' ? row.storage_path : '';
      if (!path) return row;
      const bucket =
        typeof row.storage_bucket === 'string' && row.storage_bucket
          ? row.storage_bucket
          : RELEASE_ASSETS_BUCKET;
      try {
        const { data } = await admin.storage
          .from(bucket)
          .createSignedUrl(path, ASSET_URL_TTL_SECONDS);
        return { ...row, download_url: data?.signedUrl ?? null };
      } catch {
        return { ...row, download_url: null };
      }
    })
  );

  return { ...section, rows };
}

const idsOf = (section: ExportSection): string[] =>
  section.rows.map((row) => String(row.id ?? '')).filter(Boolean);

export async function GET(request: NextRequest) {
  if (!FEATURE_ENABLED) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const userId = auth.user.id;
  const format = parseExportFormat(request.nextUrl.searchParams.get('format'));
  const generatedAt = new Date().toISOString();

  // Owned roots first — everything else hangs off these ids.
  const [profile, workspaces, releases] = await Promise.all([
    readSection(admin, { table: 'profiles', column: 'id', values: [userId] }),
    readSection(admin, { table: 'workspaces', column: 'owner_id', values: [userId] }),
    readSection(admin, { table: 'releases', column: 'owner_user_id', values: [userId] }),
  ]);

  const workspaceIds = idsOf(workspaces);
  const releaseIds = idsOf(releases);

  const [
    artists,
    members,
    releaseMetadata,
    releaseEvents,
    collaborators,
    tasks,
    assetsRaw,
    notes,
    subscriptions,
    payments,
  ] = await Promise.all([
    readSection(admin, { table: 'artists', column: 'workspace_id', values: workspaceIds }),
    readSection(admin, { table: 'workspace_members', column: 'workspace_id', values: workspaceIds }),
    readSection(admin, { table: 'release_metadata', column: 'release_id', values: releaseIds }),
    readSection(admin, { table: 'release_events', column: 'release_id', values: releaseIds }),
    readSection(admin, {
      table: 'release_collaborators',
      column: 'release_id',
      values: releaseIds,
    }),
    readSection(admin, { table: 'tasks', column: 'release_id', values: releaseIds }),
    readSection(admin, { table: 'assets', column: 'owner_user_id', values: [userId] }),
    readSection(admin, { table: 'notes', column: 'owner_user_id', values: [userId] }),
    readSection(admin, { table: 'subscriptions', column: 'user_id', values: [userId] }),
    readSection(admin, { table: 'payments', column: 'user_id', values: [userId] }),
  ]);

  const taskIds = idsOf(tasks);

  // Feature-scoped tables. Each may legitimately not exist in a given
  // environment, which is what buildSection's `unavailable` is for.
  const [
    comments,
    outcomes,
    calendars,
    capturePages,
    plans,
    creditLinks,
    creditSubmissions,
    distributionRejections,
    releaseSpend,
    releasePayback,
    urgansChats,
    presenceDays,
    assets,
  ] = await Promise.all([
    readSection(admin, { table: 'task_comments', column: 'task_id', values: taskIds }),
    readSection(admin, { table: 'task_outcomes', column: 'task_id', values: taskIds }),
    readSection(admin, { table: 'content_calendars', column: 'release_id', values: releaseIds }),
    readSection(admin, {
      table: 'release_capture_pages',
      column: 'release_id',
      values: releaseIds,
    }),
    readSection(admin, { table: 'release_plan_drafts', column: 'release_id', values: releaseIds }),
    // Collaborator credits. Keyed on release_id like the other release-scoped
    // tables above, and included because these are the publishing details a
    // manager most needs in hand for a distributor handoff: legal names, IPI
    // and PRO numbers, publishers, and the writing and recording splits. They
    // were the one part of a release that deleting the account would destroy
    // and the export did not hand back.
    //
    // share_token on the link row is deliberately NOT redacted — see
    // REDACTED_KEYS in lib/account-export.ts: it is the user's own link,
    // already visible in the app, and the export is useless without it.
    readSection(admin, { table: 'release_credit_links', column: 'release_id', values: releaseIds }),
    readSection(admin, {
      table: 'release_credit_submissions',
      column: 'release_id',
      values: releaseIds,
    }),
    // What the distributor sent back for a rollout (2026-10-09): the reason and
    // the payload it came from, kept whole. Keyed on release_id like the other
    // release-scoped tables, and it belongs here because deleting a rollout
    // deletes these rows with it (on delete cascade). Unavailable, not empty,
    // where the table does not exist yet.
    readSection(admin, {
      table: 'distribution_rejections',
      column: 'release_id',
      values: releaseIds,
    }),
    // What each rollout cost and what it paid back (release spend, 2026-10-09),
    // keyed on release_id like the other release-scoped tables, and removed with
    // the rollout by the cascade, so it belongs here by this route's own rule.
    // Amounts are integer kobo. Unavailable, not empty, where the table does not
    // exist yet.
    readSection(admin, { table: 'release_spend', column: 'release_id', values: releaseIds }),
    readSection(admin, { table: 'release_payback', column: 'release_id', values: releaseIds }),
    // Saved UrgAns chats — the user's own words and the answers to them, kept
    // until they delete them (founder decision, 2026-09-24) and removed with
    // the account by the auth.users cascade, so they belong here by the rule
    // this route is scoped by. Unavailable (not empty) where the table does
    // not exist yet.
    readSection(admin, { table: 'urgans_conversations', column: 'owner_user_id', values: [userId] }),
    // The days you opened the app (2026-10-07, the /admin/metrics ping): one
    // row per day with the first and last time and the kind of device. Removed
    // with the account by the cascade, so it belongs here by the same rule.
    readSection(admin, { table: 'user_presence_days', column: 'user_id', values: [userId] }),
    withDownloadUrls(admin, assetsRaw),
  ]);

  const [posts, captureLeads] = await Promise.all([
    readSection(admin, { table: 'content_posts', column: 'calendar_id', values: idsOf(calendars) }),
    readSection(admin, {
      table: 'release_capture_leads',
      column: 'capture_page_id',
      values: idsOf(capturePages),
    }),
  ]);

  // The spreadsheet: one row per activity, with release context. Assignee uuids
  // are resolved through the team roster — a column of uuids reads as
  // corruption to someone opening this in Excel.
  if (format === 'csv') {
    const memberNames = new Map<string, string>();
    for (const member of members.rows) {
      const id = String(member.user_id ?? '');
      if (!id) continue;
      const name = String(member.name ?? member.email ?? '').trim();
      if (name) memberNames.set(id, name);
    }

    const csv = toCsv(TASK_CSV_HEADER, buildTaskCsvRows(tasks.rows, releases.rows, memberNames));
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${buildExportFileName('csv', generatedAt)}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const envelope = buildExportEnvelope({
    userId,
    email: auth.user.email ?? null,
    generatedAt,
    sections: {
      profile,
      workspaces,
      artists,
      team_members: members,
      releases,
      release_metadata: releaseMetadata,
      release_events: releaseEvents,
      release_collaborators: collaborators,
      activities: tasks,
      activity_comments: comments,
      activity_outcomes: outcomes,
      files: assets,
      notes,
      urgans_chats: urgansChats,
      days_you_used_urganize: presenceDays,
      content_calendars: calendars,
      content_posts: posts,
      credit_links: creditLinks,
      credit_submissions: creditSubmissions,
      distribution_rejections: distributionRejections,
      spend_lines: releaseSpend,
      spend_payback: releasePayback,
      capture_pages: capturePages,
      capture_leads: captureLeads,
      rollout_plan_drafts: plans,
      subscriptions,
      payments,
    },
  });

  return new NextResponse(JSON.stringify(envelope, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${buildExportFileName('json', generatedAt)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
