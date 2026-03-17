import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_COLLABORATORS_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  isOptionalTableMissingError,
} from '@/app/api/releases/_shared';

const loadLookup = async (token: string) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { error: NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 }) };
  }

  const adminClient = createAdminClient(supabaseUrl);
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 }) };
  }

  const collaboratorResult = await adminClient
    .from(RELEASE_COLLABORATORS_TABLE)
    .select('id,release_id,invite_name,invite_contact,role,status,submission_token,submitted_at')
    .eq('submission_token', token)
    .maybeSingle();

  if (collaboratorResult.error) {
    if (isOptionalTableMissingError(collaboratorResult.error)) {
      return { error: buildMissingTableResponse() };
    }
    return {
      error: NextResponse.json(
        { error: collaboratorResult.error.message || 'Could not load credit request.' },
        { status: 500 }
      ),
    };
  }

  if (!collaboratorResult.data) {
    return { error: NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 }) };
  }

  const releaseResult = await adminClient
    .from('releases')
    .select('id,title,artist_name,release_date')
    .eq('id', collaboratorResult.data.release_id)
    .maybeSingle();

  if (releaseResult.error) {
    if (isOptionalTableMissingError(releaseResult.error)) {
      return { error: buildMissingTableResponse() };
    }
    return {
      error: NextResponse.json(
        { error: releaseResult.error.message || 'Could not load release context.' },
        { status: 500 }
      ),
    };
  }

  if (!releaseResult.data) {
    return { error: NextResponse.json({ error: 'This release is unavailable.' }, { status: 404 }) };
  }

  return {
    collaborator: collaboratorResult.data,
    release: releaseResult.data,
  };
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: 'Submission token is required.' }, { status: 400 });

  const lookup = await loadLookup(token);
  if ('error' in lookup) return lookup.error;

  return NextResponse.json({
    release: {
      id: String(lookup.release.id || ''),
      title: String(lookup.release.title || ''),
      artistName: String(lookup.release.artist_name || ''),
      releaseDate: lookup.release.release_date ? String(lookup.release.release_date) : null,
    },
    collaboratorRequest: {
      id: String(lookup.collaborator.id || ''),
      inviteName: String(lookup.collaborator.invite_name || ''),
      requestedRole: String(lookup.collaborator.role || 'other'),
      status: String(lookup.collaborator.status || 'pending'),
      submittedAt: lookup.collaborator.submitted_at ? String(lookup.collaborator.submitted_at) : null,
    },
  });
}
