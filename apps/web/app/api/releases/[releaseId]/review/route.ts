import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { isAiConfigured } from '@/lib/ai/provider';
import { generateRoutedStructuredOutput } from '@/lib/ai/routed';
import { legacyModelFor } from '@/lib/ai/model-router';
import { recordRequestUsage } from '@/lib/ai/usage-log-server';
import { createUsageCollector } from '@/lib/credits/embedded';
import { ensureReleaseTeamReadAccess, ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import {
  buildReleaseReviewView,
  buildReviewAiMessages,
  buildTemplateVerdict,
  hasAnswers,
  isReviewDue,
  parseReviewAiResponse,
  parseReviewAnswers,
  readStoredReview,
  withStoredReview,
  type ReleaseReviewView,
  type ReviewOutcome,
  type ReviewTask,
  type StoredReview,
} from '@/lib/release-review';
import { readTaskPhase } from '@/lib/rollout-phases';
import { isTaskOutcomeRating } from '@/lib/task-outcomes';

/**
 * Post-release review (URG-253). GET reads it (null before it opens), POST
 * saves the answers and rewrites the verdict, PATCH { dismissed: true } hides
 * it from Home (it stays on the rollout).
 *
 * The verdict is written by UrgAns once and cached in releases.metadata.review;
 * a slow or missing model degrades to the template verdict, never an error.
 * Not metered: the review is the reason to come back, not a paid action. The
 * call is logged under the 'outcome' feature it shares a surface with.
 */

export const maxDuration = 30;

const AI_REVIEW_TIMEOUT_MS = 6_000;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type ReleaseRow = {
  id: string;
  title: string;
  artist_name: string;
  release_date: string | null;
  metadata: Record<string, unknown> | null;
  owner_user_id: string;
};

async function loadReviewInputs(
  adminClient: AdminClient,
  releaseId: string
): Promise<{ error: string } | { release: ReleaseRow; tasks: ReviewTask[]; outcomes: ReviewOutcome[] }> {
  const [releaseResult, tasksResult, outcomesResult] = await Promise.all([
    adminClient
      .from('releases')
      .select('id,title,artist_name,release_date,metadata,owner_user_id')
      .eq('id', releaseId)
      .maybeSingle(),
    adminClient
      .from('tasks')
      .select('id,title,status,due_date,completed_at,metadata')
      .eq('release_id', releaseId),
    adminClient.from('task_outcomes').select('task_id,outcome').eq('release_id', releaseId),
  ]);
  if (releaseResult.error || !releaseResult.data) return { error: 'Could not load the rollout.' };
  if (tasksResult.error) return { error: 'Could not load the activities.' };
  const tasks: ReviewTask[] = (tasksResult.data ?? []).map((row: Record<string, unknown>) => {
    const metadata = (row.metadata ?? null) as Record<string, unknown> | null;
    const planner = metadata && typeof metadata.planner === 'object' ? (metadata.planner as { key?: unknown }) : null;
    return {
      id: String(row.id),
      title: String(row.title ?? ''),
      status: String(row.status ?? 'todo'),
      dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
      completedAt: row.completed_at ? String(row.completed_at).slice(0, 10) : null,
      planKey: typeof planner?.key === 'boolean' ? planner.key : null,
      phase: readTaskPhase(metadata),
    };
  });
  // Outcomes are decoration: a read failure leaves the lists to the dates.
  const outcomes: ReviewOutcome[] = outcomesResult.error
    ? []
    : (outcomesResult.data ?? []).flatMap((row: Record<string, unknown>) =>
        isTaskOutcomeRating(row.outcome) ? [{ taskId: String(row.task_id), outcome: row.outcome }] : []
      );
  return { release: releaseResult.data as ReleaseRow, tasks, outcomes };
}

function toView(release: ReleaseRow, tasks: ReviewTask[], outcomes: ReviewOutcome[], metadata?: unknown): ReleaseReviewView {
  return buildReleaseReviewView({
    release: {
      id: release.id,
      title: release.title,
      artistName: release.artist_name,
      releaseDate: release.release_date,
      metadata: metadata ?? release.metadata,
    },
    tasks,
    outcomes,
  });
}

async function writeVerdict(input: {
  adminClient: AdminClient;
  view: ReleaseReviewView;
  actorUserId: string;
  ownerUserId: string;
}): Promise<string> {
  const { view } = input;
  const fallback = buildTemplateVerdict({
    thin: view.thin,
    numbers: view.numbers,
    slipped: view.slipped,
    answers: view.answers,
  });
  if (!isAiConfigured()) return fallback;
  const usage = createUsageCollector(legacyModelFor('outcome') ?? null);
  let verdict = fallback;
  try {
    const result = await generateRoutedStructuredOutput<{ verdict: string }>({
      surface: 'outcome',
      messages: buildReviewAiMessages({
        title: view.title,
        artistName: view.artistName,
        numbers: view.numbers,
        worked: view.worked,
        slipped: view.slipped,
        answers: view.answers,
        thin: view.thin,
      }),
      timeoutMs: AI_REVIEW_TIMEOUT_MS,
      maxRetries: 1,
      parse: parseReviewAiResponse,
      onUsage: usage.onUsage,
      onFailure: usage.onFailure,
    });
    verdict = result.verdict;
  } catch {
    // Template verdict stands.
  }
  await recordRequestUsage(input.adminClient, {
    context: {
      requestId: randomUUID(),
      feature: 'outcome',
      workspaceId: null,
      ownerUserId: input.ownerUserId,
      actorUserId: input.actorUserId,
      releaseId: view.releaseId,
    },
    calls: usage.calls,
    failures: usage.failures,
    creditsCharged: 0,
  }).catch(() => undefined);
  return verdict;
}

async function saveReview(
  adminClient: AdminClient,
  release: ReleaseRow,
  review: StoredReview
): Promise<{ error: string } | { metadata: Record<string, unknown> }> {
  // Re-read so a write elsewhere to another metadata key is not lost.
  const fresh = await adminClient.from('releases').select('metadata').eq('id', release.id).maybeSingle();
  const metadata = withStoredReview(fresh.data?.metadata ?? release.metadata, review);
  const { error } = await adminClient
    .from('releases')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', release.id);
  if (error) return { error: error.message || 'Could not save the review.' };
  return { metadata };
}

async function authorize(request: NextRequest, releaseId: string, write: boolean) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error };
  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }
  const access = write
    ? await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user)
    : await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return { error: access.error };
  return { adminClient, user: auth.user };
}

export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  const authorized = await authorize(request, releaseId, false);
  if ('error' in authorized) return authorized.error;
  const { adminClient, user } = authorized;

  const inputs = await loadReviewInputs(adminClient, releaseId);
  if ('error' in inputs) return NextResponse.json({ error: inputs.error }, { status: 500 });
  const { release, tasks, outcomes } = inputs;

  if (!isReviewDue({ releaseDate: release.release_date }, tasks)) {
    return NextResponse.json({ review: null });
  }

  let view = toView(release, tasks, outcomes);
  const stored = readStoredReview(release.metadata);
  // First open of a well-tracked review: UrgAns writes the verdict once.
  if (!view.thin && !stored.verdict) {
    const verdict = await writeVerdict({ adminClient, view, actorUserId: user.id, ownerUserId: release.owner_user_id });
    const saved = await saveReview(adminClient, release, { ...stored, verdict, verdictAt: new Date().toISOString() });
    if (!('error' in saved)) view = toView(release, tasks, outcomes, saved.metadata);
    else view = { ...view, verdict };
  }
  return NextResponse.json({ review: view });
}

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  const authorized = await authorize(request, releaseId, true);
  if ('error' in authorized) return authorized.error;
  const { adminClient, user } = authorized;

  const parsed = parseReviewAnswers(await request.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const inputs = await loadReviewInputs(adminClient, releaseId);
  if ('error' in inputs) return NextResponse.json({ error: inputs.error }, { status: 500 });
  const { release, tasks, outcomes } = inputs;
  if (!isReviewDue({ releaseDate: release.release_date }, tasks)) {
    return NextResponse.json({ error: 'The review opens 28 days after release day.' }, { status: 409 });
  }

  const stored = readStoredReview(release.metadata);
  const nowIso = new Date().toISOString();
  const draft: StoredReview = { ...stored, answers: parsed.answers, answeredAt: hasAnswers(parsed.answers) ? nowIso : null };
  const draftView = toView(release, tasks, outcomes, withStoredReview(release.metadata, draft));
  const verdict =
    draftView.thin && !hasAnswers(parsed.answers)
      ? null
      : await writeVerdict({ adminClient, view: draftView, actorUserId: user.id, ownerUserId: release.owner_user_id });
  const saved = await saveReview(adminClient, release, { ...draft, verdict, verdictAt: verdict ? nowIso : null });
  if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ review: toView(release, tasks, outcomes, saved.metadata) });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  const authorized = await authorize(request, releaseId, true);
  if ('error' in authorized) return authorized.error;
  const { adminClient } = authorized;

  const body = (await request.json().catch(() => null)) as { dismissed?: unknown } | null;
  if (!body || typeof body.dismissed !== 'boolean') {
    return NextResponse.json({ error: 'dismissed must be true or false.' }, { status: 400 });
  }
  const inputs = await loadReviewInputs(adminClient, releaseId);
  if ('error' in inputs) return NextResponse.json({ error: inputs.error }, { status: 500 });
  const { release, tasks, outcomes } = inputs;
  const stored = readStoredReview(release.metadata);
  const saved = await saveReview(adminClient, release, {
    ...stored,
    dismissedAt: body.dismissed ? new Date().toISOString() : null,
  });
  if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ review: toView(release, tasks, outcomes, saved.metadata) });
}
