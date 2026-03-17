import { NextRequest, NextResponse } from 'next/server';
import {
  COLLABORATORS_TABLE,
  CREDIT_SUBMISSIONS_TABLE,
  RELEASE_COLLABORATORS_TABLE,
  RELEASE_EVENTS_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  isOptionalTableMissingError,
  rebuildReleaseMetadataSnapshot,
  toReleaseSummary,
} from '@/app/api/releases/_shared';
import { normalizeCreditSubmissionInput, validateCreditSubmissionInput } from '@/lib/release-ops';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const submissionRateLimit = new Map<string, number[]>();

const getRateLimitKey = (request: NextRequest, token: string) => {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const ip = forwardedFor.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${token}:${ip}`;
};

const isRateLimited = (key: string) => {
  const now = Date.now();
  const recent = (submissionRateLimit.get(key) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    submissionRateLimit.set(key, recent);
    return true;
  }
  recent.push(now);
  submissionRateLimit.set(key, recent);
  return false;
};

const findOrCreateCollaborator = async (
  adminClient: ReturnType<typeof createAdminClient>,
  input: ReturnType<typeof normalizeCreditSubmissionInput>
) => {
  const matchByEmail = input.email
    ? await adminClient!
        .from(COLLABORATORS_TABLE)
        .select('id')
        .eq('email', input.email)
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (matchByEmail.error) return { error: matchByEmail.error };
  if (matchByEmail.data?.id) {
    const updateResult = await adminClient!
      .from(COLLABORATORS_TABLE)
      .update({
        full_name: input.legalName,
        stage_name: input.stageName || null,
        email: input.email || null,
        phone: input.phone || null,
        default_role: input.role || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchByEmail.data.id)
      .select('id')
      .single();
    return updateResult.error ? { error: updateResult.error } : { collaboratorId: String(updateResult.data.id || '') };
  }

  const matchByPhone = input.phone
    ? await adminClient!
        .from(COLLABORATORS_TABLE)
        .select('id')
        .eq('phone', input.phone)
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (matchByPhone.error) return { error: matchByPhone.error };
  if (matchByPhone.data?.id) {
    const updateResult = await adminClient!
      .from(COLLABORATORS_TABLE)
      .update({
        full_name: input.legalName,
        stage_name: input.stageName || null,
        email: input.email || null,
        phone: input.phone || null,
        default_role: input.role || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchByPhone.data.id)
      .select('id')
      .single();
    return updateResult.error ? { error: updateResult.error } : { collaboratorId: String(updateResult.data.id || '') };
  }

  const insertResult = await adminClient!
    .from(COLLABORATORS_TABLE)
    .insert({
      full_name: input.legalName,
      stage_name: input.stageName || null,
      email: input.email || null,
      phone: input.phone || null,
      default_role: input.role || null,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  return insertResult.error ? { error: insertResult.error } : { collaboratorId: String(insertResult.data.id || '') };
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: 'Submission token is required.' }, { status: 400 });

  if (isRateLimited(getRateLimitKey(request, token))) {
    return NextResponse.json({ error: 'Too many submission attempts. Please try again shortly.' }, { status: 429 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const adminClient = createAdminClient(supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const collaboratorLookup = await adminClient
    .from(RELEASE_COLLABORATORS_TABLE)
    .select('id,release_id,role,status,submission_token')
    .eq('submission_token', token)
    .maybeSingle();

  if (collaboratorLookup.error) {
    if (isOptionalTableMissingError(collaboratorLookup.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: collaboratorLookup.error.message || 'Could not load credit request.' }, { status: 500 });
  }

  if (!collaboratorLookup.data) {
    return NextResponse.json({ error: 'This credit link is unavailable.' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const submission = normalizeCreditSubmissionInput(body);
  if (!submission.role) {
    submission.role = String(collaboratorLookup.data.role || 'other');
  }
  const validationError = validateCreditSubmissionInput(submission);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const collaboratorRecord = await findOrCreateCollaborator(adminClient, submission);
  if ('error' in collaboratorRecord) {
    const collaboratorError = collaboratorRecord.error;
    if (isOptionalTableMissingError(collaboratorError)) return buildMissingTableResponse();
    return NextResponse.json({ error: collaboratorError?.message || 'Could not save collaborator.' }, { status: 500 });
  }

  const now = new Date().toISOString();
  const submissionResult = await adminClient
    .from(CREDIT_SUBMISSIONS_TABLE)
    .upsert(
      {
        release_id: collaboratorLookup.data.release_id,
        release_collaborator_id: collaboratorLookup.data.id,
        legal_name: submission.legalName,
        stage_name: submission.stageName || null,
        role: submission.role,
        email: submission.email || null,
        phone: submission.phone || null,
        publishing_info: submission.publishingInfo || null,
        split_percentage: submission.splitPercentage ? Number(submission.splitPercentage) : null,
        pro_affiliation: submission.proAffiliation || null,
        ipi_number: submission.ipiNumber || null,
        notes: submission.notes || null,
        submitted_at: now,
        updated_at: now,
      },
      { onConflict: 'release_collaborator_id' }
    )
    .select('id')
    .single();

  if (submissionResult.error) {
    if (isOptionalTableMissingError(submissionResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: submissionResult.error.message || 'Could not save submission.' }, { status: 500 });
  }

  const workflowUpdate = await adminClient
    .from(RELEASE_COLLABORATORS_TABLE)
    .update({
      collaborator_id: collaboratorRecord.collaboratorId,
      status: 'submitted',
      submitted_at: now,
      updated_at: now,
    })
    .eq('id', collaboratorLookup.data.id)
    .select('release_id')
    .single();

  if (workflowUpdate.error) {
    if (isOptionalTableMissingError(workflowUpdate.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: workflowUpdate.error.message || 'Could not update collaborator status.' }, { status: 500 });
  }

  const releaseResult = await adminClient
    .from('releases')
    .select('id,user_id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,created_at,updated_at')
    .eq('id', collaboratorLookup.data.release_id)
    .maybeSingle();

  if (releaseResult.error || !releaseResult.data) {
    if (isOptionalTableMissingError(releaseResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: releaseResult.error?.message || 'Could not load release.' }, { status: 500 });
  }

  const rebuildResult = await rebuildReleaseMetadataSnapshot(adminClient, toReleaseSummary(releaseResult.data as Record<string, unknown>));
  if ('error' in rebuildResult) return rebuildResult.error;

  const eventInsert = await adminClient.from(RELEASE_EVENTS_TABLE).insert([
    {
      release_id: collaboratorLookup.data.release_id,
      type: 'credit_submitted',
      payload_json: {
        releaseCollaboratorId: collaboratorLookup.data.id,
        collaboratorId: collaboratorRecord.collaboratorId,
      },
    },
    {
      release_id: collaboratorLookup.data.release_id,
      type: 'metadata_updated',
      payload_json: {
        rebuiltAt: now,
        submissionCount: rebuildResult.submissions.length,
      },
    },
  ]);

  if (eventInsert.error) {
    if (isOptionalTableMissingError(eventInsert.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: eventInsert.error.message || 'Could not log release events.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Credits submitted successfully.',
    claimProfileEligible: true,
  });
}
