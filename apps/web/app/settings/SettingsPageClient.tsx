'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { getRolePermissions } from '@/lib/role-permissions';
import { ASSET_MIME_ALLOWLIST, ASSET_SIZE_LIMITS, formatFileSize } from '@/lib/asset-constants';
import { errorMessage } from '@/lib/errors';
import type { WorkspaceMember } from '@/types/auth';
import { SettingsPageSkeleton } from '@/components/loading/SettingsPageSkeleton';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { SecuritySection } from '@/components/settings/SecuritySection';
import {
  WorkspaceArtistSection,
  type WorkspaceArtist,
} from '@/components/settings/WorkspaceArtistSection';
import {
  WorkspaceLogoSection,
  type WorkspaceLogo,
} from '@/components/settings/WorkspaceLogoSection';
import { ArtistProfileSection } from '@/components/settings/ArtistProfileSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { TeammatesSection } from '@/components/settings/TeammatesSection';
import { ReleasesSection } from '@/components/settings/ReleasesSection';
import { SessionSection } from '@/components/settings/SessionSection';
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection';

// Workspace artist/logo editors are gated by the same flag that hides the
// legacy artist input in the create-release modal. Lifting to many artists
// later is a UI change only — the schema (artists.workspace_id, partial
// unique on (workspace_id, slug)) already permits multiple rows per
// workspace.
const WORKSPACE_FEATURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

const LOGO_MIME_ALLOWLIST = ASSET_MIME_ALLOWLIST.cover_art;
const LOGO_SIZE_LIMIT = ASSET_SIZE_LIMITS.cover_art;

type WorkspaceArtistResponse = {
  workspaceId?: string;
  artist: WorkspaceArtist | null;
  releasesUpdated?: number;
  error?: string;
};

type WorkspaceLogoResponse = {
  workspaceId?: string;
  logo: WorkspaceLogo | null;
  error?: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const rolePermissions = getRolePermissions(user?.role);
  const isManagerAccount = rolePermissions.role === 'manager';
  const isArtistAccount = user?.role === 'artist';

  // Hoisted, resolved ONCE per mount rather than once per section — the
  // three mount-time loaders below fire within milliseconds of each other,
  // so this dedupes near-simultaneous calls to the same
  // supabase.auth.getSession(), not a page-wide cache. Click-triggered
  // handlers (invite, upload, etc., inside the section components) still
  // fetch their own token fresh — see components/settings/getAccessToken.ts.
  const [accessToken, setAccessToken] = useState('');

  const [teammates, setTeammates] = useState<WorkspaceMember[]>([]);
  const [isLoadingTeammates, setIsLoadingTeammates] = useState(false);

  const [workspaceArtist, setWorkspaceArtist] = useState<WorkspaceArtist | null | undefined>(null);
  const [workspaceArtistInput, setWorkspaceArtistInput] = useState('');
  const [isLoadingWorkspaceArtist, setIsLoadingWorkspaceArtist] = useState(false);
  const [isSavingWorkspaceArtist, setIsSavingWorkspaceArtist] = useState(false);
  const [workspaceArtistMessage, setWorkspaceArtistMessage] = useState('');
  const [workspaceArtistError, setWorkspaceArtistError] = useState('');

  const [workspaceLogo, setWorkspaceLogo] = useState<WorkspaceLogo | null | undefined>(null);
  const [isLoadingWorkspaceLogo, setIsLoadingWorkspaceLogo] = useState(false);
  const [isSavingWorkspaceLogo, setIsSavingWorkspaceLogo] = useState(false);
  const [workspaceLogoMessage, setWorkspaceLogoMessage] = useState('');
  const [workspaceLogoError, setWorkspaceLogoError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getAccessToken().then((token) => {
      if (!cancelled) setAccessToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadTeammates = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingTeammates(true);
    try {
      const response = await fetch('/api/workspace/members', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        members?: WorkspaceMember[];
        error?: string;
      };
      if (response.ok && Array.isArray(payload.members)) {
        setTeammates(payload.members);
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingTeammates(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!user || !isManagerAccount || !accessToken) return;
    void loadTeammates();
  }, [user, isManagerAccount, accessToken, loadTeammates]);

  // Load the workspace artist behind the flag. Mirrors the logo loader's
  // shape so the feedback paths and cleanup-on-unmount semantics stay
  // consistent.
  useEffect(() => {
    if (!user || !WORKSPACE_FEATURE_ENABLED || !accessToken) return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingWorkspaceArtist(true);
      try {
        const response = await fetch('/api/workspace/artist', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as WorkspaceArtistResponse;
        if (cancelled) return;
        if (response.ok) {
          setWorkspaceArtist(payload.artist ?? undefined);
          setWorkspaceArtistInput(payload.artist?.name ?? '');
        }
      } finally {
        if (!cancelled) setIsLoadingWorkspaceArtist(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, accessToken]);

  // Load the workspace logo behind the flag. Mirrors the artist loader's
  // shape so the feedback paths and cleanup-on-unmount semantics stay
  // consistent.
  useEffect(() => {
    if (!user || !WORKSPACE_FEATURE_ENABLED || !accessToken) return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingWorkspaceLogo(true);
      try {
        const response = await fetch('/api/workspace/logo', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as WorkspaceLogoResponse;
        if (cancelled) return;
        if (response.ok) {
          setWorkspaceLogo(payload.logo ?? undefined);
        }
      } finally {
        if (!cancelled) setIsLoadingWorkspaceLogo(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, accessToken]);

  // Same three-step flow as release asset uploads (AssetUploadControl):
  // signed upload URL → PUT bytes directly to storage → record the pointer.
  // Click-triggered, so it fetches its own fresh token rather than reusing
  // the hoisted mount-time one — see the accessToken comment above.
  const handleUploadWorkspaceLogo = async (file: File) => {
    if (!user) return;
    setWorkspaceLogoError('');
    setWorkspaceLogoMessage('');

    const mimeType = file.type || 'application/octet-stream';
    if (!LOGO_MIME_ALLOWLIST.includes(mimeType)) {
      setWorkspaceLogoError('Logo must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > LOGO_SIZE_LIMIT) {
      setWorkspaceLogoError(`Logo must be ${formatFileSize(LOGO_SIZE_LIMIT)} or smaller.`);
      return;
    }

    setIsSavingWorkspaceLogo(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');

      const uploadUrlResponse = await fetch('/api/workspace/logo/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          file_name: file.name,
          mime_type: mimeType,
          file_size: file.size,
        }),
      });
      const uploadUrlPayload = (await uploadUrlResponse.json().catch(() => ({}))) as {
        upload_url?: string;
        storage_path?: string;
        error?: string;
      };
      if (!uploadUrlResponse.ok || !uploadUrlPayload.upload_url || !uploadUrlPayload.storage_path) {
        throw new Error(uploadUrlPayload.error || 'Could not create upload URL.');
      }

      const storageResponse = await fetch(uploadUrlPayload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: file,
      });
      if (!storageResponse.ok) {
        throw new Error(`Storage upload failed (${storageResponse.status}).`);
      }

      const recordResponse = await fetch('/api/workspace/logo', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storage_path: uploadUrlPayload.storage_path,
          file_name: file.name,
        }),
      });
      const recordPayload = (await recordResponse.json().catch(() => ({}))) as WorkspaceLogoResponse;
      if (!recordResponse.ok || !recordPayload.logo) {
        throw new Error(recordPayload.error || 'Could not save logo.');
      }

      setWorkspaceLogo(recordPayload.logo);
      setWorkspaceLogoMessage('Logo saved. Releases without cover art now show it automatically.');
    } catch (err) {
      setWorkspaceLogoError(errorMessage(err, 'Could not upload logo.'));
    } finally {
      setIsSavingWorkspaceLogo(false);
    }
  };

  const handleRemoveWorkspaceLogo = async () => {
    if (!user || !workspaceLogo) return;
    setWorkspaceLogoError('');
    setWorkspaceLogoMessage('');
    setIsSavingWorkspaceLogo(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace/logo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as WorkspaceLogoResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not remove logo.');
      }
      setWorkspaceLogo(undefined);
      setWorkspaceLogoMessage('Logo removed. Releases without cover art show the neutral placeholder again.');
    } catch (err) {
      setWorkspaceLogoError(errorMessage(err, 'Could not remove logo.'));
    } finally {
      setIsSavingWorkspaceLogo(false);
    }
  };

  const handleSaveWorkspaceArtist = async () => {
    if (!user || !workspaceArtist) return;
    setWorkspaceArtistError('');
    setWorkspaceArtistMessage('');
    const trimmed = workspaceArtistInput.trim();
    if (!trimmed) {
      setWorkspaceArtistError('Artist name cannot be empty.');
      return;
    }
    if (trimmed === workspaceArtist.name) {
      setWorkspaceArtistMessage('No changes.');
      return;
    }

    setIsSavingWorkspaceArtist(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace/artist', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as WorkspaceArtistResponse;
      if (!response.ok || !payload.artist) {
        throw new Error(payload.error || 'Could not rename artist.');
      }
      setWorkspaceArtist(payload.artist);
      setWorkspaceArtistInput(payload.artist.name);
      const releasesNote =
        typeof payload.releasesUpdated === 'number' && payload.releasesUpdated > 0
          ? ` (${payload.releasesUpdated} release${payload.releasesUpdated === 1 ? '' : 's'} updated)`
          : '';
      setWorkspaceArtistMessage(`Artist renamed${releasesNote}.`);
    } catch (err) {
      setWorkspaceArtistError(errorMessage(err, 'Could not rename artist.'));
    } finally {
      setIsSavingWorkspaceArtist(false);
    }
  };

  // ONE skeleton, rendered here (no route-segment Suspense fallback). SSR
  // serializes this into HTML; hydration is a no-op reconciliation — no
  // shimmer restart, no blank gap. Stays visible until auth resolves AND
  // the user is known.
  if (authLoading || !user) {
    return (
      <SettingsPageSkeleton
        isManagerAccount={isManagerAccount}
        isArtistAccount={isArtistAccount}
      />
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      {/* Outer chrome wrapper. NO max-width — the outer page width is owned
          by AppShell's mx-auto max-w-[1440px] wrapper (see AppShell.tsx
          PAGE WIDTH SOURCE OF TRUTH). `sm:px-6 pb-24 pt-6` matches
          WorkspaceView so Dashboard ↔ Settings navigation does not jump.
          `relative` is here so the decorative blobs can anchor to the
          full outer width (not the narrower inner form column). */}
      <div className="relative pb-24 pt-6 sm:px-6">
        <div className="pointer-events-none absolute -right-16 -top-12 h-52 w-52 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-status-info/12 blur-3xl" />

        {/* Inner form wrapper. Redesigned 2026-07-23 (founder call): the
            boxed two-column card collage read as plastic. Settings is now ONE
            flat column — sections divided by hairline rules (Linear/PostHog
            style), mono uppercase kickers for section titles, sharp corners
            throughout, per the Brand Bible. The column narrowed 960→760px to
            suit the single-column rhythm. */}
        <div className="relative mx-auto w-full max-w-[760px]">
          {/* No in-page "Settings" heading — the topbar already titles this
              route (AppTopbar routeTitles: eyebrow "Account", title
              "Settings"), so an h1 here doubled the heading. The row keeps
              only the Dashboard shortcut. */}
          <div className="mb-4 flex sm:justify-end">
            <Link
              href="/dashboard"
              className="w-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              Dashboard
            </Link>
          </div>

          <div className="divide-y divide-stroke-subtle">
          <ProfileSection />
          <AppearanceSection />
          <SecuritySection />

          {WORKSPACE_FEATURE_ENABLED && (
            <WorkspaceArtistSection
              artist={workspaceArtist}
              input={workspaceArtistInput}
              onInputChange={setWorkspaceArtistInput}
              isLoading={isLoadingWorkspaceArtist}
              isSaving={isSavingWorkspaceArtist}
              message={workspaceArtistMessage}
              error={workspaceArtistError}
              onSave={() => void handleSaveWorkspaceArtist()}
            />
          )}

          {WORKSPACE_FEATURE_ENABLED && (
            <WorkspaceLogoSection
              logo={workspaceLogo}
              isLoading={isLoadingWorkspaceLogo}
              isSaving={isSavingWorkspaceLogo}
              message={workspaceLogoMessage}
              error={workspaceLogoError}
              mimeAllowlist={LOGO_MIME_ALLOWLIST}
              sizeLimit={LOGO_SIZE_LIMIT}
              onUpload={(file) => void handleUploadWorkspaceLogo(file)}
              onRemove={() => void handleRemoveWorkspaceLogo()}
            />
          )}

          <ArtistProfileSection />
          <NotificationsSection />

          {isManagerAccount && (
            <TeammatesSection
              teammates={teammates}
              isLoadingTeammates={isLoadingTeammates}
              onTeammatesChange={setTeammates}
              onRefetch={() => void loadTeammates()}
            />
          )}

          <ReleasesSection />
          <SessionSection />
          <DeleteAccountSection />
          </div>
        </div>
      </div>
    </main>
  );
}
