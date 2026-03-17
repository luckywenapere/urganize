import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ARTISTS_TABLE,
  COLLABORATORS_TABLE,
  CREDIT_SUBMISSIONS_TABLE,
  RELEASE_COLLABORATORS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  RELEASE_OPS_SQL,
  buildReleaseMetadataPayload,
  calculateReleaseReadiness,
  type CreditSubmission,
  type ReleaseMetadataSnapshot,
  type ReleaseSummary,
} from '@/lib/release-ops';

export {
  ARTISTS_TABLE,
  COLLABORATORS_TABLE,
  CREDIT_SUBMISSIONS_TABLE,
  RELEASE_COLLABORATORS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  RELEASE_OPS_SQL,
};

export const isOptionalTableMissingError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('column') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
};

export const getAuthenticatedUser = async (request: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, supabaseUrl };
};

export const createAdminClient = (supabaseUrl: string) => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
};

export const buildMissingTableResponse = () =>
  NextResponse.json({ error: 'Release operations tables are missing.', sql: RELEASE_OPS_SQL }, { status: 501 });

export const toReleaseSummary = (row: Record<string, unknown>): ReleaseSummary => ({
  id: String(row.id || ''),
  ownerUserId: String(row.owner_user_id || row.user_id || ''),
  artistId: String(row.artist_id || ''),
  artistName: String(row.artist_name || ''),
  title: String(row.title || ''),
  slug: String(row.slug || ''),
  releaseDate: String(row.release_date || ''),
  status: (String(row.status || 'draft') as ReleaseSummary['status']) || 'draft',
  description: String(row.description || ''),
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

export async function ensureReleaseOwnership(
  adminClient: ReturnType<typeof createAdminClient>,
  releaseId: string,
  userId: string
) {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,user_id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,created_at,updated_at')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingTableResponse() };
    }
    return { error: NextResponse.json({ error: error.message || 'Could not load release.' }, { status: 500 }) };
  }

  const ownerId = String(release?.owner_user_id || release?.user_id || '');
  if (!release || ownerId !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return { release: toReleaseSummary(release as Record<string, unknown>) };
}

export const toCreditSubmission = (row: Record<string, unknown>): CreditSubmission => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  releaseCollaboratorId: String(row.release_collaborator_id || ''),
  legalName: String(row.legal_name || ''),
  stageName: String(row.stage_name || ''),
  role: String(row.role || 'other'),
  email: String(row.email || ''),
  phone: String(row.phone || ''),
  publishingInfo: String(row.publishing_info || ''),
  splitPercentage: row.split_percentage == null ? '' : String(row.split_percentage),
  proAffiliation: String(row.pro_affiliation || ''),
  ipiNumber: String(row.ipi_number || ''),
  notes: String(row.notes || ''),
  submittedAt: String(row.submitted_at || ''),
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

export const toMetadataSnapshot = (row: Record<string, unknown> | null | undefined): ReleaseMetadataSnapshot | null => {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    releaseId: String(row.release_id || ''),
    isrc: String(row.isrc || ''),
    upc: String(row.upc || ''),
    primaryArtistName: String(row.primary_artist_name || ''),
    releaseTitle: String(row.release_title || ''),
    genre: String(row.genre || ''),
    subgenre: String(row.subgenre || ''),
    labelName: String(row.label_name || ''),
    language: String(row.language || ''),
    explicit: row.explicit === null || row.explicit === undefined ? null : Boolean(row.explicit),
    artworkUrl: String(row.artwork_url || ''),
    producerCredits: Array.isArray(row.producer_credits_json) ? (row.producer_credits_json as Array<Record<string, unknown>>) : [],
    writerCredits: Array.isArray(row.writer_credits_json) ? (row.writer_credits_json as Array<Record<string, unknown>>) : [],
    featuredArtistCredits: Array.isArray(row.featured_artist_credits_json) ? (row.featured_artist_credits_json as Array<Record<string, unknown>>) : [],
    mixingCredits: Array.isArray(row.mixing_credits_json) ? (row.mixing_credits_json as Array<Record<string, unknown>>) : [],
    masteringCredits: Array.isArray(row.mastering_credits_json) ? (row.mastering_credits_json as Array<Record<string, unknown>>) : [],
    allCredits: Array.isArray(row.all_credits_json) ? (row.all_credits_json as Array<Record<string, unknown>>) : [],
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
};

export async function rebuildReleaseMetadataSnapshot(
  adminClient: SupabaseClient,
  release: ReleaseSummary
) {
  const submissionsResult = await adminClient
    .from(CREDIT_SUBMISSIONS_TABLE)
    .select('*')
    .eq('release_id', release.id)
    .order('submitted_at', { ascending: true });

  if (submissionsResult.error) {
    if (isOptionalTableMissingError(submissionsResult.error)) {
      return { error: buildMissingTableResponse() };
    }
    return {
      error: NextResponse.json(
        { error: submissionsResult.error.message || 'Could not rebuild release metadata.' },
        { status: 500 }
      ),
    };
  }

  const submissions = Array.isArray(submissionsResult.data)
    ? submissionsResult.data.map((row) => toCreditSubmission(row as Record<string, unknown>))
    : [];

  const payload = buildReleaseMetadataPayload(release, submissions);
  const upsertResult = await adminClient
    .from(RELEASE_METADATA_TABLE)
    .upsert(
      {
        release_id: release.id,
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'release_id' }
    )
    .select('*')
    .single();

  if (upsertResult.error) {
    if (isOptionalTableMissingError(upsertResult.error)) {
      return { error: buildMissingTableResponse() };
    }
    return {
      error: NextResponse.json(
        { error: upsertResult.error.message || 'Could not rebuild release metadata.' },
        { status: 500 }
      ),
    };
  }

  return {
    metadata: toMetadataSnapshot(upsertResult.data as Record<string, unknown>),
    submissions,
  };
}

export async function loadReleaseCommandCenterData(
  adminClient: SupabaseClient,
  release: ReleaseSummary
) {
  const [collaboratorsResult, metadataResult] = await Promise.all([
    adminClient
      .from(RELEASE_COLLABORATORS_TABLE)
      .select('*, collaborators(id,full_name,stage_name,email,phone)')
      .eq('release_id', release.id)
      .order('created_at', { ascending: true }),
    adminClient.from(RELEASE_METADATA_TABLE).select('*').eq('release_id', release.id).maybeSingle(),
  ]);

  const error = collaboratorsResult.error || metadataResult.error;
  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingTableResponse() };
    }
    return { error: NextResponse.json({ error: error.message || 'Could not load release data.' }, { status: 500 }) };
  }

  const collaboratorRows = Array.isArray(collaboratorsResult.data) ? collaboratorsResult.data : [];
  const collaboratorIds = collaboratorRows.map((row) => String(row.id || '')).filter(Boolean);
  const submissionsResult = collaboratorIds.length
    ? await adminClient
        .from(CREDIT_SUBMISSIONS_TABLE)
        .select('*')
        .in('release_collaborator_id', collaboratorIds)
    : { data: [], error: null };

  if (submissionsResult.error) {
    if (isOptionalTableMissingError(submissionsResult.error)) {
      return { error: buildMissingTableResponse() };
    }
    return {
      error: NextResponse.json({ error: submissionsResult.error.message || 'Could not load submissions.' }, { status: 500 }),
    };
  }

  const submissionByCollaboratorId = new Map<string, CreditSubmission>();
  for (const row of submissionsResult.data || []) {
    const submission = toCreditSubmission(row as Record<string, unknown>);
    submissionByCollaboratorId.set(submission.releaseCollaboratorId, submission);
  }

  const collaborators = collaboratorRows.map((row) => {
    const collaboratorRecord = Array.isArray(row.collaborators) ? row.collaborators[0] : row.collaborators;
    return {
      id: String(row.id || ''),
      releaseId: String(row.release_id || ''),
      collaboratorId: String(row.collaborator_id || ''),
      inviteName: String(row.invite_name || ''),
      inviteContact: String(row.invite_contact || ''),
      role: String(row.role || 'other'),
      status: String(row.status || 'pending') as 'pending' | 'submitted',
      submissionToken: String(row.submission_token || ''),
      submissionSentAt: row.submission_sent_at ? String(row.submission_sent_at) : null,
      submittedAt: row.submitted_at ? String(row.submitted_at) : null,
      lastRemindedAt: row.last_reminded_at ? String(row.last_reminded_at) : null,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
      collaboratorName: String(collaboratorRecord?.full_name || ''),
      stageName: String(collaboratorRecord?.stage_name || ''),
      email: String(collaboratorRecord?.email || ''),
      phone: String(collaboratorRecord?.phone || ''),
      submission: submissionByCollaboratorId.get(String(row.id || '')) || null,
    };
  });

  const metadata = toMetadataSnapshot((metadataResult.data || null) as Record<string, unknown> | null);
  const readiness = calculateReleaseReadiness({
    title: release.title,
    artistName: release.artistName,
    releaseDate: release.releaseDate,
    collaboratorCount: collaborators.length,
    submittedCount: collaborators.filter((item) => item.status === 'submitted').length,
    metadata,
    creditSubmissionCount: submissionByCollaboratorId.size,
  });

  return { collaborators, metadata, readiness };
}
