'use client';

// "Send to curators" in a rollout's Pitch this! scene (2026-10-16, founder
// approved mocks).
//
// One face per CURATOR, not per playlist: tap a face, a sheet opens with that
// curator's playlists as chips, the song link, a note already written from the
// story, and "Your kit goes with it". One button: Send pitch. On a phone the
// sheet rises from the bottom; from `lg` it is a panel on the right.
//
// Why it replaced PitchComposer here: the audit found one outside pitch ever
// sent, and the composer sent a bare song link with an empty note. The kit is
// now attached (its link is the note's last line, so it reaches the curator in
// the inbox and in the email alike, with no new column), and the note starts
// from the story instead of "Say hi".
//
// Free pitches only. Paid pitching is switched off (Feature Cuts, 2026-10-16)
// and this does not rebuild it; the send route still refuses a paid curator.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Send, X } from '@/components/icons';
import type { BrowsablePlaylist, SentPitch } from '@/types/pitching';
import { supabase } from '@/lib/supabase/client';
import {
  MAX_PITCH_NOTE_LENGTH,
  MAX_WAITING_PITCHES_PER_RELEASE,
  PITCH_PLATFORM_LABELS,
  isValidSongUrl,
  SONG_LINK_PLACEHOLDER_SHORT,
} from '@/lib/pitching';
import { pitchNoteFromStory } from '@/lib/release-epk';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { publishReleaseKitLink } from '@/lib/pitch-kit-client';
import { longestKitUrl, noteRoom, noteWithKit } from '@/lib/pitch-kit-link';
import { groupPlaylistsByCurator, type CuratorGroup } from '@/lib/curator-groups';
import { CuratorFace } from './CuratorFace';
import { currentShareOrigin } from '@/lib/app-hosts';

type CuratorPickerProps = {
  releaseId: string;
  songTitle: string;
  story: string;
  /** The live kit link, or null while the kit is not published. */
  kitUrl: string | null;
  /** True when the kit can be published on send (the story is in). */
  kitReady: boolean;
  atLimit: boolean;
  /** `?curator=` from a curator's public page: open their sheet on arrival. */
  curatorSlug?: string;
  onSent: (pitch: SentPitch) => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function CuratorPicker({
  releaseId,
  songTitle,
  story,
  kitUrl,
  kitReady,
  atLimit,
  curatorSlug,
  onSent,
  onToast,
}: CuratorPickerProps) {
  const [playlists, setPlaylists] = useState<BrowsablePlaylist[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<CuratorGroup | null>(null);
  const curatorFilter = (curatorSlug || '').trim();

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError(true);
        return;
      }
      const query = curatorFilter ? `?curator=${encodeURIComponent(curatorFilter)}` : '';
      const response = await fetch(`/api/pitching/playlists${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as { playlists?: BrowsablePlaylist[] } | null;
      if (!response.ok || !payload || !Array.isArray(payload.playlists)) {
        setLoadError(true);
        return;
      }
      setPlaylists(payload.playlists);
    } catch {
      setLoadError(true);
    }
  }, [curatorFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupPlaylistsByCurator(playlists ?? []), [playlists]);

  // The deep link: arriving from one curator's page opens their sheet.
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (!curatorFilter || deepLinked || groups.length === 0) return;
    setDeepLinked(true);
    setOpen(groups[0]);
  }, [curatorFilter, deepLinked, groups]);

  if (loadError) {
    return (
      <div className="rounded-2xl border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm font-semibold text-content-primary" role="alert">
          Couldn’t load curators.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="motion-focus mt-2 min-h-11 text-sm font-semibold text-brand hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!playlists) {
    return (
      <ul className="grid grid-cols-3 gap-x-2.5 gap-y-4 lg:grid-cols-6" aria-busy="true" aria-label="Loading curators">
        {Array.from({ length: 3 }).map((_, index) => (
          <li key={index} className="flex flex-col items-center">
            <span className="h-[84px] w-[84px] animate-pulse rounded-full bg-bg-elevated lg:h-[92px] lg:w-[92px]" />
            <span className="mt-2 h-2.5 w-3/5 animate-pulse rounded bg-bg-elevated" />
          </li>
        ))}
      </ul>
    );
  }

  if (groups.length === 0) {
    return <p className="text-sm text-content-primary/55">No curators yet. New ones show up here.</p>;
  }

  return (
    <>
      {atLimit ? (
        <p className="mb-4 rounded-xl bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          {MAX_WAITING_PITCHES_PER_RELEASE} pitches are waiting. Wait for a reply first.
        </p>
      ) : null}
      <ul className="grid grid-cols-3 gap-x-2.5 gap-y-4 lg:grid-cols-6">
        {groups.map((group) => (
          <li key={group.key}>
            <button
              type="button"
              onClick={() => setOpen(group)}
              aria-label={`${group.curatorName}, ${group.playlists.length} ${group.playlists.length === 1 ? 'playlist' : 'playlists'}`}
              className="motion-focus group flex w-full flex-col items-center rounded-2xl p-1 text-center"
            >
              <span className="relative block h-[84px] w-[84px] overflow-hidden rounded-full lg:h-[92px] lg:w-[92px]">
                <CuratorFace
                  name={group.curatorName}
                  photoUrl={group.photoUrl}
                  className="transition-transform duration-300 group-hover:scale-105"
                />
              </span>
              <span className="mt-2 line-clamp-2 text-[13px] font-semibold leading-tight text-content-primary">
                {group.curatorName}
              </span>
              <span className="mt-0.5 text-[11px] text-content-primary/55">
                {group.playlists.length} {group.playlists.length === 1 ? 'playlist' : 'playlists'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open ? (
        <PitchSheet
          key={open.key}
          group={open}
          releaseId={releaseId}
          songTitle={songTitle}
          story={story}
          kitUrl={kitUrl}
          kitReady={kitReady}
          atLimit={atLimit}
          onClose={() => setOpen(null)}
          onSent={(pitch) => {
            setOpen(null);
            onToast(`Sent to ${open.curatorName}.`, 'success');
            onSent(pitch);
          }}
        />
      ) : null}
    </>
  );
}

function PitchSheet({
  group,
  releaseId,
  songTitle,
  story,
  kitUrl,
  kitReady,
  atLimit,
  onClose,
  onSent,
}: {
  group: CuratorGroup;
  releaseId: string;
  songTitle: string;
  story: string;
  kitUrl: string | null;
  kitReady: boolean;
  atLimit: boolean;
  onClose: () => void;
  onSent: (pitch: SentPitch) => void;
}) {
  const [playlistId, setPlaylistId] = useState(group.playlists[0]?.id || '');
  const [songUrl, setSongUrl] = useState('');
  // Room for the kit line is kept whether or not the kit is live yet: it goes
  // live on send when the story is in.
  const attachKit = Boolean(kitUrl || kitReady);
  const origin = currentShareOrigin();
  const room = noteRoom(attachKit ? kitUrl || longestKitUrl(origin) : null, MAX_PITCH_NOTE_LENGTH);
  const [note, setNote] = useState(() => pitchNoteFromStory(story, room));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const playlist = group.playlists.find((entry) => entry.id === playlistId) ?? group.playlists[0];

  useEffect(() => lockBodyScroll(), []);

  const canSend = Boolean(playlist) && isValidSongUrl(songUrl) && songTitle.trim().length > 0 && !atLimit && !sending;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend || !playlist) return;
    setError('');
    setSending(true);
    try {
      let link = kitUrl;
      if (!link && kitReady) {
        const published = await publishReleaseKitLink(releaseId);
        // A kit that cannot go live (no contact email yet) never blocks the
        // pitch itself: it goes without the link.
        link = published.ok ? published.url : null;
      }
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in again to send this pitch.');
      const response = await fetch('/api/pitching/pitches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId,
          playlistId: playlist.id,
          songTitle: songTitle.trim(),
          songUrl: songUrl.trim(),
          note: noteWithKit(note, link, MAX_PITCH_NOTE_LENGTH),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { pitch?: SentPitch; error?: string } | null;
      if (!response.ok || !payload?.pitch) throw new Error(payload?.error || 'Could not send the pitch.');
      onSent(payload.pitch);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send the pitch.');
    } finally {
      setSending(false);
    }
  };

  const platform = playlist ? PITCH_PLATFORM_LABELS[playlist.platform] : '';

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/55"
      />
      <DialogPanel
        label={`Pitch ${group.curatorName}`}
        onClose={onClose}
        className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[22px] bg-bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-2.5 lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[440px] lg:rounded-none lg:p-7"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stroke-default lg:hidden" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <span className="relative block h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full">
            <CuratorFace name={group.curatorName} photoUrl={group.photoUrl} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl text-content-primary">{group.curatorName}</p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-content-primary/55">
              {group.playlists.length} {group.playlists.length === 1 ? 'playlist' : 'playlists'}
              {platform ? ` · ${platform}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-focus hidden h-11 w-11 items-center justify-center rounded-full text-content-tertiary hover:bg-bg-elevated hover:text-content-primary lg:inline-flex"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={send}>
          {group.playlists.length > 1 ? (
            <fieldset className="mt-4">
              <legend className="mb-1.5 text-[13px] text-content-primary/55">Playlist</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Playlist">
                {group.playlists.map((entry) => {
                  const active = entry.id === playlist?.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPlaylistId(entry.id)}
                      className={`min-h-11 rounded-full px-3.5 text-[13px] transition-colors ${
                        active
                          ? 'bg-content-primary font-semibold text-bg-base'
                          : 'bg-bg-elevated text-content-primary/55 hover:text-content-primary'
                      }`}
                    >
                      {entry.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : playlist ? (
            <p className="mt-4 text-sm text-content-primary">
              <span className="text-content-primary/55">Playlist </span>
              {playlist.name}
            </p>
          ) : null}

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13px] text-content-primary/55">Song link</span>
            <input
              type="url"
              inputMode="url"
              required
              value={songUrl}
              onChange={(event) => setSongUrl(event.target.value)}
              placeholder={SONG_LINK_PLACEHOLDER_SHORT}
              className="h-12 w-full rounded-xl border border-stroke-control bg-bg-base px-3 text-base text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none sm:text-sm"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13px] text-content-primary/55">Note</span>
            <textarea
              rows={4}
              value={note}
              maxLength={room}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Say hi"
              className="w-full resize-none rounded-xl border border-stroke-control bg-bg-base p-3 text-base text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none sm:text-sm"
            />
          </label>

          {attachKit ? (
            <p className="mt-3 flex items-center gap-3 text-sm text-content-primary">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-content-inverse" aria-hidden="true">
                <Check className="h-3 w-3" />
              </span>
              Your kit goes with it
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 text-sm text-status-error">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSend}
            className="motion-press mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send pitch'}
          </button>
        </form>
      </DialogPanel>
    </div>,
    document.body
  );
}
