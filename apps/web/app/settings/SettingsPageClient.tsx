'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { getRolePermissions } from '@/lib/role-permissions';
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
import { ArtistProfileSection } from '@/components/settings/ArtistProfileSection';
import { PushNotificationsSection } from '@/components/settings/PushNotificationsSection';
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

  useEffect(() => {
    if (!userId || !isManagerAccount || !accessToken) return;
    void loadTeammates();
  }, [userId, isManagerAccount, accessToken, loadTeammates]);

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
              route (AppTopbar routeTitles: eyebrow "Account", title
              "Settings"), so an h1 here doubled the heading. The row keeps
              only the Dashboard shortcut. */}
          <div className="mb-4 flex sm:justify-end">
            <Link
              href="/dashboard"
              className="w-full rounded-full border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              Dashboard
            </Link>
          </div>

          {/* Section order (founder call, 2026-07-23): the workspace artist
              leads — we're serving the artist, so the artist comes first.
              Then the day-to-day surfaces (profile, appearance, team,
              releases), and account plumbing (password, session, delete)
              sits at the bottom where rarely-used, high-consequence actions
              belong. */}
          <div className="divide-y divide-stroke-subtle">
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

          {isManagerAccount && (
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
          )}

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
