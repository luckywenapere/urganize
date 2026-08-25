import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import {
  TEAM_BRIEF_SECTION_MAX_CHARS,
  canEditTeamBrief,
  isTeamBriefEnabled,
  isTeamBriefSection,
  normalizeBriefContent,
} from '@/lib/team-brief';
import {
  loadBriefEditRestricted,
  loadTeamBrief,
  saveTeamBriefSection,
} from '@/lib/team-brief-server';

// The team brief: read it, write one section at a time.
//
// Deliberately NOT modelled on /api/workspace/artist, which carries the
// deprecated schema-missing-fallback helpers that lib/schema-fallback-guard.
// test.ts freezes — that route is a grandfathered baseline entry, not a
// template. This follows /api/workspace/logo's plain error handling instead.
//
// One section per request rather than the whole brief: the editor saves each
// section on its own, and a whole-document PATCH would let one person's stale
// copy of section A silently overwrite what someone else just wrote in it.

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function GET(request: NextRequest) {
  if (!isTeamBriefEnabled()) return notFound();

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'No team found.' }, { status: 404 });
    }
    const role = roleFor(access, access.primaryWorkspaceId);
    const brief = await loadTeamBrief(auth.adminClient, access.primaryWorkspaceId, role);
    return NextResponse.json(brief);
  } catch (error) {
    console.error('[team-brief] GET failed:', error);
    return NextResponse.json({ error: 'Could not load the brief.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isTeamBriefEnabled()) return notFound();

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const section = (body as { section?: unknown } | null)?.section;
  if (!isTeamBriefSection(section)) {
    return NextResponse.json({ error: 'Unknown section.' }, { status: 400 });
  }
  const raw = (body as { content?: unknown }).content;
  if (typeof raw !== 'string') {
    return NextResponse.json({ error: 'content must be a string.' }, { status: 400 });
  }
  // Over-long content is REFUSED, not silently truncated. The editor enforces
  // the same ceiling from the same constant, so hitting this means something
  // bypassed it — and quietly dropping the tail would lose a manager's words
  // without telling them.
  if (raw.trim().length > TEAM_BRIEF_SECTION_MAX_CHARS) {
    return NextResponse.json(
      { error: `Keep it under ${TEAM_BRIEF_SECTION_MAX_CHARS} characters.` },
      { status: 400 }
    );
  }

  try {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'No team found.' }, { status: 404 });
    }

    // The real gate. `canEdit` on the GET payload is an affordance for the
    // editor; this is what decides.
    const editRestricted = await loadBriefEditRestricted(
      auth.adminClient,
      access.primaryWorkspaceId
    );
    const role = roleFor(access, access.primaryWorkspaceId);
    if (!canEditTeamBrief({ editRestricted, workspaceRole: role })) {
      return NextResponse.json(
        { error: 'Only owners and admins can edit the brief for this team.' },
        { status: 403 }
      );
    }

    const result = await saveTeamBriefSection(auth.adminClient, {
      workspaceId: access.primaryWorkspaceId,
      section,
      content: normalizeBriefContent(raw),
      userId: auth.user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const brief = await loadTeamBrief(auth.adminClient, access.primaryWorkspaceId, role);
    return NextResponse.json(brief);
  } catch (error) {
    console.error('[team-brief] PATCH failed:', error);
    return NextResponse.json({ error: 'Could not save the brief.' }, { status: 500 });
  }
}

type Access = Awaited<ReturnType<typeof loadWorkspaceAccessContext>>;

/** The caller's role in one specific team. Null when they hold no membership
 *  row there, which canEditTeamBrief treats as "cannot edit". */
function roleFor(access: Access, workspaceId: string): string | null {
  const membership = access.memberships.find((m) => m.workspaceId === workspaceId);
  return membership?.role ?? null;
}
