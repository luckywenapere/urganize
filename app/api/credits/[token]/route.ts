import { NextRequest, NextResponse } from 'next/server';
import {
  CREDITS_COLLECTION_SQL,
  createAdminClient,
  findActiveCollectionLinkByToken,
  isOptionalTableMissingError,
} from '@/app/api/credits/_shared';
import {
  CONTRIBUTOR_SUBMISSIONS_TABLE,
  CREDIT_FINALIZATIONS_TABLE,
  normalizeSubmissionInput,
  toClientContributorSubmission,
  validateContributorSubmissionInput,
} from '@/lib/credits';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const submissionRateLimit = new Map<string, number[]>();

const buildTableMissingResponse = () =>
  NextResponse.json(
    { error: 'Credits collection tables are missing.', sql: CREDITS_COLLECTION_SQL },
    { status: 501 }
  );

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: 'Credit collection token is required.' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const adminClient = createAdminClient(supabaseUrl);
  const linkResult = await findActiveCollectionLinkByToken(adminClient, token);
  if ('error' in linkResult) return linkResult.error;

  const [releaseResult, finalizationResult] = await Promise.all([
    adminClient!
      .from('releases')
      .select('id,title,artist_name,release_date')
      .eq('id', linkResult.link.release_id)
      .maybeSingle(),
    adminClient!
      .from(CREDIT_FINALIZATIONS_TABLE)
      .select('release_id,is_finalized,finalized_at')
      .eq('release_id', linkResult.link.release_id)
      .maybeSingle(),
  ]);

  const errors = [releaseResult.error, finalizationResult.error].filter(Boolean);
  if (errors.length > 0) {
    if (errors.some((error) => isOptionalTableMissingError(error))) {
      return buildTableMissingResponse();
    }
    return NextResponse.json({ error: errors[0]?.message || 'Could not load credits page.' }, { status: 500 });
  }

  if (!releaseResult.data) {
    return NextResponse.json({ error: 'This release is unavailable.' }, { status: 404 });
  }

  return NextResponse.json({
    release: {
      id: releaseResult.data.id,
      title: releaseResult.data.title,
      artistName: releaseResult.data.artist_name,
      releaseDate: releaseResult.data.release_date,
    },
    link: {
      id: linkResult.link.id,
      isActive: Boolean(linkResult.link.is_active),
      expiresAt: linkResult.link.expires_at,
    },
    finalization: {
      isFinalized: Boolean(finalizationResult.data?.is_finalized),
      finalizedAt: finalizationResult.data?.finalized_at || null,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: 'Credit collection token is required.' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const rateLimitKey = getRateLimitKey(request, token);
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: 'Too many submissions from this device. Please try again shortly.' }, { status: 429 });
  }

  const adminClient = createAdminClient(supabaseUrl);
  const linkResult = await findActiveCollectionLinkByToken(adminClient, token);
  if ('error' in linkResult) return linkResult.error;

  if (linkResult.link.expires_at && new Date(linkResult.link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This credit collection link has expired.' }, { status: 410 });
  }

  const finalizationResult = await adminClient!
    .from(CREDIT_FINALIZATIONS_TABLE)
    .select('is_finalized')
    .eq('release_id', linkResult.link.release_id)
    .maybeSingle();

  if (finalizationResult.error) {
    if (isOptionalTableMissingError(finalizationResult.error)) {
      return buildTableMissingResponse();
    }
    return NextResponse.json({ error: finalizationResult.error.message || 'Could not verify credits state.' }, { status: 500 });
  }

  if (finalizationResult.data?.is_finalized) {
    return NextResponse.json({ error: 'Credits are already finalized for this release.' }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    submissionId?: string;
    submission?: unknown;
  };
  const submissionInput = normalizeSubmissionInput(body.submission);
  const validation = validateContributorSubmissionInput(submissionInput);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const payload = {
    release_id: linkResult.link.release_id,
    collection_link_id: linkResult.link.id,
    legal_full_name: submissionInput.legalFullName,
    credited_name: submissionInput.creditedName,
    email: submissionInput.email,
    phone_number: submissionInput.phoneNumber,
    role_type: submissionInput.roleType,
    contribution_notes: submissionInput.contributionNotes,
    performing_name_if_different: submissionInput.performingNameIfDifferent,
    pro_affiliation: submissionInput.proAffiliation,
    ipi_cae_number: submissionInput.ipiCaeNumber,
    publisher_name: submissionInput.publisherName,
    split_percentage: submissionInput.splitPercentage ? Number(submissionInput.splitPercentage) : null,
    is_split_confirmed: submissionInput.isSplitConfirmed,
    country: submissionInput.country,
    social_handle: submissionInput.socialHandle,
    additional_notes: submissionInput.additionalNotes,
    submission_status: 'submitted',
    updated_at: new Date().toISOString(),
  };

  const requestedSubmissionId = String(body.submissionId || '').trim();
  const mutation = requestedSubmissionId
    ? adminClient!
        .from(CONTRIBUTOR_SUBMISSIONS_TABLE)
        .update(payload)
        .eq('id', requestedSubmissionId)
        .eq('release_id', linkResult.link.release_id)
        .select(
          'id,release_id,collection_link_id,legal_full_name,credited_name,email,phone_number,role_type,contribution_notes,performing_name_if_different,pro_affiliation,ipi_cae_number,publisher_name,split_percentage,is_split_confirmed,country,social_handle,additional_notes,submission_status,submitted_at,updated_at'
        )
        .maybeSingle()
    : adminClient!
        .from(CONTRIBUTOR_SUBMISSIONS_TABLE)
        .insert({
          ...payload,
          submitted_at: new Date().toISOString(),
        })
        .select(
          'id,release_id,collection_link_id,legal_full_name,credited_name,email,phone_number,role_type,contribution_notes,performing_name_if_different,pro_affiliation,ipi_cae_number,publisher_name,split_percentage,is_split_confirmed,country,social_handle,additional_notes,submission_status,submitted_at,updated_at'
        )
        .single();

  const mutationResult = await mutation;
  if (mutationResult.error) {
    if (isOptionalTableMissingError(mutationResult.error)) {
      return buildTableMissingResponse();
    }
    return NextResponse.json({ error: mutationResult.error.message || 'Could not save submission.' }, { status: 500 });
  }

  if (!mutationResult.data) {
    return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
  }

  return NextResponse.json({
    submission: toClientContributorSubmission(mutationResult.data as Record<string, unknown>),
  });
}
