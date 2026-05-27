import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
} from '../../_shared';
import { generateStructuredAiOutput, isAiConfigured } from '@/lib/ai/provider';
import {
  buildTailoringMessages,
  parseReleaseContext,
  parseTailoringResponse,
  validateTailoringAgainstTasks,
  type ReleaseContext,
  type TailorableTask,
  type TailoringResponse,
} from '@/lib/release-tailoring';

const RELEASES_TABLE = 'releases';
const TASKS_TABLE = 'tasks';
const TAILORING_TIMEOUT_MS = 30_000;

type ReleaseRow = {
  id: string;
  owner_user_id: string;
  title: string | null;
  artist_name: string | null;
  release_date: string | null;
  release_type: string | null;
  release_context: ReleaseContext | null;
  ai_tailoring_response: unknown;
};

type TaskMetadataRow = {
  id: string;
  title: string | null;
  description: string | null;
  metadata: unknown;
};

async function loadOwnedRelease(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string,
  userId: string
): Promise<{ release: ReleaseRow } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(RELEASES_TABLE)
    .select('id,owner_user_id,title,artist_name,release_date,release_type,release_context,ai_tailoring_response')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: NextResponse.json({ error: 'Release schema is incomplete.' }, { status: 501 }) };
    }
    return { error: NextResponse.json({ error: error.message || 'Could not load release.' }, { status: 500 }) };
  }

  if (!data || String(data.owner_user_id) !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return { release: data as ReleaseRow };
}

function toTailorableTask(row: TaskMetadataRow): TailorableTask {
  const template =
    row.metadata && typeof row.metadata === 'object'
      ? ((row.metadata as { template?: unknown }).template as Record<string, unknown> | undefined)
      : undefined;
  const tags = Array.isArray(template?.tags) ? (template?.tags as unknown[]).map(String) : [];
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    optional: template?.optional === true,
    tags,
    template_task_id: typeof template?.task_id === 'string' ? template.task_id : '',
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;

  return NextResponse.json({
    context: loaded.release.release_context ?? null,
    has_tailoring: Boolean(loaded.release.ai_tailoring_response),
    last_response: loaded.release.ai_tailoring_response ?? null,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'AI tailoring is not configured on this environment.' },
      { status: 503 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;
  const release = loaded.release;

  const body = (await request.json().catch(() => null)) as { context?: unknown } | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body with a context object is required.' }, { status: 400 });
  }

  const contextResult = parseReleaseContext(body.context);
  if (!contextResult.ok) {
    return NextResponse.json({ error: contextResult.error }, { status: 400 });
  }
  const releaseContext = contextResult.context;

  // Only template-generated tasks are tailorable; user-created tasks are left
  // alone.
  const tasksResult = await adminClient
    .from(TASKS_TABLE)
    .select('id,title,description,metadata')
    .eq('release_id', releaseId)
    .eq('auto_generated', true);

  if (tasksResult.error) {
    return NextResponse.json(
      { error: tasksResult.error.message || 'Could not load tasks.' },
      { status: 500 }
    );
  }

  const tasks = (tasksResult.data || []).map((row) => toTailorableTask(row as TaskMetadataRow));
  if (tasks.length === 0) {
    return NextResponse.json(
      { error: 'No template-generated tasks to tailor for this release.' },
      { status: 400 }
    );
  }

  const messages = buildTailoringMessages({
    release: {
      title: release.title || '',
      artistName: release.artist_name || '',
      releaseDate: release.release_date,
      releaseType: release.release_type || 'single',
    },
    context: releaseContext,
    tasks,
  });

  // --- Call the model ---------------------------------------------------------
  let aiResponse: TailoringResponse;
  try {
    aiResponse = await generateStructuredAiOutput<TailoringResponse>({
      messages,
      timeoutMs: TAILORING_TIMEOUT_MS,
      maxRetries: 2,
      model: process.env.AI_TAILORING_MODEL || undefined,
      parse: parseTailoringResponse,
      invalidFormatMessage: 'AI response could not be parsed as the expected JSON.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI tailoring failed.';
    const status = (error as { status?: number } | null)?.status;
    const isAbort =
      (error as { name?: string } | null)?.name === 'AbortError' || /abort/i.test(message);

    if (isAbort) {
      return NextResponse.json({ error: 'Tailoring took too long. Try again.' }, { status: 504 });
    }
    if (status === 429 || /rate[- ]limit/i.test(message)) {
      return NextResponse.json(
        { error: 'Tailoring service is busy. Try again in a moment.' },
        { status: 503 }
      );
    }
    if (/parse|json|format/i.test(message)) {
      return NextResponse.json(
        { error: "AI response couldn't be parsed. No changes made." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Tailoring service is unavailable. Try again in a moment.' },
      { status: 503 }
    );
  }

  // --- Validate the model's references before touching anything ---------------
  const validation = validateTailoringAgainstTasks(aiResponse, tasks);
  if (!validation.ok) {
    console.error('Tailoring validation failed:', validation.error);
    return NextResponse.json(
      { error: 'AI suggested invalid changes. No changes made.' },
      { status: 500 }
    );
  }

  // --- Apply (removals, then modifications) -----------------------------------
  const removeIds = Array.from(new Set(aiResponse.remove_task_ids));
  let tasksRemoved = 0;
  if (removeIds.length > 0) {
    const deleteResult = await adminClient
      .from(TASKS_TABLE)
      .delete()
      .in('id', removeIds)
      .eq('release_id', releaseId)
      .eq('auto_generated', true);
    if (deleteResult.error) {
      return NextResponse.json(
        { error: deleteResult.error.message || 'Could not apply task removals.' },
        { status: 500 }
      );
    }
    tasksRemoved = removeIds.length;
  }

  let tasksModified = 0;
  for (const mod of aiResponse.modify_tasks) {
    const updateResult = await adminClient
      .from(TASKS_TABLE)
      .update({ description: mod.new_description, updated_at: new Date().toISOString() })
      .eq('id', mod.id)
      .eq('release_id', releaseId)
      .eq('auto_generated', true);
    if (updateResult.error) {
      console.error('Failed to apply description update for task', mod.id, updateResult.error);
      continue;
    }
    tasksModified += 1;
  }

  // --- Persist context + audit response ---------------------------------------
  const tailoredAt = new Date().toISOString();
  const persistResult = await adminClient
    .from(RELEASES_TABLE)
    .update({
      release_context: releaseContext,
      ai_tailoring_response: { ...aiResponse, tailored_at: tailoredAt },
    })
    .eq('id', releaseId);
  if (persistResult.error) {
    console.error('Tailoring applied but failed to persist context/audit:', persistResult.error);
    // Non-fatal: the task changes already landed. Report success so the user
    // sees the result; the audit record just didn't save.
  }

  return NextResponse.json({
    tasks_removed: tasksRemoved,
    tasks_modified: tasksModified,
    ai_response: aiResponse,
    tailored_at: tailoredAt,
  });
}
