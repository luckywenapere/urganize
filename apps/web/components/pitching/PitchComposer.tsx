'use client';

// Browse playlists, pick one, send a song to it.
//
// Extracted from PitchScene 2026-09-09, when the team-wide Pitching page
// arrived and needed the identical composer. The scene keeps its own shell (the
// sent list for one release plus this) and this file owns everything from the
// filters down to the send button, so the two surfaces cannot drift into
// offering different fields or different validation.
//
// It is deliberately RELEASE-AGNOSTIC in shape: it takes a releaseId rather
// than a release, so the page can hand it whichever release the manager picked
// without pretending to be scoped to one.
//
// PAID CURATORS (2026-09-25). With curator pitch payments switched on, a
// curator who charges shows their price on the card, and a manager can pick up
// to five of them to pay for in one checkout. A free curator is still one pitch
// at a time, sent straight away, exactly as before: paid pitching is opt-in per
// curator, so nothing about the free path changes. The two never mix in one
// selection, because one is a payment and the other is not.
//
// The price on a card is for reading only. The quote route prices everything
// again on the server, and that is the number the artist pays.

import { useEffect, useState } from 'react';
import { Check, ExternalLink, Send } from '@/components/icons';
import type { BrowsablePlaylist, SentPitch } from '@/types/pitching';
import { supabase } from '@/lib/supabase/client';
import {
  MAX_PITCH_NOTE_LENGTH,
  MAX_SONG_TITLE_LENGTH,
  MAX_WAITING_PITCHES_PER_RELEASE,
  PITCH_PLATFORMS,
  PITCH_PLATFORM_LABELS,
  detectPitchPlatform,
  formatFollowerCount,
  isValidSongUrl,
} from '@/lib/pitching';
import { openExternalUrl } from '@/lib/external-link';
import { CuratorCardListSkeleton } from '@/components/loading/CuratorSkeleton';
import { MAX_PITCHES_PER_CHECKOUT, isPitchPaymentsEnabled } from '@/lib/pitch-payments';
import {
  PAY_ON_THE_WEB,
  REVIEW_AND_PAY,
  TOO_MANY_IN_ONE_CHECKOUT,
  curatorCardPrice,
} from '@/lib/pitch-payment-copy';
import { canPayForPitchesHere, requestPitchQuote } from '@/lib/pitch-payments-client';
import type { PitchQuote } from '@/types/pitch-payments';
import { PitchCheckoutPanel } from './PitchCheckoutPanel';

type PitchComposerProps = {
  /** The release this pitch belongs to. Empty disables the whole composer. */
  releaseId: string;
  /** Seeds the song title — the release's own title, which is usually right. */
  initialSongTitle: string;
  /** True when this release already has the maximum waiting on a reply. */
  atLimit: boolean;
  /**
   * Narrows the list to one curator, set when an artist arrives from her public
   * page at /pitch/{slug}. Empty for everyone else, which is the ordinary
   * global browse.
   */
  curatorSlug?: string;
  /** Drops that narrowing. Required whenever curatorSlug can be set, because a
   *  pre-filtered list with no way out reads as a broken browse. */
  onClearCurator?: () => void;
  onSent: (pitch: SentPitch) => void;
  /** Something changed that a returned row does not describe: a paid pitch was
   *  saved and is waiting for payment. The caller reloads its sent list. */
  onChanged?: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

const inputClass =
  'h-11 w-full rounded-xl border border-stroke-control bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';
const labelClass = 'block text-[11px] uppercase tracking-[0.16em] text-content-tertiary';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function PitchComposer({
  releaseId,
  initialSongTitle,
  atLimit,
  curatorSlug,
  onClearCurator,
  onSent,
  onChanged,
  onToast,
}: PitchComposerProps) {
  const paymentsOn = isPitchPaymentsEnabled();
  const [playlists, setPlaylists] = useState<BrowsablePlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const curatorFilter = (curatorSlug || '').trim();

  // Several ids only when they are all paid curators (up to
  // MAX_PITCHES_PER_CHECKOUT); a free pick is always a list of one.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quote, setQuote] = useState<PitchQuote | null>(null);
  const [songTitle, setSongTitle] = useState(initialSongTitle);
  const [songUrl, setSongUrl] = useState('');
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  // Playlists are global inventory, refetched when a filter changes rather than
  // filtered client-side: the list is capped server-side, so a filter has to
  // reach the query to be honest about what is available.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoadingPlaylists(true);
      try {
        const token = await getAccessToken();
        if (!token) return;
        const params = new URLSearchParams();
        if (platformFilter) params.set('platform', platformFilter);
        if (genreFilter.trim()) params.set('genre', genreFilter.trim());
        if (curatorFilter) params.set('curator', curatorFilter);
        const query = params.toString();
        const response = await fetch(`/api/pitching/playlists${query ? `?${query}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json().catch(() => null)) as {
          playlists?: BrowsablePlaylist[];
        } | null;
        if (cancelled || !payload || !Array.isArray(payload.playlists)) return;
        setPlaylists(payload.playlists);
      } finally {
        if (!cancelled) setIsLoadingPlaylists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [curatorFilter, genreFilter, platformFilter]);

  const isPaidPlaylist = (playlist: BrowsablePlaylist | null | undefined): boolean =>
    Boolean(paymentsOn && playlist && typeof playlist.pitchPriceKobo === 'number');

  const selectedPlaylists = selectedIds
    .map((id) => playlists.find((playlist) => playlist.id === id))
    .filter((playlist): playlist is BrowsablePlaylist => Boolean(playlist));
  const paidSelection = selectedPlaylists.length > 0 && isPaidPlaylist(selectedPlaylists[0]);

  const toggleSelection = (playlist: BrowsablePlaylist) => {
    setError('');
    if (selectedIds.includes(playlist.id)) {
      setSelectedIds(selectedIds.filter((id) => id !== playlist.id));
      return;
    }
    // A free pitch goes on its own, and a paid one never joins a free pick.
    if (!isPaidPlaylist(playlist) || !paidSelection) {
      setSelectedIds([playlist.id]);
      return;
    }
    if (selectedIds.length >= MAX_PITCHES_PER_CHECKOUT) {
      setError(TOO_MANY_IN_ONE_CHECKOUT(MAX_PITCHES_PER_CHECKOUT));
      return;
    }
    setSelectedIds([...selectedIds, playlist.id]);
  };

  const detectedPlatform = detectPitchPlatform(songUrl);
  const canSend =
    Boolean(releaseId) &&
    selectedPlaylists.length > 0 &&
    songTitle.trim().length > 0 &&
    isValidSongUrl(songUrl) &&
    !atLimit &&
    !isSending;

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (paidSelection) {
      await handleQuote();
      return;
    }
    const selectedPlaylistId = selectedPlaylists[0]?.id || '';
    setIsSending(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in again to send this pitch.');
      const response = await fetch('/api/pitching/pitches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId,
          playlistId: selectedPlaylistId,
          songTitle: songTitle.trim(),
          songUrl: songUrl.trim(),
          note: note.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        pitch?: SentPitch;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || 'Could not send the pitch.');

      onToast('Pitch sent.', 'success');
      setSelectedIds([]);
      setNote('');
      if (payload?.pitch) onSent(payload.pitch);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Could not send the pitch.';
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  // A paid selection is saved as pitches waiting for payment and priced on the
  // server; nothing reaches a curator until Paystack confirms the payment.
  async function handleQuote() {
    if (!canPayForPitchesHere()) {
      setError(PAY_ON_THE_WEB);
      return;
    }
    setIsSending(true);
    try {
      const result = await requestPitchQuote({
        releaseId,
        playlistIds: selectedPlaylists.map((playlist) => playlist.id),
        songTitle: songTitle.trim(),
        songUrl: songUrl.trim(),
        note: note.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQuote(result.data.quote);
      onChanged?.();
    } finally {
      setIsSending(false);
    }
  }

  const selectionLine = (() => {
    if (!selectedPlaylists.length) {
      return paymentsOn
        ? `Pick a playlist above to pitch to. You can pick up to ${MAX_PITCHES_PER_CHECKOUT} that charge and pay once.`
        : 'Pick a playlist above to pitch to.';
    }
    if (selectedPlaylists.length === 1) return `Pitching to ${selectedPlaylists[0].name}.`;
    return `Pitching to ${selectedPlaylists.length} playlists.`;
  })();

  if (quote) {
    return (
      <PitchCheckoutPanel
        quote={quote}
        songTitle={songTitle.trim()}
        onCancel={() => {
          // The pitches stay saved and waiting for payment, so they can be paid
          // later from the sent list, or removed there.
          setQuote(null);
          setSelectedIds([]);
          onChanged?.();
        }}
      />
    );
  }


  return (
    <>
      {atLimit ? (
        <p className="rounded-xl border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          This rollout has {MAX_WAITING_PITCHES_PER_RELEASE} pitches waiting. Wait for replies
          before sending more.
        </p>
      ) : null}

      {curatorFilter ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2">
          <p className="text-sm text-content-primary">
            Showing one playlist owner, because you came from their page.
          </p>
          {onClearCurator ? (
            <button
              type="button"
              onClick={onClearCurator}
              className="text-sm underline underline-offset-4 text-content-secondary hover:text-content-primary"
            >
              See everyone
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Filter by platform"
          className={`${inputClass} appearance-none sm:max-w-[12rem]`}
          value={platformFilter}
          onChange={(event) => setPlatformFilter(event.target.value)}
        >
          <option value="">All platforms</option>
          {PITCH_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {PITCH_PLATFORM_LABELS[platform]}
            </option>
          ))}
        </select>
        <input
          aria-label="Filter by genre"
          className={inputClass}
          value={genreFilter}
          onChange={(event) => setGenreFilter(event.target.value)}
          placeholder="Filter by genre"
        />
      </div>

      {isLoadingPlaylists ? (
        <CuratorCardListSkeleton rows={2} />
      ) : playlists.length === 0 ? (
        <p className="rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          {curatorFilter
            ? 'This playlist owner has nothing listed right now. See everyone to keep looking.'
            : 'No playlists match that. Clear the filters to see everything on offer.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {playlists.map((playlist) => {
            const isSelected = selectedIds.includes(playlist.id);
            const followers = formatFollowerCount(playlist.followerCount);
            const price =
              isPaidPlaylist(playlist) && typeof playlist.pitchPriceKobo === 'number'
                ? curatorCardPrice(playlist.pitchPriceKobo, playlist.responseWindowHours || undefined)
                : '';
            return (
              <li key={playlist.id}>
                <div
                  className={`rounded-xl border p-3 transition-colors ${
                    isSelected
                      ? 'border-brand bg-brand/8'
                      : 'border-stroke-default bg-bg-surface hover:border-stroke-strong'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleSelection(playlist)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
                        {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" /> : null}
                        <span className="truncate">
                          {PITCH_PLATFORM_LABELS[playlist.platform]}
                          {followers ? ` · ${followers} followers` : ''}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-content-primary">
                        {playlist.name}
                      </p>
                      <p className="truncate text-xs text-content-secondary">
                        {playlist.curatorName}
                      </p>
                      {price ? (
                        <p className="mt-1 truncate font-mono text-[11px] font-semibold text-brand">{price}</p>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => void openExternalUrl(playlist.url)}
                      aria-label={`Open ${playlist.name}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stroke-default text-content-tertiary transition-colors hover:border-stroke-strong hover:text-content-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {playlist.genres.length ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {playlist.genres.map((genre) => (
                        <li
                          key={genre}
                          className="rounded-full bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-content-secondary"
                        >
                          {genre}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={handleSend}
        className="space-y-4 rounded-xl border border-stroke-default bg-bg-surface p-4"
      >
        <p className="text-sm text-content-secondary">{selectionLine}</p>

        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="pitch-song-title">
            Song
          </label>
          <input
            id="pitch-song-title"
            className={inputClass}
            value={songTitle}
            maxLength={MAX_SONG_TITLE_LENGTH}
            onChange={(event) => setSongTitle(event.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="pitch-song-url">
            Link to the song
          </label>
          <input
            id="pitch-song-url"
            type="url"
            inputMode="url"
            className={inputClass}
            value={songUrl}
            onChange={(event) => setSongUrl(event.target.value)}
            placeholder="https://…"
            required
          />
          <p className="text-xs text-content-tertiary">
            {detectedPlatform
              ? `Looks like ${PITCH_PLATFORM_LABELS[detectedPlatform]}.`
              : 'Any link works: a private stream, a demo host or a live page.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="pitch-note">
            Note
          </label>
          <textarea
            id="pitch-note"
            rows={3}
            className="w-full rounded-xl border border-stroke-control bg-bg-base p-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
            value={note}
            maxLength={MAX_PITCH_NOTE_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why this playlist, in a line or two."
          />
          <p className="text-right font-mono text-[11px] text-content-tertiary">
            {note.length}/{MAX_PITCH_NOTE_LENGTH}
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSend}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50 sm:w-auto"
        >
          <Send className="h-4 w-4" />
          {isSending
            ? paidSelection
              ? 'Getting the price…'
              : 'Sending…'
            : paidSelection
              ? REVIEW_AND_PAY
              : 'Send pitch'}
        </button>
      </form>
    </>
  );
}
