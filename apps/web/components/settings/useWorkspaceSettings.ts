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
// legacy artist input in the create-release modal. Lifting to many artists
// later is a UI change only — the schema (artists.workspace_id, partial
// unique on (workspace_id, slug)) already permits multiple rows per
// workspace.
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
  // Workspace artist
  artist: WorkspaceArtist | null | undefined;
  artistInput: string;
  setArtistInput: (value: string) => void;
  isLoadingArtist: boolean;
  isSavingArtist: boolean;
  artistMessage: string;
  artistError: string;
  saveArtist: () => void;
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
  const [artist, setArtist] = useState<WorkspaceArtist | null | undefined>(null);
  const [artistInput, setArtistInput] = useState('');
  const [isLoadingArtist, setIsLoadingArtist] = useState(false);
  const [isSavingArtist, setIsSavingArtist] = useState(false);
  const [artistMessage, setArtistMessage] = useState('');
  const [artistError, setArtistError] = useState('');
  const [artistPrimed, setArtistPrimed] = useState(false);

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
      setArtist(cache.artist ?? undefined);
      setArtistInput(cache.artist?.name ?? '');
      setArtistPrimed(true);
    }
  }, [userId]);

  // Load the workspace artist behind the flag. Mirrors the logo loader's
  // shape so the feedback paths and cleanup-on-unmount semantics stay
  // consistent.
  useEffect(() => {
    if (!userId || !WORKSPACE_FEATURE_ENABLED || !accessToken) return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingArtist(true);
      try {
        const response = await fetch('/api/workspace/artist', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as WorkspaceArtistResponse;
        if (cancelled) return;
        if (response.ok) {
          setArtist(payload.artist ?? undefined);
          setArtistInput(payload.artist?.name ?? '');
          writePersistedState<ArtistCache>(ARTIST_CACHE_KEY, SETTINGS_CACHE_VERSION, {
            userId,
            artist: payload.artist ?? null,
          });
        }
      } finally {
        if (!cancelled) setIsLoadingArtist(false);
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
      setNameError('Workspace name cannot be empty.');
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
        throw new Error(payload.error || 'Could not rename workspace.');
      }
      setIdentityName(payload.name);
      setNameInput(payload.name);
      setNameMessage('Workspace renamed.');
    } catch (err) {
      setNameError(errorMessage(err, 'Could not rename workspace.'));
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
      setLogoMessage('Logo saved. Releases without cover art now show it automatically.');
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
      setLogoMessage('Logo removed. Releases without cover art show the neutral placeholder again.');
    } catch (err) {
      setLogoError(errorMessage(err, 'Could not remove logo.'));
    } finally {
      setIsSavingLogo(false);
    }
  };

  const saveArtist = async () => {
    if (!userId || !artist) return;
    setArtistError('');
    setArtistMessage('');
    const trimmed = artistInput.trim();
    if (!trimmed) {
      setArtistError('Artist name cannot be empty.');
      return;
    }
    if (trimmed === artist.name) {
      setArtistMessage('No changes.');
      return;
    }

    setIsSavingArtist(true);
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
      setArtist(payload.artist);
      setArtistInput(payload.artist.name);
      writePersistedState<ArtistCache>(ARTIST_CACHE_KEY, SETTINGS_CACHE_VERSION, {
        userId,
        artist: payload.artist,
      });
      const releasesNote =
        typeof payload.releasesUpdated === 'number' && payload.releasesUpdated > 0
          ? ` (${payload.releasesUpdated} release${payload.releasesUpdated === 1 ? '' : 's'} updated)`
          : '';
      setArtistMessage(`Artist renamed${releasesNote}.`);
    } catch (err) {
      setArtistError(errorMessage(err, 'Could not rename artist.'));
    } finally {
      setIsSavingArtist(false);
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
    artist,
    artistInput,
    setArtistInput,
    isLoadingArtist: isLoadingArtist && !artistPrimed,
    isSavingArtist,
    artistMessage,
    artistError,
    saveArtist: () => void saveArtist(),
  };
}

export { WORKSPACE_FEATURE_ENABLED, IDENTITY_PANEL_ENABLED };
