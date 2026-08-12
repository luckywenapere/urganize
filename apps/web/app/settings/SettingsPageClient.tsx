'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { readPreviousLocation } from '@/lib/nav-history';
import { useAuthStore } from '@/lib/auth-store';
import { getRolePermissions } from '@/lib/role-permissions';
import { errorMessage } from '@/lib/errors';
import { ASSET_MIME_ALLOWLIST, ASSET_SIZE_LIMITS, formatFileSize } from '@/lib/asset-constants';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import type { WorkspaceMember } from '@/types/auth';
import { SettingsPageSkeleton } from '@/components/loading/SettingsPageSkeleton';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { SecuritySection } from '@/components/settings/SecuritySection';
import { WorkspaceIdentitySection } from '@/components/settings/WorkspaceIdentitySection';
import {
  WorkspaceLogoSection,
  type WorkspaceLogo,
} from '@/components/settings/WorkspaceLogoSection';
import {
  WorkspaceArtistSection,
  type WorkspaceArtist,
} from '@/components/settings/WorkspaceArtistSection';
import { ArtistProfileSection } from '@/components/settings/ArtistProfileSection';
import { PushNotificationsSection } from '@/components/settings/PushNotificationsSection';
import { TaskCheckInSection } from '@/components/settings/TaskCheckInSection';
import { TeammatesSection } from '@/components/settings/TeammatesSection';
import { ReleasesSection } from '@/components/settings/ReleasesSection';
import { SessionSection } from '@/components/settings/SessionSection';
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// 2026-07-23 (founder calls): the Workspace logo section was removed from
// Settings entirely (its API routes + read-time cover-art fallback stay
// dormant — an already-uploaded logo keeps working; there's just no UI to
// change it). The old placebo notifications-prefs section was removed the
// same day and replaced by PushNotificationsSection — REAL per-device Web
// Push (see lib/push.ts / lib/push-server.ts).

// Workspace artist/logo editors are gated by the same flag that hides the
// legacy artist input in the create-release modal. Lifting to many artists
// later is a UI change only — the schema (artists.workspace_id, partial
// unique on (workspace_id, slug)) already permits multiple rows per
// workspace.
const WORKSPACE_FEATURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// URG-214: the workspace identity card's editors. Only meaningful once
// workspaces exist, same gate as the card itself and its API routes.
const IDENTITY_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' && WORKSPACE_FEATURE_ENABLED;

const LOGO_MIME_ALLOWLIST = ASSET_MIME_ALLOWLIST.cover_art;
const LOGO_SIZE_LIMIT = ASSET_SIZE_LIMITS.cover_art;

type WorkspaceArtistResponse = {
  workspaceId?: string;
  artist: WorkspaceArtist | null;
  releasesUpdated?: number;
  error?: string;
};

// Cache-first (founder call, 2026-07-23): entering Settings must SHOW
// settings, not loaders. The last-known workspace artist and teammates list
// are persisted per user; a fresh visit renders them instantly while the
// fetches below refresh silently in the background. Same pattern as
// useReleaseStore's command-center cache.
const ARTIST_CACHE_KEY = 'urganize.settings.workspace-artist';
const TEAMMATES_CACHE_KEY = 'urganize.settings.teammates';
const SETTINGS_CACHE_VERSION = 1;

type ArtistCache = { userId: string; artist: WorkspaceArtist | null };
type TeammatesCache = { userId: string; members: WorkspaceMember[] };

const isArtistCache = (value: unknown): value is ArtistCache =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).userId === 'string' &&
  'artist' in (value as Record<string, unknown>);

const isTeammatesCache = (value: unknown): value is TeammatesCache =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).userId === 'string' &&
  Array.isArray((value as Record<string, unknown>).members);

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
  // "Primed" = hydrated from the per-user cache; the sections then render
  // real content immediately and never show their skeletons for this visit.
  const [teammatesPrimed, setTeammatesPrimed] = useState(false);
  const [artistPrimed, setArtistPrimed] = useState(false);

  const [workspaceArtist, setWorkspaceArtist] = useState<WorkspaceArtist | null | undefined>(null);
  const [workspaceArtistInput, setWorkspaceArtistInput] = useState('');
  const [isLoadingWorkspaceArtist, setIsLoadingWorkspaceArtist] = useState(false);
  const [isSavingWorkspaceArtist, setIsSavingWorkspaceArtist] = useState(false);
  const [workspaceArtistMessage, setWorkspaceArtistMessage] = useState('');
  const [workspaceArtistError, setWorkspaceArtistError] = useState('');

  // Workspace identity (name + logo) is sourced from the SAME global store
  // the always-mounted identity card reads (useWorkspaceIdentityStore) —
  // not a separate fetch here. The card (mounted app-wide by AppShell,
  // including on this page) already calls load(); this effect below also
  // calls it defensively so Settings doesn't depend on mount order between
  // sibling components. The store's own recency guard makes the second call
  // a no-op when the card already primed it.
  const identityName = useWorkspaceIdentityStore((state) => state.name);
  const identityLogo = useWorkspaceIdentityStore((state) => state.logo);
  const identityHydrated = useWorkspaceIdentityStore((state) => state.hydrated);
  const loadIdentity = useWorkspaceIdentityStore((state) => state.load);
  const setIdentityName = useWorkspaceIdentityStore((state) => state.setName);
  const setIdentityLogo = useWorkspaceIdentityStore((state) => state.setLogo);

  const [workspaceNameInput, setWorkspaceNameInput] = useState('');
  const [isSavingWorkspaceName, setIsSavingWorkspaceName] = useState(false);
  const [workspaceNameMessage, setWorkspaceNameMessage] = useState('');
  const [workspaceNameError, setWorkspaceNameError] = useState('');

  const [isSavingWorkspaceLogo, setIsSavingWorkspaceLogo] = useState(false);
  const [workspaceLogoMessage, setWorkspaceLogoMessage] = useState('');
  const [workspaceLogoError, setWorkspaceLogoError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
    }
  }, [authLoading, router, user]);

  // Keyed on the user's ID, not the user object: background auth refreshes
  // (token refresh, window refocus) replace the store's user object with a
  // fresh identity for the same person, and keying on the object re-fired
  // every loader below — sections visibly flashed back to their loading
  // states mid-session with no user action. Same person = same effects.
  const userId = user?.id || '';

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getAccessToken().then((token) => {
      if (!cancelled) setAccessToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Cache-first hydration: paint the last-known artist + teammates for THIS
  // user before any fetch resolves. The loaders below still run and replace
  // these with fresh data silently.
  useEffect(() => {
    if (!userId) return;
    const artistCache = readPersistedState<ArtistCache>(
      ARTIST_CACHE_KEY,
      SETTINGS_CACHE_VERSION,
      isArtistCache
    );
    if (artistCache && artistCache.userId === userId) {
      setWorkspaceArtist(artistCache.artist ?? undefined);
      setWorkspaceArtistInput(artistCache.artist?.name ?? '');
      setArtistPrimed(true);
    }
    const teammatesCache = readPersistedState<TeammatesCache>(
      TEAMMATES_CACHE_KEY,
      SETTINGS_CACHE_VERSION,
      isTeammatesCache
    );
    if (teammatesCache && teammatesCache.userId === userId) {
      setTeammates(teammatesCache.members);
      setTeammatesPrimed(true);
    }
  }, [userId]);

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
        if (userId) {
          writePersistedState<TeammatesCache>(TEAMMATES_CACHE_KEY, SETTINGS_CACHE_VERSION, {
            userId,
            members: payload.members,
          });
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingTeammates(false);
    }
  }, [accessToken, userId]);

  // Loads for EVERY account (founder decision, 2026-07-23): teammates see
  // their team read-only; TeammatesSection gates invite/remove internally.
  useEffect(() => {
    if (!userId || !accessToken) return;
    void loadTeammates();
  }, [userId, accessToken, loadTeammates]);

  // Load the workspace artist behind the flag. Mirrors the logo loader's
  // shape so the feedback paths and cleanup-on-unmount semantics stay
  // consistent.
  useEffect(() => {
    if (!userId || !WORKSPACE_FEATURE_ENABLED || !accessToken) return;
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
          writePersistedState<ArtistCache>(ARTIST_CACHE_KEY, SETTINGS_CACHE_VERSION, {
            userId,
            artist: payload.artist ?? null,
          });
        }
      } finally {
        if (!cancelled) setIsLoadingWorkspaceArtist(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, accessToken]);

  useEffect(() => {
    if (!userId || !IDENTITY_PANEL_ENABLED) return;
    void loadIdentity();
  }, [userId, loadIdentity]);

  // Mirrors the artist input's pattern (no dirty-check against in-progress
  // typing) — the store only refreshes on a fresh load, which per the
  // recency guard won't refire mid-edit for a normal Settings visit.
  useEffect(() => {
    if (identityHydrated) setWorkspaceNameInput(identityName);
  }, [identityHydrated, identityName]);

  const handleSaveWorkspaceName = async () => {
    setWorkspaceNameError('');
    setWorkspaceNameMessage('');
    const trimmed = workspaceNameInput.trim();
    if (!trimmed) {
      setWorkspaceNameError('Workspace name cannot be empty.');
      return;
    }
    if (trimmed === identityName) {
      setWorkspaceNameMessage('No changes.');
      return;
    }

    setIsSavingWorkspaceName(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as { name?: string; error?: string };
      if (!response.ok || typeof payload.name !== 'string') {
        throw new Error(payload.error || 'Could not rename workspace.');
      }
      setIdentityName(payload.name);
      setWorkspaceNameInput(payload.name);
      setWorkspaceNameMessage('Workspace renamed.');
    } catch (err) {
      setWorkspaceNameError(errorMessage(err, 'Could not rename workspace.'));
    } finally {
      setIsSavingWorkspaceName(false);
    }
  };

  // Same three-step flow as release asset uploads (AssetUploadControl):
  // signed upload URL → PUT bytes directly to storage → record the pointer.
  const handleUploadWorkspaceLogo = async (file: File) => {
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
      const recordPayload = (await recordResponse.json().catch(() => ({}))) as {
        logo?: WorkspaceLogo | null;
        error?: string;
      };
      if (!recordResponse.ok || !recordPayload.logo) {
        throw new Error(recordPayload.error || 'Could not save logo.');
      }

      setIdentityLogo(recordPayload.logo);
      setWorkspaceLogoMessage('Logo saved. Releases without cover art now show it automatically.');
    } catch (err) {
      setWorkspaceLogoError(errorMessage(err, 'Could not upload logo.'));
    } finally {
      setIsSavingWorkspaceLogo(false);
    }
  };

  const handleRemoveWorkspaceLogo = async () => {
    if (!identityLogo) return;
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
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not remove logo.');
      }
      setIdentityLogo(null);
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
      writePersistedState<ArtistCache>(ARTIST_CACHE_KEY, SETTINGS_CACHE_VERSION, {
        userId,
        artist: payload.artist,
      });
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
    <main className="bg-bg-base text-content-primary">
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
              route. The row carries a BACK button (founder request,
              2026-07-23) that returns to the exact page the user came from
              (via lib/nav-history), falling back to the workspace when
              Settings was opened directly. */}
          <div className="mb-4 flex sm:justify-end">
            <button
              type="button"
              onClick={() => {
                const previous = readPreviousLocation();
                router.push(previous && !previous.startsWith('/settings') ? previous : '/dashboard');
              }}
              className="motion-focus motion-press inline-flex w-full items-center justify-center gap-2 rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          </div>

          {/* Section order — overridden 2026-08-05 (founder call): Teammates
              leads now, ahead of even the workspace artist. The prior order
              (2026-07-23) put the artist first on the logic that we're
              serving the artist; this supersedes that for "who's on this
              team" specifically. Below Teammates the original ordering
              holds: workspace identity/artist, then the day-to-day surfaces
              (profile, appearance, releases), then account plumbing
              (password, session, delete) at the bottom where rarely-used,
              high-consequence actions belong. */}
          <div className="divide-y divide-stroke-subtle">
          {/* Rendered for every account — the section itself is read-only
              for non-managers (the shared "who's on this team" surface). */}
          <TeammatesSection
            teammates={teammates}
            isLoadingTeammates={isLoadingTeammates && !teammatesPrimed}
            onTeammatesChange={(next) => {
              setTeammates(next);
              if (userId) {
                writePersistedState<TeammatesCache>(TEAMMATES_CACHE_KEY, SETTINGS_CACHE_VERSION, {
                  userId,
                  members: next,
                });
              }
            }}
            onRefetch={() => void loadTeammates()}
          />

          {/* Workspace identity + logo share one row (founder call,
              2026-08-05): a natural pair — both just feed the workspace card
              shown across the app — same two-column-from-sm pattern as
              Appearance + Notifications below. */}
          {IDENTITY_PANEL_ENABLED && (
            <div className="grid gap-x-10 divide-y divide-stroke-subtle sm:grid-cols-2 sm:divide-y-0">
              <WorkspaceIdentitySection
                input={workspaceNameInput}
                onInputChange={setWorkspaceNameInput}
                isLoading={!identityHydrated}
                isSaving={isSavingWorkspaceName}
                message={workspaceNameMessage}
                error={workspaceNameError}
                onSave={() => void handleSaveWorkspaceName()}
              />
              <WorkspaceLogoSection
                logo={identityLogo}
                isLoading={!identityHydrated}
                isSaving={isSavingWorkspaceLogo}
                message={workspaceLogoMessage}
                error={workspaceLogoError}
                mimeAllowlist={LOGO_MIME_ALLOWLIST}
                sizeLimit={LOGO_SIZE_LIMIT}
                onUpload={(file) => void handleUploadWorkspaceLogo(file)}
                onRemove={() => void handleRemoveWorkspaceLogo()}
              />
            </div>
          )}

          {WORKSPACE_FEATURE_ENABLED && (
            <WorkspaceArtistSection
              artist={workspaceArtist}
              input={workspaceArtistInput}
              onInputChange={setWorkspaceArtistInput}
              isLoading={isLoadingWorkspaceArtist && !artistPrimed}
              isSaving={isSavingWorkspaceArtist}
              message={workspaceArtistMessage}
              error={workspaceArtistError}
              onSave={() => void handleSaveWorkspaceArtist()}
            />
          )}

          <ArtistProfileSection />
          <ProfileSection />
          {/* Appearance + Notifications share one row (founder call,
              2026-07-23): both are small per-device toggles. One divide-y
              child, two columns from sm up; stacked below sm with their own
              hairline (the sm:divide-y-0 flip). If push is unsupported the
              Notifications half renders null and Appearance keeps its
              column. */}
          <div className="grid gap-x-10 divide-y divide-stroke-subtle sm:grid-cols-2 sm:divide-y-0">
            <AppearanceSection />
            <PushNotificationsSection />
          </div>

          <TaskCheckInSection />
          <ReleasesSection />
          <SecuritySection />
          <SessionSection />
          <DeleteAccountSection />
          </div>
        </div>
      </div>
    </main>
  );
}
