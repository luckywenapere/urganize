import { NextRequest, NextResponse } from 'next/server';
import {
  CREDITS_COLLECTION_SQL,
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
} from '@/app/api/credits/_shared';
import {
  CONTRIBUTOR_SUBMISSIONS_TABLE,
  normalizeSubmissionInput,
  toClientContributorSubmission,
  validateContributorSubmissionInput,
} from '@/lib/credits';

const buildTableMissingResponse = () =>
  NextResponse.json(
    { error: 'Credits collection tables are missing.', sql: CREDITS_COLLECTION_SQL },
    { status: 501 }
  );

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ planId: string; submissionId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId, submissionId } = await context.params;
  if (!planId || !submissionId) {
    return NextResponse.json({ error: 'Plan id and submission id are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const input = normalizeSubmissionInput(await request.json().catch(() => ({})));
  const validation = validateContributorSubmissionInput(input);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const updateResult = await adminClient!
    .from(CONTRIBUTOR_SUBMISSIONS_TABLE)
    .update({
      legal_full_name: input.legalFullName,
      credited_name: input.creditedName,
      email: input.email,
      phone_number: input.phoneNumber,
      role_type: input.roleType,
      contribution_notes: input.contributionNotes,
      performing_name_if_different: input.performingNameIfDifferent,
      pro_affiliation: input.proAffiliation,
      ipi_cae_number: input.ipiCaeNumber,
      publisher_name: input.publisherName,
      split_percentage: input.splitPercentage ? Number(input.splitPercentage) : null,
      is_split_confirmed: input.isSplitConfirmed,
      country: input.country,
      social_handle: input.socialHandle,
      additional_notes: input.additionalNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('release_id', planId)
    .eq('id', submissionId)
    .select(
      'id,release_id,collection_link_id,legal_full_name,credited_name,email,phone_number,role_type,contribution_notes,performing_name_if_different,pro_affiliation,ipi_cae_number,publisher_name,split_percentage,is_split_confirmed,country,social_handle,additional_notes,submission_status,submitted_at,updated_at'
    )
    .maybeSingle();

  if (updateResult.error) {
    if (isOptionalTableMissingError(updateResult.error)) {
      return buildTableMissingResponse();
    }
    return NextResponse.json({ error: updateResult.error.message || 'Could not update submission.' }, { status: 500 });
  }

  if (!updateResult.data) {
    return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
  }

  return NextResponse.json({
    submission: toClientContributorSubmission(updateResult.data as Record<string, unknown>),
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ planId: string; submissionId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId, submissionId } = await context.params;
  if (!planId || !submissionId) {
    return NextResponse.json({ error: 'Plan id and submission id are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const deleteResult = await adminClient!
    .from(CONTRIBUTOR_SUBMISSIONS_TABLE)
    .delete()
    .eq('release_id', planId)
    .eq('id', submissionId);

  if (deleteResult.error) {
    if (isOptionalTableMissingError(deleteResult.error)) {
      return buildTableMissingResponse();
    }
    return NextResponse.json({ error: deleteResult.error.message || 'Could not delete submission.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
