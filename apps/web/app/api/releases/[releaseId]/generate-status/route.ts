import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  requireActiveAuthenticatedUserOrInternal,
  isOptionalTableMissingError,
} from '../../_shared';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { generatePlainTextAiOutput, isAiConfigured } from '@/lib/ai/provider';
import {
  buildStatusMessages,
  stripMarkdownWrappers,
  type StatusFacts,
  type StatusReleaseInfo,
  type StatusTaskSummary,
} from '@/lib/release-status';

const RELEASES_TABLE = 'releases';
const TASKS_TABLE = 'tasks';
const ASSETS_TABLE = 'assets';
const STATUS_TIMEOUT_MS = 20_000;
const MS_PER_DAY = 86_400_000;

// Without this, Vercel's plan-default function timeout (10-15s) kills the
// invocation before STATUS_TIMEOUT_MS + the provider's retry budget can
// produce the handled 504/503 below.
export const maxDuration = 60;

const isStatusUpdateEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_STATUS_UPDATE === 'true';

type ReleaseRow = {
  id: string;
  owner_user_id: string;
  title: string | null;
  artist_name: string | null;
  release_date: string | null;
  release_type: string | null;
};

type TaskRow = {
  title: string | null;
  status: string | null;
  due_date: string | null;
  metadata: unknown;
};

const DONE_STATUSES = new Set(['done']);
const BLOCKED_STATUSES = new Set(['blocked', 'locked']);
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'in_review']);
const TERMINAL_STATUSES = new Set(['done', 'cancelled']);

function isEventMilestoneRow(metadata: unknown): boolean {
  if (metadata && typeof metadata === 'object') {
    const template = (metadata as { template?: unknown }).template;
    if (template && typeof template === 'object') {
      return (template as { task_type?: unknown }).task_type === 'event_milestone';
    }
  }
  return false;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function summarizeTasks(
  rows: TaskRow[]
): Omit<StatusTaskSummary, 'attachmentCount' | 'attachmentCategories'> & {
  dueThisWeekCount: number;
} {
  const now = Date.now();
  const weekAhead = now + 7 * MS_PER_DAY;
  const twoWeeksAhead = now + 14 * MS_PER_DAY;

  let doneCount = 0;
  let inProgressCount = 0;
  let blockedCount = 0;
  // Counted separately from `comingUpThisWeek` below, which caps at five
  // TITLES for the prompt. The tiles need the real total — see StatusFacts.
  let dueThisWeekCount = 0;
  const inProgressTitles: string[] = [];
  const blockedTitles: string[] = [];
  const comingUpThisWeek: string[] = [];
  const upcomingMilestones: Array<{ title: string; date: string }> = [];

  for (const row of rows) {
    const status = String(row.status || '').toLowerCase();
    const title = (row.title || '').trim() || 'Untitled task';

    if (DONE_STATUSES.has(status)) doneCount += 1;
    if (IN_PROGRESS_STATUSES.has(status)) {
      inProgressCount += 1;
      if (inProgressTitles.length < 3) inProgressTitles.push(title);
    }
    if (BLOCKED_STATUSES.has(status)) {
      blockedCount += 1;
      if (blockedTitles.length < 3) blockedTitles.push(title);
    }

    const dueTime = row.due_date ? new Date(row.due_date).getTime() : NaN;
    const hasValidDue = Number.isFinite(dueTime);

    if (hasValidDue && !TERMINAL_STATUSES.has(status) && dueTime >= now && dueTime <= weekAhead) {
      dueThisWeekCount += 1;
      if (comingUpThisWeek.length < 5) comingUpThisWeek.push(title);
    }

    if (
      isEventMilestoneRow(row.metadata) &&
      hasValidDue &&
      dueTime >= now &&
      dueTime <= twoWeeksAhead
    ) {
      upcomingMilestones.push({ title, date: formatShortDate(row.due_date as string) });
    }
  }

  return {
    doneCount,
    inProgressCount,
    blockedCount,
    dueThisWeekCount,
    inProgressTitles,
    blockedTitles,
    comingUpThisWeek,
    upcomingMilestones,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isStatusUpdateEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // *OrInternal: the Chappi/MCP tool layer generates status updates by calling
  // this route internally, so it also accepts the MCP internal actor (URG-183).
  const auth = await requireActiveAuthenticatedUserOrInternal(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'Status generation is not configured on this environment.' },
      { status: 503 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // Team WRITE gate (uniform non-GET rule): any non-guest member may generate
  // a status update; guests get the view-only 403 rather than spending AI
  // tokens on a result they could not act on.
  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;

  // --- Load release fields the prompt needs (release_type is not on the
  // shared access summary) -----------------------------------------------------
  const releaseResult = await adminClient
    .from(RELEASES_TABLE)
    .select('id,owner_user_id,title,artist_name,release_date,release_type')
    .eq('id', releaseId)
    .maybeSingle();

  if (releaseResult.error) {
    if (isOptionalTableMissingError(releaseResult.error)) {
      return NextResponse.json({ error: 'Release schema is incomplete.' }, { status: 501 });
    }
    return NextResponse.json(
      { error: releaseResult.error.message || 'Could not load release.' },
      { status: 500 }
    );
  }
  const release = releaseResult.data as ReleaseRow | null;
  if (!release) {
    return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
  }

  // --- Load tasks + assets in parallel ----------------------------------------
  const [tasksResult, assetsResult] = await Promise.all([
    adminClient.from(TASKS_TABLE).select('title,status,due_date,metadata').eq('release_id', releaseId),
    adminClient.from(ASSETS_TABLE).select('category').eq('release_id', releaseId),
  ]);

  if (tasksResult.error) {
    return NextResponse.json(
      { error: tasksResult.error.message || 'Could not load tasks.' },
      { status: 500 }
    );
  }

  const taskRows = (tasksResult.data || []) as TaskRow[];
  const { dueThisWeekCount, ...taskSummary } = summarizeTasks(taskRows);

  // Assets are non-critical context — if the lookup errors, treat as zero.
  const assetRows = assetsResult.error ? [] : ((assetsResult.data || []) as Array<{ category: string | null }>);
  const attachmentCategories = Array.from(
    new Set(assetRows.map((a) => String(a.category || '').trim()).filter(Boolean))
  );

  const summary: StatusTaskSummary = {
    ...taskSummary,
    attachmentCount: assetRows.length,
    attachmentCategories,
  };

  const releaseInfo: StatusReleaseInfo = {
    title: release.title || 'Untitled release',
    artistName: release.artist_name || '',
    releaseDate: release.release_date,
    releaseType: release.release_type || 'single',
  };

  const messages = buildStatusMessages({ release: releaseInfo, summary });

  // --- Call the model ---------------------------------------------------------
  let raw: string;
  try {
    raw = await generatePlainTextAiOutput({
      messages,
      timeoutMs: STATUS_TIMEOUT_MS,
      maxRetries: 2,
      model: process.env.AI_STATUS_MODEL || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Status generation failed.';
    const status = (error as { status?: number } | null)?.status;
    const isAbort =
      (error as { name?: string } | null)?.name === 'AbortError' || /abort/i.test(message);

    if (isAbort) {
      return NextResponse.json(
        { error: 'Status generation took too long. Try again.' },
        { status: 504 }
      );
    }
    if (status === 429 || /rate[- ]limit/i.test(message)) {
      return NextResponse.json({ error: 'Service busy. Try again in a moment.' }, { status: 503 });
    }
    if (/empty/i.test(message)) {
      return NextResponse.json({ error: 'AI returned no usable text.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Service busy. Try again in a moment.' }, { status: 503 });
  }

  const statusUpdate = stripMarkdownWrappers(raw);
  if (!statusUpdate) {
    return NextResponse.json({ error: 'AI returned no usable text.' }, { status: 502 });
  }

  // `stats` is additive: the Chappi/MCP tool layer reads `status_update` only
  // (see lib/chappi/tools.ts generate_status_update), so this new field
  // reaches the modal without touching that contract. Every figure comes from
  // rows already loaded above — the tiles cost no extra queries.
  const stats: StatusFacts = {
    totalCount: taskRows.length,
    doneCount: taskSummary.doneCount,
    inProgressCount: taskSummary.inProgressCount,
    blockedCount: taskSummary.blockedCount,
    dueThisWeekCount,
  };

  return NextResponse.json({ status_update: statusUpdate, stats });
}
