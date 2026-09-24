'use client';

import { useEffect, useState } from 'react';

import { errorMessage } from '@/lib/errors';
import {
  ASSET_MIME_ALLOWLIST,
  MAX_WORKSPACE_LOGO_BYTES,
  formatFileSize,
} from '@/lib/asset-constants';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { prepareAvatarImage } from '@/lib/downscale-image';
import { captureAnalyticsEvent, createPostHogEvent } from '@/lib/analytics';
import {
  buildUploadFailureReport,
  formatUploadFailureCode,
  type UploadStep,
} from '@/lib/upload-failure-report';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { NO_BRAND_COLORS, sameBrandColors, type BrandColors } from '@/lib/social-share-colors';
import { getAccessToken } from './getAccessToken';
import type { WorkspaceLogo } from './WorkspaceLogoSection';
import type { WorkspaceArtist } from './WorkspaceArtistSection';
import {
  ARTIST_CACHE_KEY,
  SETTINGS_CACHE_VERSION,
  isArtistCache,
  type ArtistCache,
} from './settings-cache';

// Workspace artist/logo editors are gated by the same flag that hides the
// legacy artist input in the create-release modal. The roster landed
// 2026-08-30; the schema (artists.workspace_id, partial unique on
// (workspace_id, slug)) had permitted several rows per workspace since June, so
// it was a UI change only, exactly as this comment used to predict.
const WORKSPACE_FEATURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// URG-214: the workspace identity card's editors. Only meaningful once
// workspaces exist, same gate as the card itself and its API routes.
const IDENTITY_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' && WORKSPACE_FEATURE_ENABLED;

export const LOGO_MIME_ALLOWLIST = ASSET_MIME_ALLOWLIST.cover_art;
// Formats shared with cover art, size ceiling deliberately NOT — see
// MAX_WORKSPACE_LOGO_BYTES. Must stay the same constant the upload-url route
// validates against, or the client advertises a limit the server refuses.
export const LOGO_SIZE_LIMIT = MAX_WORKSPACE_LOGO_BYTES;

type WorkspaceArtistListResponse = {
  workspaceId?: string;
  artists?: WorkspaceArtist[];
  /** null means no ceiling, or a tier we could not resolve. Render nothing. */
  artistLimit?: number | null;
  error?: string;
};

type WorkspaceArtistResponse = {
  workspaceId?: string;
  artist: WorkspaceArtist | null;
  releasesUpdated?: number;
  error?: string;
};

export type WorkspaceSettingsState = {
  // Workspace name
  nameInput: string;
  setNameInput: (value: string) => void;
  isSavingName: boolean;
  nameMessage: string;
  nameError: string;
  saveName: () => void;
  // Workspace logo
  logo: WorkspaceLogo | null | undefined;
  isSavingLogo: boolean;
  logoMessage: string;
  logoError: string;
  uploadLogo: (file: File) => void;
  removeLogo: () => void;
  /** Identity store hydration — gates both the name and logo skeletons. */
  identityHydrated: boolean;
  // Workspace artists (the roster)
  artists: WorkspaceArtist[] | undefined;
  /** null = no ceiling, or a tier we could not read. Show nothing either way. */
  artistLimit: number | null;
  isLoadingArtists: boolean;
  /** The artist currently being renamed, so only that row shows a spinner. */
  savingArtistId: string | null;
  isAddingArtist: boolean;
  artistMessage: string;
  artistError: string;
  /** The artist currently being removed, so only that row shows its state. */
  removingArtistId: string | null;
  renameArtist: (artistId: string, name: string) => void;
  addArtist: (name: string) => void;
  removeArtist: (artistId: string) => void;
  // Brand colors for the share images (2026-09-24)
  /** The artist whose colors are being saved, so only that row shows it. */
  savingBrandColorsId: string | null;
  brandColorsMessage: string;
  brandColorsError: string;
  saveBrandColors: (artistId: string, colors: BrandColors) => void;
};

/**
 * Every workspace-level editor's state and round trips, lifted verbatim out of
 * SettingsPageClient (2026-08-13) when Settings became tabbed. This was the
 * bulk of the old 612-line page component — nine of its ~20 state hooks were
 * just isSaving/message/error triplets for these three editors, none of which a
 * non-workspace deployment ever renders.
 *
 * Called unconditionally at page level rather than inside the Workspace tab, so
 * the artist fetch and identity load still fire on page mount exactly as they
 * did before tabs and the tab paints instantly on first open.
 */
export function useWorkspaceSettings(userId: string, accessToken: string): WorkspaceSettingsState {
  const [artists, setArtists] = useState<WorkspaceArtist[] | undefined>(undefined);
  const [artistLimit, setArtistLimit] = useState<number | null>(null);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);
  const [savingArtistId, setSavingArtistId] = useState<string | null>(null);
  const [isAddingArtist, setIsAddingArtist] = useState(false);
  const [removingArtistId, setRemovingArtistId] = useState<string | null>(null);
  const [artistMessage, setArtistMessage] = useState('');
  const [artistError, setArtistError] = useState('');
  const [artistPrimed, setArtistPrimed] = useState(false);
  const [savingBrandColorsId, setSavingBrandColorsId] = useState<string | null>(null);
  const [brandColorsMessage, setBrandColorsMessage] = useState('');
  const [brandColorsError, setBrandColorsError] = useState('');

  // Workspace identity (name + logo) is sourced from the SAME global store
  // the always-mounted identity card reads (useWorkspaceIdentityStore) —
  // not a separate fetch here. The card (mounted app-wide by AppShell,
  // including on this page) already calls load(); the effect below also
  // calls it defensively so Settings doesn't depend on mount order between
  // sibling components. The store's own recency guard makes the second call
  // a no-op when the card already primed it.
  const identityName = useWorkspaceIdentityStore((state) => state.name);
  const identityLogo = useWorkspaceIdentityStore((state) => state.logo);
  const identityHydrated = useWorkspaceIdentityStore((state) => state.hydrated);
  const loadIdentity = useWorkspaceIdentityStore((state) => state.load);
  const setIdentityName = useWorkspaceIdentityStore((state) => state.setName);
  const setIdentityLogo = useWorkspaceIdentityStore((state) => state.setLogo);

  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState('');
  const [nameError, setNameError] = useState('');

  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState('');
  const [logoError, setLogoError] = useState('');

  // Cache-first hydration: paint the last-known artist for THIS user before any
  // fetch resolves. The loader below still runs and replaces it silently.
  useEffect(() => {
    if (!userId) return;
    const cache = readPersistedState<ArtistCache>(
      ARTIST_CACHE_KEY,
      SETTINGS_CACHE_VERSION,
      isArtistCache
    );
    if (cache && cache.userId === userId) {
      setArtists(cache.artists);
      setArtistPrimed(true);
    }
  }, [userId]);

  // Load the roster behind the flag. Mirrors the logo loader's shape so the
  // feedback paths and cleanup-on-unmount semantics stay consistent.
  //
  // The ceiling is deliberately NOT cached alongside the artists: a ceiling
  // changes when a plan changes, and a stale one would tell a manager who just
  // upgraded that they are still capped. Same reasoning as the seat limit on
  // the teammates list.
  useEffect(() => {
    if (!userId || !WORKSPACE_FEATURE_ENABLED || !accessToken) return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingArtists(true);
      try {
        const response = await fetch('/api/workspace/artists', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as WorkspaceArtistListResponse;
        if (cancelled) return;
        if (response.ok) {
          const list = payload.artists ?? [];
          setArtists(list);
          setArtistLimit(payload.artistLimit ?? null);
          writePersistedState<ArtistCache>(ARTIST_CACHE_KEY, SETTINGS_CACHE_VERSION, {
            userId,
            artists: list,
          });
        }
      } finally {
        if (!cancelled) setIsLoadingArtists(false);
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
    if (identityHydrated) setNameInput(identityName);
  }, [identityHydrated, identityName]);

  const saveName = async () => {
    setNameError('');
    setNameMessage('');
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Team name cannot be empty.');
      return;
    }
    if (trimmed === identityName) {
      setNameMessage('No changes.');
      return;
    }

    setIsSavingName(true);
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
        throw new Error(payload.error || 'Could not rename your team.');
      }
      setIdentityName(payload.name);
      setNameInput(payload.name);
      setNameMessage('Team renamed.');
    } catch (err) {
      setNameError(errorMessage(err, 'Could not rename your team.'));
    } finally {
      setIsSavingName(false);
    }
  };

  // Same three-step flow as release asset uploads (AssetUploadControl):
  // signed upload URL → PUT bytes directly to storage → record the pointer.
  const uploadLogo = async (file: File) => {
    setLogoError('');
    setLogoMessage('');

    const mimeType = file.type || 'application/octet-stream';
    if (!LOGO_MIME_ALLOWLIST.includes(mimeType)) {
      setLogoError('Logo must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > LOGO_SIZE_LIMIT) {
      setLogoError(`Logo must be ${formatFileSize(LOGO_SIZE_LIMIT)} or smaller.`);
      return;
    }

    setIsSavingLogo(true);
    // Which of the three steps we are on, so a failure can say how far it got
    // (see lib/upload-failure-report.ts for why this is reported at all).
    let step: UploadStep = 1;
    let status: number | undefined;
    try {
      // Shrink before uploading. Byte size alone never caught the file that
      // broke this: a 1.1 MB PNG at 12500x12500 passed every check and then no
      // browser would decode it, leaving a broken box that never even fired an
      // error event for the fallback below to catch. See lib/downscale-image.ts.
      const prepared = await prepareAvatarImage(file);
      if (!prepared) {
        setLogoError('Could not read that image. Try a JPEG, or export the PNG again.');
        return;
      }
      // From here the PREPARED file is the upload: its name, type and size all
      // have to travel together, or the signed path, the bytes we PUT and what
      // the server validated stop describing the same thing.
      const upload = prepared.file;
      const uploadMimeType = upload.type || mimeType;

      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');

      const uploadUrlResponse = await fetch('/api/workspace/logo/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          file_name: upload.name,
          mime_type: uploadMimeType,
          file_size: upload.size,
        }),
      });
      const uploadUrlPayload = (await uploadUrlResponse.json().catch(() => ({}))) as {
        upload_url?: string;
        storage_path?: string;
        error?: string;
      };
      if (!uploadUrlResponse.ok || !uploadUrlPayload.upload_url || !uploadUrlPayload.storage_path) {
        status = uploadUrlResponse.status;
        throw new Error(uploadUrlPayload.error || 'Could not create upload URL.');
      }

      step = 2;
      const storageResponse = await fetch(uploadUrlPayload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': uploadMimeType },
        body: upload,
      });
      if (!storageResponse.ok) {
        status = storageResponse.status;
        throw new Error(`Storage upload failed (${storageResponse.status}).`);
      }

      step = 3;

      const recordResponse = await fetch('/api/workspace/logo', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storage_path: uploadUrlPayload.storage_path,
          file_name: upload.name,
        }),
      });
      const recordPayload = (await recordResponse.json().catch(() => ({}))) as {
        logo?: WorkspaceLogo | null;
        error?: string;
      };
      if (!recordResponse.ok || !recordPayload.logo) {
        status = recordResponse.status;
        // The orphaned object is cleaned up by the route that rejected it (it
        // has both the path and the admin client) rather than by a second
        // request from here.
        throw new Error(recordPayload.error || 'Could not save logo.');
      }

      setIdentityLogo(recordPayload.logo);
      setLogoMessage('Logo saved. Rollouts without cover art now show it automatically.');
    } catch (err) {
      // The code goes ON SCREEN, because that is the only channel that reaches
      // us: the PostHog event below is inert unless NEXT_PUBLIC_POSTHOG_KEY is
      // set, and a message the user cannot quote is a message we never see.
      const code = formatUploadFailureCode({ surface: 'workspace_logo', step, status });
      setLogoError(
        `${errorMessage(err, 'Could not upload logo.')} If you report this, quote ${code}.`
      );
      captureAnalyticsEvent(
        createPostHogEvent(
          'asset_upload_failed',
          buildUploadFailureReport({
            surface: 'workspace_logo',
            step,
            status,
            message: err instanceof Error ? err.message : null,
          })
        )
      );
    } finally {
      setIsSavingLogo(false);
    }
  };

  const removeLogo = async () => {
    if (!identityLogo) return;
    setLogoError('');
    setLogoMessage('');
    setIsSavingLogo(true);
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
      setLogoMessage('Logo removed. Rollouts without cover art show the neutral placeholder again.');
    } catch (err) {
      setLogoError(errorMessage(err, 'Could not remove logo.'));
    } finally {
      setIsSavingLogo(false);
    }
  };

  /** Persist a roster to both state and the cache, so the two cannot diverge. */
  const commitRoster = (next: WorkspaceArtist[]) => {
    setArtists(next);
    writePersistedState<ArtistCache>(ARTIST_CACHE_KEY, SETTINGS_CACHE_VERSION, {
      userId,
      artists: next,
    });
  };

  const renameArtist = async (artistId: string, name: string) => {
    if (!userId) return;
    const current = (artists ?? []).find((entry) => entry.id === artistId);
    if (!current) return;

    setArtistError('');
    setArtistMessage('');
    const trimmed = name.trim();
    if (!trimmed) {
      setArtistError('Artist name cannot be empty.');
      return;
    }
    if (trimmed === current.name) {
      setArtistMessage('No changes.');
      return;
    }

    setSavingArtistId(artistId);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`/api/workspace/artists/${encodeURIComponent(artistId)}`, {
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
      const saved = payload.artist;
      // Merged, not replaced: the rename answer carries the name and slug
      // only, and replacing the row would drop the artist's brand colors
      // until the next reload.
      commitRoster(
        (artists ?? []).map((entry) => (entry.id === artistId ? { ...entry, ...saved } : entry))
      );
      // Renaming rewrites the artist name cached on every one of that artist's
      // releases, so say how many moved. It is the only visible sign that the
      // rename reached further than this page.
      const releasesNote =
        typeof payload.releasesUpdated === 'number' && payload.releasesUpdated > 0
          ? ` (${payload.releasesUpdated} release${payload.releasesUpdated === 1 ? '' : 's'} updated)`
          : '';
      setArtistMessage(`Artist renamed${releasesNote}.`);
    } catch (err) {
      setArtistError(errorMessage(err, 'Could not rename artist.'));
    } finally {
      setSavingArtistId(null);
    }
  };

  const addArtist = async (name: string) => {
    if (!userId) return;
    setArtistError('');
    setArtistMessage('');
    const trimmed = name.trim();
    if (!trimmed) {
      setArtistError('Artist name cannot be empty.');
      return;
    }

    setIsAddingArtist(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace/artists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as WorkspaceArtistResponse;
      if (!response.ok || !payload.artist) {
        throw new Error(payload.error || 'Could not add artist.');
      }
      // Appended, not sorted: the list is oldest-first server-side and a new
      // artist is the newest, so appending matches what a reload will show.
      commitRoster([...(artists ?? []), payload.artist]);
      setArtistMessage(`${payload.artist.name} added.`);
    } catch (err) {
      setArtistError(errorMessage(err, 'Could not add artist.'));
    } finally {
      setIsAddingArtist(false);
    }
  };

  const removeArtist = async (artistId: string) => {
    if (!userId) return;
    const current = (artists ?? []).find((entry) => entry.id === artistId);
    if (!current) return;

    setArtistError('');
    setArtistMessage('');
    setRemovingArtistId(artistId);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`/api/workspace/artists/${encodeURIComponent(artistId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        // The server's refusals name a number and say what to do about it
        // ("has 3 releases. Move them first"), so they are surfaced verbatim
        // rather than replaced with a generic failure.
        throw new Error(payload.error || 'Could not remove this artist.');
      }
      commitRoster((artists ?? []).filter((entry) => entry.id !== artistId));
      setArtistMessage(`${current.name} removed.`);
    } catch (err) {
      setArtistError(errorMessage(err, 'Could not remove this artist.'));
    } finally {
      setRemovingArtistId(null);
    }
  };

  /**
   * Save an artist's brand colors. Applied to the row straight away, so the
   * preview does not flash back to the old colors while the request is out,
   * and put back if the save fails, so the page never shows colors the server
   * does not have.
   */
  const saveBrandColors = async (artistId: string, colors: BrandColors) => {
    if (!userId) return;
    const current = (artists ?? []).find((entry) => entry.id === artistId);
    if (!current) return;

    setBrandColorsError('');
    setBrandColorsMessage('');
    const previous = current.brandColors ?? NO_BRAND_COLORS;
    if (sameBrandColors(previous, colors)) {
      setBrandColorsMessage('No changes.');
      return;
    }

    const withColors = (next: BrandColors) =>
      (artists ?? []).map((entry) => (entry.id === artistId ? { ...entry, brandColors: next } : entry));

    setSavingBrandColorsId(artistId);
    commitRoster(withColors(colors));
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(
        `/api/workspace/artists/${encodeURIComponent(artistId)}/brand-colors`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(colors),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        artist?: { id: string; brandColors: BrandColors };
        error?: string;
      };
      if (!response.ok || !payload.artist) {
        throw new Error(payload.error || 'Could not save the colors. Try again.');
      }
      commitRoster(withColors(payload.artist.brandColors));
      const reset = payload.artist.brandColors.background === null && payload.artist.brandColors.accent === null;
      setBrandColorsMessage(
        reset
          ? `${current.name} is back to Urganize colors.`
          : `Saved. ${current.name}’s share images use these colors now.`
      );
    } catch (err) {
      commitRoster(withColors(previous));
      setBrandColorsError(errorMessage(err, 'Could not save the colors. Try again.'));
    } finally {
      setSavingBrandColorsId(null);
    }
  };

  return {
    nameInput,
    setNameInput,
    isSavingName,
    nameMessage,
    nameError,
    saveName: () => void saveName(),
    logo: identityLogo,
    isSavingLogo,
    logoMessage,
    logoError,
    uploadLogo: (file: File) => void uploadLogo(file),
    removeLogo: () => void removeLogo(),
    identityHydrated,
    artists,
    artistLimit,
    isLoadingArtists: isLoadingArtists && !artistPrimed,
    savingArtistId,
    isAddingArtist,
    artistMessage,
    artistError,
    removingArtistId,
    renameArtist: (artistId: string, name: string) => void renameArtist(artistId, name),
    addArtist: (name: string) => void addArtist(name),
    removeArtist: (artistId: string) => void removeArtist(artistId),
    savingBrandColorsId,
    brandColorsMessage,
    brandColorsError,
    saveBrandColors: (artistId: string, colors: BrandColors) => void saveBrandColors(artistId, colors),
  };
}

export { WORKSPACE_FEATURE_ENABLED, IDENTITY_PANEL_ENABLED };
