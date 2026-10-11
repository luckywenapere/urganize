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

import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Send } from '@/components/icons';
import type { BrowsablePlaylist, SentPitch } from '@/types/pitching';
import { supabase } from '@/lib/supabase/client';
import {
  MAX_PITCH_NOTE_LENGTH,
  MAX_SONG_TITLE_LENGTH,
  MAX_WAITING_PITCHES_PER_RELEASE,
  PITCH_PLATFORMS,
  PITCH_PLATFORM_LABELS,
  isValidSongUrl,
  SONG_LINK_PLACEHOLDER,
  SONG_LINK_PLACEHOLDER_SHORT,
} from '@/lib/pitching';
import { openExternalUrl } from '@/lib/external-link';
import { MAX_PITCHES_PER_CHECKOUT, isPitchPaymentsEnabled } from '@/lib/pitch-payments';
import { PAY_ON_THE_WEB, REVIEW_AND_PAY, TOO_MANY_IN_ONE_CHECKOUT } from '@/lib/pitch-payment-copy';
import { formatNaira } from '@/lib/money';
import { canPayForPitchesHere, requestPitchQuote } from '@/lib/pitch-payments-client';
import type { PitchQuote } from '@/types/pitch-payments';
import { PitchCheckoutPanel } from './PitchCheckoutPanel';
import { CuratorFace } from './CuratorFace';
import { usePitchKitStory } from './usePitchKitStory';
import { pitchNoteFromStory } from '@/lib/release-epk';

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
  // The genre box was cut from the screen (2026-10-11); the route still takes
  // ?genre= for anything that wants it.
  const genreFilter = '';
  const curatorFilter = (curatorSlug || '').trim();

  // Several ids only when they are all paid curators (up to
  // MAX_PITCHES_PER_CHECKOUT); a free pick is always a list of one.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quote, setQuote] = useState<PitchQuote | null>(null);
  const [songTitle, setSongTitle] = useState(initialSongTitle);
  // Follow the release when the caller switches it (the team-wide page does).
  const [titleSeed, setTitleSeed] = useState(initialSongTitle);
  if (titleSeed !== initialSongTitle) {
    setTitleSeed(initialSongTitle);
    setSongTitle(initialSongTitle);
  }
  const [songUrl, setSongUrl] = useState('');
  const songLinkPlaceholder = useSongLinkPlaceholder();
  const [note, setNote] = useState('');
  // The story from this rollout's Pitch kit, if the team wrote one. '' = none.
  const storyNote = pitchNoteFromStory(usePitchKitStory(releaseId), MAX_PITCH_NOTE_LENGTH);
  const [isSending, setIsSending] = useState(false);
  // The moment after a free send. A toast vanishes; this stays until the
  // artist picks again, so the send feels like it went to a person.
  const [justSent, setJustSent] = useState<{ name: string; photoUrl: string | null } | null>(null);
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

  const formRef = useRef<HTMLFormElement>(null);
  // On a phone the send card lands under a long grid, so bring it into view
  // on the first pick rather than leaving the artist to hunt for it.
  const revealForm = () => {
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const toggleSelection = (playlist: BrowsablePlaylist) => {
    setError('');
    setJustSent(null);
    if (selectedIds.length === 0) revealForm();
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
      setJustSent({
        name: selectedPlaylists[0]?.curatorName || '',
        photoUrl: selectedPlaylists[0]?.curatorPhotoUrl || null,
      });
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

  if (quote) {
    return (
      <PitchCheckoutPanel
        quote={quote}
        faces={Object.fromEntries(selectedPlaylists.map((playlist) => [playlist.curatorName, playlist.curatorPhotoUrl]))}
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


  // Pick-a-curator grid first, then (only once something is picked) the two
  // fields that matter. Founder brief 2026-10-11: "images of the curators first
  // in a grid like a menu", and cut the text so a 5th grader is not
  // overwhelmed. So: no labels where a placeholder says it, no helper lines,
  // no genre box, a counter only near the limit, and the song title is the
  // release's own unless the release has none.
  const single = selectedPlaylists.length === 1 ? selectedPlaylists[0] : null;
  const showCounter = note.length > MAX_PITCH_NOTE_LENGTH - 60;

  return (
    <div className="space-y-5">
      {atLimit ? (
        <p className="rounded-xl bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          {MAX_WAITING_PITCHES_PER_RELEASE} pitches are waiting. Wait for a reply first.
        </p>
      ) : null}

      {curatorFilter ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-brand/10 px-3 py-2 text-sm">
          <span className="text-content-primary">One curator</span>
          {onClearCurator ? (
            <button
              type="button"
              onClick={onClearCurator}
              className="font-semibold text-brand hover:underline"
            >
              See all
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        role="radiogroup"
        aria-label="Platform"
        className="no-scrollbar -mx-1 -my-1 flex gap-2 overflow-x-auto px-1 py-1"
      >
        {['', ...PITCH_PLATFORMS.filter((platform) => platform !== 'other')].map((platform) => {
          const active = platformFilter === platform;
          return (
            <button
              key={platform || 'all'}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPlatformFilter(platform)}
              className={`h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                active
                  ? 'bg-content-primary text-bg-base'
                  : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
              }`}
            >
              {platform ? PITCH_PLATFORM_LABELS[platform as keyof typeof PITCH_PLATFORM_LABELS] : 'All'}
            </button>
          );
        })}
      </div>

      {isLoadingPlaylists ? (
        <CuratorGridSkeleton />
      ) : playlists.length === 0 ? (
        <p className="rounded-2xl bg-bg-surface p-6 text-center text-sm text-content-secondary">
          No curators here yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {playlists.map((playlist) => {
            const isSelected = selectedIds.includes(playlist.id);
            const price =
              isPaidPlaylist(playlist) && typeof playlist.pitchPriceKobo === 'number'
                ? formatNaira(playlist.pitchPriceKobo)
                : '';
            return (
              <li key={playlist.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${playlist.curatorName}, ${playlist.name}${price ? `, ${price}` : ''}`}
                  onClick={() => toggleSelection(playlist)}
                  className={`group relative block aspect-square w-full overflow-hidden rounded-2xl text-left transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98] ${
                    isSelected ? 'ring-[3px] ring-brand ring-offset-2 ring-offset-bg-base' : ''
                  }`}
                >
                  <CuratorFace name={playlist.curatorName} photoUrl={playlist.curatorPhotoUrl} className="transition-transform duration-300 group-hover:scale-105" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-3">
                    <span className="block truncate text-sm font-semibold text-white sm:text-base">
                      {playlist.curatorName}
                    </span>
                    <span className="block truncate text-xs text-white/75">{playlist.name}</span>
                  </span>
                  {price ? (
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                      {price}
                    </span>
                  ) : null}
                  {isSelected ? (
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-content-inverse shadow">
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {justSent && selectedPlaylists.length === 0 ? (
        <div
          role="status"
          className="flex items-center gap-4 rounded-2xl bg-brand/10 p-4 animate-enter"
        >
          <span className="rounded-full ring-2 ring-brand">
            <CuratorFace name={justSent.name} photoUrl={justSent.photoUrl} size={48} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold text-content-primary">Sent</p>
            <p className="truncate text-sm text-content-secondary">
              {justSent.name ? `${justSent.name} will answer here.` : 'Their answer shows here.'}
            </p>
          </div>
        </div>
      ) : null}

      {selectedPlaylists.length > 0 ? (
        <form
          ref={formRef}
          onSubmit={handleSend}
          className="animate-enter space-y-3 rounded-2xl border border-stroke-default bg-bg-surface p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {selectedPlaylists.slice(0, 3).map((playlist) => (
                <span key={playlist.id} className="rounded-full ring-2 ring-bg-surface">
                  <CuratorFace name={playlist.curatorName} photoUrl={playlist.curatorPhotoUrl} size={36} />
                </span>
              ))}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-content-primary">
              {single ? `To ${single.curatorName}` : `To ${selectedPlaylists.length} curators`}
            </p>
            {single?.url ? (
              <button
                type="button"
                onClick={() => void openExternalUrl(single.url)}
                aria-label={`Open ${single.name}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-content-tertiary transition-colors hover:bg-bg-elevated hover:text-content-primary"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {!initialSongTitle.trim() ? (
            <input
              aria-label="Song name"
              className={inputClass}
              value={songTitle}
              maxLength={MAX_SONG_TITLE_LENGTH}
              onChange={(event) => setSongTitle(event.target.value)}
              placeholder="Song name"
              required
            />
          ) : null}

          <input
            aria-label="Song link"
            type="url"
            inputMode="url"
            className={inputClass}
            value={songUrl}
            onChange={(event) => setSongUrl(event.target.value)}
            placeholder={songLinkPlaceholder}
            required
          />

          <div className="relative">
            <textarea
              aria-label="Note"
              rows={2}
              className="w-full resize-none rounded-xl border border-stroke-control bg-bg-base p-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
              value={note}
              maxLength={MAX_PITCH_NOTE_LENGTH}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Say hi (optional)"
            />
            {storyNote && note.trim() === '' ? (
              <button
                type="button"
                onClick={() => setNote(storyNote)}
                className="absolute bottom-3 right-3 rounded-full bg-bg-elevated px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/10"
              >
                Use story
              </button>
            ) : null}
            {showCounter ? (
              <p className="mt-1 text-right font-mono text-[11px] text-content-tertiary">
                {note.length}/{MAX_PITCH_NOTE_LENGTH}
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-status-error">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Sending…' : paidSelection ? REVIEW_AND_PAY : 'Send'}
          </button>
        </form>
      ) : error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CuratorGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-2xl bg-bg-elevated" />
      ))}
    </div>
  );
}

/**
 * The long placeholder from `sm` up, the short one on a narrow phone, where
 * the long one would be cut off. Starts short so a phone never flashes the long
 * one, then reads the width once and follows it.
 */
function useSongLinkPlaceholder(): string {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(min-width: 640px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide ? SONG_LINK_PLACEHOLDER : SONG_LINK_PLACEHOLDER_SHORT;
}
