import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  CREDITS_COLLECTION_SQL,
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
} from '@/app/api/credits/_shared';
import {
  CREDIT_COLLECTION_LINKS_TABLE,
  CREDIT_FINALIZATIONS_TABLE,
  CONTRIBUTOR_SUBMISSIONS_TABLE,
  toClientCollectionLink,
  toClientContributorSubmission,
  toClientCreditFinalization,
} from '@/lib/credits';

const buildTableMissingResponse = () =>
  NextResponse.json(
    { error: 'Credits collection tables are missing.', sql: CREDITS_COLLECTION_SQL },
    { status: 501 }
  );

const createCollectionToken = () => randomBytes(24).toString('base64url');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId } = await context.params;
  if (!planId) return NextResponse.json({ error: 'Plan id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const [linkResult, submissionsResult, finalizationResult] = await Promise.all([
    adminClient!
      .from(CREDIT_COLLECTION_LINKS_TABLE)
      .select('id,release_id,token,is_active,created_at,expires_at')
      .eq('release_id', planId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminClient!
      .from(CONTRIBUTOR_SUBMISSIONS_TABLE)
      .select(
        'id,release_id,collection_link_id,legal_full_name,credited_name,email,phone_number,role_type,contribution_notes,performing_name_if_different,pro_affiliation,ipi_cae_number,publisher_name,split_percentage,is_split_confirmed,country,social_handle,additional_notes,submission_status,submitted_at,updated_at'
      )
      .eq('release_id', planId)
      .order('submitted_at', { ascending: false }),
    adminClient!
      .from(CREDIT_FINALIZATIONS_TABLE)
      .select('release_id,is_finalized,finalized_at,finalized_by_user_id')
      .eq('release_id', planId)
      .maybeSingle(),
  ]);

  const errors = [linkResult.error, submissionsResult.error, finalizationResult.error].filter(Boolean);
  if (errors.length > 0) {
    if (errors.some((error) => isOptionalTableMissingError(error))) {
      return buildTableMissingResponse();
    }
    return NextResponse.json({ error: errors[0]?.message || 'Could not load credits state.' }, { status: 500 });
  }

  return NextResponse.json({
    release: {
      id: ownership.release.id,
      title: ownership.release.title,
      artistName: ownership.release.artist_name,
      releaseDate: ownership.release.release_date,
    },
    credits: {
      link: linkResult.data ? toClientCollectionLink(linkResult.data as Record<string, unknown>) : null,
      submissions: Array.isArray(submissionsResult.data)
        ? submissionsResult.data.map((row) => toClientContributorSubmission(row as Record<string, unknown>))
        : [],
      finalization: finalizationResult.data
        ? toClientCreditFinalization(finalizationResult.data as Record<string, unknown>)
        : null,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId } = await context.params;
  if (!planId) return NextResponse.json({ error: 'Plan id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => ({}))) as {
    action?: 'generate-link' | 'finalize' | 'unlock';
  };

  if (body.action === 'generate-link') {
    const deactivateResult = await adminClient!
      .from(CREDIT_COLLECTION_LINKS_TABLE)
      .update({ is_active: false })
      .eq('release_id', planId)
      .eq('is_active', true);

    if (deactivateResult.error && !isOptionalTableMissingError(deactivateResult.error)) {
      return NextResponse.json({ error: deactivateResult.error.message || 'Could not regenerate link.' }, { status: 500 });
    }
    if (deactivateResult.error && isOptionalTableMissingError(deactivateResult.error)) {
      return buildTableMissingResponse();
    }

    const insertResult = await adminClient!
      .from(CREDIT_COLLECTION_LINKS_TABLE)
      .insert({
        release_id: planId,
        token: createCollectionToken(),
        is_active: true,
      })
      .select('id,release_id,token,is_active,created_at,expires_at')
      .single();

    if (insertResult.error) {
      if (isOptionalTableMissingError(insertResult.error)) {
        return buildTableMissingResponse();
      }
      return NextResponse.json({ error: insertResult.error.message || 'Could not generate link.' }, { status: 500 });
    }

    return NextResponse.json({
      link: toClientCollectionLink(insertResult.data as Record<string, unknown>),
    });
  }

  if (body.action === 'finalize') {
    const upsertResult = await adminClient!
      .from(CREDIT_FINALIZATIONS_TABLE)
      .upsert(
        {
          release_id: planId,
          is_finalized: true,
          finalized_at: new Date().toISOString(),
          finalized_by_user_id: auth.user.id,
        },
        { onConflict: 'release_id' }
      )
      .select('release_id,is_finalized,finalized_at,finalized_by_user_id')
      .single();

    if (upsertResult.error) {
      if (isOptionalTableMissingError(upsertResult.error)) {
        return buildTableMissingResponse();
      }
      return NextResponse.json({ error: upsertResult.error.message || 'Could not finalize credits.' }, { status: 500 });
    }

    return NextResponse.json({
      finalization: toClientCreditFinalization(upsertResult.data as Record<string, unknown>),
    });
  }

  if (body.action === 'unlock') {
    const upsertResult = await adminClient!
      .from(CREDIT_FINALIZATIONS_TABLE)
      .upsert(
        {
          release_id: planId,
          is_finalized: false,
          finalized_at: null,
          finalized_by_user_id: null,
        },
        { onConflict: 'release_id' }
      )
      .select('release_id,is_finalized,finalized_at,finalized_by_user_id')
      .single();

    if (upsertResult.error) {
      if (isOptionalTableMissingError(upsertResult.error)) {
        return buildTableMissingResponse();
      }
      return NextResponse.json({ error: upsertResult.error.message || 'Could not unlock credits.' }, { status: 500 });
    }

    return NextResponse.json({
      finalization: toClientCreditFinalization(upsertResult.data as Record<string, unknown>),
    });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
