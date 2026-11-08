'use client';

// "Send to curators" on credits (URG-345, Phase 1; approved v2 mocks, Oct 17,
// 2026). Replaces CuratorPicker's one-curator sheet when
// NEXT_PUBLIC_FEATURE_PITCH_CREDITS is on.
//
// One screen: a grouped list of curators (check circle, small face, name,
// playlist, and the price trailing: "100" credits or "Free"), the song link and
// note once something is picked, and one translucent bar with the single accent
// action "Send to N" and, under it, the balance in outcomes ("300 credits · 560
// left, enough for 5 pitches"). Short on credits, the button becomes "Top up
// and send" and a sheet offers the smallest pack that covers the gap; after
// Paystack the pitches send themselves and the selection is never lost. Naira
// appears only inside that sheet.
//
// Copy is always "a listen and a written reply", never a playlist spot.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from '@/components/icons';
import type { BrowsablePlaylist, PitchPlatform, SentPitch } from '@/types/pitching';
import { supabase } from '@/lib/supabase/client';
import {
  MAX_PITCH_NOTE_LENGTH,
  PITCH_PLATFORMS,
  PITCH_PLATFORM_LABELS,
  SONG_LINK_PLACEHOLDER_SHORT,
  isValidSongUrl,
} from '@/lib/pitching';
import { pitchNoteFromStory } from '@/lib/release-epk';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { publishReleaseKitLink } from '@/lib/pitch-kit-client';
import { longestKitUrl, noteRoom, noteWithKit } from '@/lib/pitch-kit-link';
import { isCreditsReference } from '@/lib/credits/purchase';
import { TOPUP_PACKS, creditsForPack, packPriceUsd } from '@/lib/credits/packs';
import { useVisitorCurrency } from '@/lib/visitor-currency';
import type { CreditAccount } from '@/lib/credits/allowance';
import { canPayForPitchesHere, openPaystackCheckout } from '@/lib/pitch-payments-client';
import {
  CHECKING_TOP_UP,
  EMPTY_PLATFORM_LINE,
  LOAD_ERROR,
  NOTHING_SENT_OR_CHARGED,
  PAYMENT_DIDNT_GO_THROUGH,
  PAYSTACK_FOOTNOTE,
  PITCH_CREDITS_SUBTITLE,
  PITCH_MORE,
  SENDING_AFTER_TOP_UP,
  SENT_NOTE,
  SENT_NOTE_FREE,
  SONG_LINK_FIRST,
  TOP_UP_AND_SEND,
  TOP_UP_ON_THE_WEB,
  TOP_UP_UNAVAILABLE,
  emptyPlatform,
  normalizeCreditPrice,
  packCredits,
  payButtonLabel,
  selectedCount,
  selectionTotal,
  sendButtonLabel,
  sentReceipt,
  sentTitle,
  smallestCoveringPack,
  topUpLead,
  trayFootnote,
  trayShortLead,
  trayShortTail,
} from '@/lib/pitch-credits';
import {
  clearPendingCreditSend,
  fetchPitchCredits,
  newRequestId,
  readPendingCreditSend,
  savePendingCreditSend,
  sendCreditPitchesRequest,
  startTopUp,
  waitForTopUp,
  type PitchCredits,
  type SendBody,
} from '@/lib/pitch-credits-client';
import { CuratorFace } from './CuratorFace';
import { currentShareOrigin } from '@/lib/app-hosts';

type Props = {
  releaseId: string;
  songTitle: string;
  story: string;
  kitUrl: string | null;
  kitReady: boolean;
  atLimit: boolean;
  curatorSlug?: string;
  /** Paystack's reference when coming back from a top-up, else ''. */
  topUpReference?: string;
  /** True when Paystack's cancel link brought the person back. */
  topUpCancelled?: boolean;
  onSent: (pitches: SentPitch[]) => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

const PLATFORMS = PITCH_PLATFORMS.filter((platform) => platform !== 'other');

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/** The mock's plain check (the house Check mark is a textile glyph that reads
 *  as a diamond at this size). */
function CheckMark({ size = 12, width = 3.4 }: { size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function CreditGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" />
      <circle cx="8" cy="8" r="3" strokeWidth="1.3" />
    </svg>
  );
}

type Sent = { count: number; charged: number; balance: number | null };
type Banner = { title: string; line: string } | null;

export function CreditPitchPicker({
  releaseId,
  songTitle,
  story,
  kitUrl,
  kitReady,
  atLimit,
  curatorSlug,
  topUpReference = '',
  topUpCancelled = false,
  onSent,
  onToast,
}: Props) {
  const [playlists, setPlaylists] = useState<BrowsablePlaylist[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [credits, setCredits] = useState<PitchCredits | null>(null);
  const [platform, setPlatform] = useState<PitchPlatform | ''>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [songUrl, setSongUrl] = useState('');
  const attachKit = Boolean(kitUrl || kitReady);
  const origin = currentShareOrigin();
  const room = noteRoom(attachKit ? kitUrl || longestKitUrl(origin) : null, MAX_PITCH_NOTE_LENGTH);
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [error, setError] = useState('');
  const [banner, setBanner] = useState<Banner>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const requestIdRef = useRef<string>('');
  const linkRef = useRef<HTMLInputElement>(null);
  const curatorFilter = (curatorSlug || '').trim();

  // The note starts from the kit's story, until the person types their own.
  const storyNote = pitchNoteFromStory(story, room);
  const noteValue = noteTouched ? note : storyNote;

  const loadCredits = useCallback(async () => {
    setCredits(await fetchPitchCredits());
  }, []);

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
    void loadCredits();
  }, [load, loadCredits]);

  // Land on the first platform that has curators (or the deep-linked one's).
  useEffect(() => {
    if (!playlists || platform) return;
    const first = PLATFORMS.find((entry) => playlists.some((playlist) => playlist.platform === entry));
    setPlatform(first || PLATFORMS[0]);
    if (curatorFilter && playlists[0]) setSelected([playlists[0].id]);
  }, [curatorFilter, platform, playlists]);

  const byId = useMemo(() => new Map((playlists ?? []).map((playlist) => [playlist.id, playlist])), [playlists]);
  const visible = useMemo(
    () => (playlists ?? []).filter((playlist) => playlist.platform === platform),
    [platform, playlists]
  );
  const picked = selected.map((id) => byId.get(id)).filter((entry): entry is BrowsablePlaylist => Boolean(entry));
  const total = selectionTotal(picked.map((playlist) => normalizeCreditPrice(playlist.creditPrice)));
  const balance = credits?.balance ?? null;
  const short = balance !== null && total > balance ? total - balance : 0;

  const toggle = (playlistId: string) => {
    setError('');
    setBanner(null);
    setSent(null);
    requestIdRef.current = '';
    setSelected((current) =>
      current.includes(playlistId) ? current.filter((id) => id !== playlistId) : [...current, playlistId]
    );
  };

  const buildBody = async (): Promise<SendBody> => {
    let link = kitUrl;
    if (!link && kitReady) {
      const published = await publishReleaseKitLink(releaseId);
      link = published.ok ? published.url : null;
    }
    if (!requestIdRef.current) requestIdRef.current = newRequestId();
    return {
      releaseId,
      playlistIds: picked.map((playlist) => playlist.id),
      songTitle: songTitle.trim(),
      songUrl: songUrl.trim(),
      note: noteWithKit(noteValue, link, MAX_PITCH_NOTE_LENGTH),
      requestId: requestIdRef.current,
    };
  };

  const finishSend = useCallback(
    (result: { pitches: SentPitch[]; charged: number; balance: number | null }, count: number) => {
      setSent({ count, charged: result.charged, balance: result.balance });
      setSelected([]);
      setNote('');
      setNoteTouched(false);
      requestIdRef.current = '';
      clearPendingCreditSend();
      onToast(sentTitle(count), 'success');
      onSent(result.pitches);
      void loadCredits();
    },
    [loadCredits, onSent, onToast]
  );

  const send = async () => {
    if (sending || picked.length === 0 || atLimit) return;
    setError('');
    if (!songTitle.trim()) {
      setError('This rollout needs a title first.');
      return;
    }
    if (!isValidSongUrl(songUrl)) {
      setLinkError(SONG_LINK_FIRST);
      linkRef.current?.focus();
      linkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (short > 0) {
      setSheetOpen(true);
      return;
    }
    setSending(true);
    try {
      const body = await buildBody();
      const result = await sendCreditPitchesRequest(body);
      if (result.ok) {
        finishSend(result, body.playlistIds.length);
        return;
      }
      if (result.code === 'insufficient') {
        if (typeof result.balance === 'number') {
          setCredits((current) => (current ? { ...current, balance: result.balance as number } : current));
        }
        setSheetOpen(true);
        return;
      }
      setError(result.error);
    } finally {
      setSending(false);
    }
  };

  // Coming back from Paystack (or its cancel link) with pitches waiting.
  const ranReturn = useRef(false);
  useEffect(() => {
    if (ranReturn.current || !playlists) return;
    const pending = readPendingCreditSend();
    if (!pending || pending.releaseId !== releaseId) return;
    const reference = topUpReference.trim();
    if (!topUpCancelled && !isCreditsReference(reference)) return;
    ranReturn.current = true;

    // The selection comes back either way: it is never lost.
    setSelected(pending.playlistIds.filter((id) => playlists.some((playlist) => playlist.id === id)));
    setSongUrl(pending.songUrl);
    setNote(pending.note);
    setNoteTouched(true);
    requestIdRef.current = pending.requestId;
    stripReturnParams();

    if (topUpCancelled || !reference) {
      clearPendingCreditSend();
      setBanner({ title: PAYMENT_DIDNT_GO_THROUGH, line: NOTHING_SENT_OR_CHARGED });
      return;
    }

    void (async () => {
      setSending(true);
      setStatus(CHECKING_TOP_UP);
      try {
        const state = await waitForTopUp(reference);
        await loadCredits();
        if (state !== 'paid') {
          clearPendingCreditSend();
          setBanner({ title: PAYMENT_DIDNT_GO_THROUGH, line: NOTHING_SENT_OR_CHARGED });
          return;
        }
        setStatus(SENDING_AFTER_TOP_UP);
        const result = await sendCreditPitchesRequest(pending);
        if (result.ok) {
          finishSend(result, pending.playlistIds.length);
          return;
        }
        clearPendingCreditSend();
        setError(result.error);
      } finally {
        setSending(false);
        setStatus('');
      }
    })();
  }, [finishSend, loadCredits, playlists, releaseId, topUpCancelled, topUpReference]);

  const pay = async (priceNaira: number): Promise<string | null> => {
    const body = await buildBody();
    savePendingCreditSend(body);
    const opened = await startTopUp(priceNaira);
    if (!opened.ok) {
      clearPendingCreditSend();
      return opened.error;
    }
    await openPaystackCheckout(opened.url);
    return null;
  };

  const platformLabel = platform ? PITCH_PLATFORM_LABELS[platform] : '';

  return (
    <section aria-label="Send to curators">
      <h3 className="font-display text-xl text-content-primary">Send to curators</h3>
      <p className="mt-1 text-sm text-content-primary/55">{PITCH_CREDITS_SUBTITLE}</p>

      <div
        role="radiogroup"
        aria-label="Platform"
        className="mt-4 grid grid-cols-4 gap-0.5 rounded-[10px] bg-bg-elevated p-0.5 lg:max-w-[440px]"
      >
        {PLATFORMS.map((entry) => {
          const active = entry === platform;
          return (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPlatform(entry)}
              className={`motion-focus h-9 truncate rounded-[8px] px-1 text-[13px] transition-colors ${
                active
                  ? 'bg-content-primary/[0.16] font-semibold text-content-primary shadow-sm'
                  : 'text-content-primary/75 hover:text-content-primary'
              }`}
            >
              {PITCH_PLATFORM_LABELS[entry]}
            </button>
          );
        })}
      </div>

      {banner ? (
        <div role="alert" className="mt-4 rounded-2xl bg-status-error/10 px-4 py-3">
          <p className="text-[15px] font-semibold text-content-primary">{banner.title}</p>
          <p className="text-[13px] text-content-primary/55">{banner.line}</p>
        </div>
      ) : null}

      {atLimit ? (
        <p className="mt-4 rounded-xl bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          10 pitches are waiting. Wait for a reply first.
        </p>
      ) : null}

      <div className="mt-4">
        {loadError ? (
          <div className="rounded-2xl bg-bg-surface p-4">
            <p className="text-[15px] font-semibold text-content-primary" role="alert">
              {LOAD_ERROR}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="motion-focus mt-1 min-h-11 text-sm font-semibold text-brand hover:underline"
            >
              Try again
            </button>
          </div>
        ) : !playlists ? (
          <ListSkeleton />
        ) : sent ? (
          <SentCard sent={sent} onMore={() => setSent(null)} />
        ) : visible.length === 0 ? (
          <div className="rounded-2xl bg-bg-surface px-4 py-8 text-center">
            <p className="text-[15px] font-semibold text-content-primary">{emptyPlatform(platformLabel)}</p>
            <p className="mt-0.5 text-[13px] text-content-primary/55">{EMPTY_PLATFORM_LINE}</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl bg-bg-surface" aria-label={`${platformLabel} curators`}>
            {visible.map((playlist, index) => {
              const isOn = selected.includes(playlist.id);
              const price = normalizeCreditPrice(playlist.creditPrice);
              return (
                <li key={playlist.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isOn}
                    onClick={() => toggle(playlist.id)}
                    className="motion-focus flex w-full items-center gap-3 pl-4 text-left transition-colors hover:bg-content-primary/[0.03] active:bg-content-primary/[0.06]"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full transition-colors ${
                        isOn ? 'bg-brand text-content-inverse' : 'ring-[1.5px] ring-inset ring-content-primary/30'
                      }`}
                    >
                      {isOn ? <CheckMark /> : null}
                    </span>
                    <CuratorFace name={playlist.curatorName} photoUrl={playlist.curatorPhotoUrl} size={44} />
                    <span
                      className={`flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 ${
                        index > 0 ? 'border-t border-content-primary/10' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-content-primary">{playlist.curatorName}</span>
                        <span className="block truncate text-[13px] text-content-primary/55">{playlist.name}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[15px] tabular-nums text-content-primary/55">
                        {price > 0 ? (
                          <>
                            {price}
                            <CreditGlyph />
                            <span className="sr-only">credits</span>
                          </>
                        ) : (
                          'Free'
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {picked.length > 0 && !sent ? (
        <div className="mt-4 overflow-hidden rounded-2xl bg-bg-surface">
          <label className="block px-4 pt-3">
            <span className="block text-[13px] text-content-primary/55">Song link</span>
            <input
              ref={linkRef}
              type="url"
              inputMode="url"
              value={songUrl}
              onChange={(event) => {
                setSongUrl(event.target.value);
                setLinkError('');
              }}
              placeholder={SONG_LINK_PLACEHOLDER_SHORT}
              aria-invalid={Boolean(linkError)}
              className="h-11 w-full bg-transparent text-base text-content-primary placeholder:text-content-tertiary focus:outline-none sm:text-[15px]"
            />
          </label>
          {linkError ? <p className="px-4 pb-1 text-[13px] text-status-error">{linkError}</p> : null}
          <label className="ml-4 block border-t border-content-primary/10 pr-4 pt-3">
            <span className="block text-[13px] text-content-primary/55">Note</span>
            <textarea
              rows={3}
              value={noteValue}
              maxLength={room}
              onChange={(event) => {
                setNoteTouched(true);
                setNote(event.target.value);
              }}
              placeholder="Say hi"
              className="w-full resize-none bg-transparent py-2 text-base text-content-primary placeholder:text-content-tertiary focus:outline-none sm:text-[15px]"
            />
          </label>
          {attachKit ? (
            <p className="ml-4 flex items-center gap-2 border-t border-content-primary/10 py-3 pr-4 text-[13px] text-content-primary/55">
              <span className="text-brand">
                <CheckMark size={14} width={2.6} />
              </span>
              Your kit goes with it
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {picked.length > 0 && !sent ? (
        <SendBar
          count={picked.length}
          total={total}
          balance={balance}
          short={short}
          sending={sending}
          status={status}
          disabled={atLimit}
          onSend={() => void send()}
        />
      ) : null}

      {sheetOpen && credits ? (
        <TopUpSheet
          account={credits.account}
          short={short}
          count={picked.length}
          canBuy={credits.canBuy && credits.purchasable}
          onClose={() => setSheetOpen(false)}
          onPay={pay}
        />
      ) : null}
    </section>
  );
}

function stripReturnParams(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('reference');
    url.searchParams.delete('trxref');
    url.searchParams.delete('payment');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  } catch {
    // Leave the address as it is.
  }
}

function SendBar({
  count,
  total,
  balance,
  short,
  sending,
  status,
  disabled,
  onSend,
}: {
  count: number;
  total: number;
  balance: number | null;
  short: number;
  sending: boolean;
  status: string;
  disabled: boolean;
  onSend: () => void;
}) {
  const footnote = status ? (
    status
  ) : balance === null ? (
    total > 0 ? `${total.toLocaleString('en')} credits` : 'Free'
  ) : short > 0 ? (
    <>
      {trayShortLead(total, balance)} <span className="text-status-warning">{trayShortTail(short)}</span>
    </>
  ) : (
    trayFootnote(total, balance)
  );
  const label = short > 0 ? TOP_UP_AND_SEND : sendButtonLabel(count);

  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-20 -mx-4 mt-4 border-t border-stroke-default bg-bg-base/80 px-4 pb-3 pt-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border lg:bottom-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="hidden min-w-0 lg:block">
          <p className="text-[15px] font-semibold text-content-primary">{selectedCount(count)}</p>
          <p className="truncate text-[13px] text-content-primary/55" aria-live="polite">
            {footnote}
          </p>
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || sending}
          className="motion-press inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-[17px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-60 lg:h-11 lg:w-60 lg:rounded-xl lg:text-[15px]"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {label}
        </button>
        <p className="text-center text-[13px] text-content-primary/55 lg:hidden" aria-live="polite">
          {footnote}
        </p>
      </div>
    </div>
  );
}

function SentCard({ sent, onMore }: { sent: Sent; onMore: () => void }) {
  return (
    <div role="status" className="flex flex-col items-center px-4 py-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand/15 text-brand" aria-hidden="true">
        <CheckMark size={28} width={2.6} />
      </span>
      <p className="mt-4 font-display text-3xl text-content-primary">{sentTitle(sent.count)}</p>
      {sent.balance !== null ? (
        <p className="mt-1 text-[15px] text-content-primary/55">{sentReceipt(sent.charged, sent.balance)}</p>
      ) : null}
      <p className="mt-3 max-w-xs text-[13px] text-content-primary/55">{sent.charged > 0 ? SENT_NOTE : SENT_NOTE_FREE}</p>
      <button
        type="button"
        onClick={onMore}
        className="motion-focus mt-3 min-h-11 text-sm font-semibold text-brand hover:underline"
      >
        {PITCH_MORE}
      </button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="overflow-hidden rounded-2xl bg-bg-surface" aria-busy="true" aria-label="Loading curators">
      {Array.from({ length: 4 }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 pl-4">
          <span className="h-[22px] w-[22px] shrink-0 animate-pulse rounded-full bg-bg-elevated" />
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-bg-elevated lg:h-10 lg:w-10" />
          <span className={`flex flex-1 flex-col gap-2 py-4 pr-4 ${index > 0 ? 'border-t border-content-primary/10' : ''}`}>
            <span className="h-3 w-2/5 animate-pulse rounded bg-bg-elevated" />
            <span className="h-2.5 w-1/4 animate-pulse rounded bg-bg-elevated" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function TopUpSheet({
  account,
  short,
  count,
  canBuy,
  onClose,
  onPay,
}: {
  account: CreditAccount;
  short: number;
  count: number;
  canBuy: boolean;
  onClose: () => void;
  onPay: (priceNaira: number) => Promise<string | null>;
}) {
  const covering = smallestCoveringPack(account, short);
  const [price, setPrice] = useState<number>(covering?.pack.priceNaira ?? TOPUP_PACKS[TOPUP_PACKS.length - 1].priceNaira);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onWeb = canPayForPitchesHere();
  const currency = useVisitorCurrency();

  useEffect(() => lockBodyScroll(), []);

  const pay = async () => {
    setBusy(true);
    setError('');
    const problem = await onPay(price);
    if (problem) {
      setError(problem);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[180]">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/55"
      />
      <DialogPanel
        label={TOP_UP_AND_SEND}
        onClose={onClose}
        className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[22px] bg-bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-[440px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[18px] lg:p-6"
      >
        <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-content-primary/25 lg:hidden" aria-hidden="true" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[20px] font-semibold text-content-primary">{TOP_UP_AND_SEND}</p>
            <p className="mt-1 text-[15px] text-content-primary/55">{topUpLead(short, count)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hit-44 relative motion-focus grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-content-primary/10 text-content-primary/70 hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {!onWeb ? (
          <p className="mt-5 rounded-2xl bg-bg-elevated p-4 text-[15px] text-content-primary">{TOP_UP_ON_THE_WEB}</p>
        ) : !canBuy ? (
          <p className="mt-5 rounded-2xl bg-bg-elevated p-4 text-[15px] text-content-primary">
            {TOP_UP_UNAVAILABLE} Ask the person who runs your team to buy credits.
          </p>
        ) : (
          <>
            <ul className="mt-5 overflow-hidden rounded-2xl bg-bg-elevated" role="radiogroup" aria-label="Credit packs">
              {TOPUP_PACKS.map((pack, index) => {
                const packCreditCount = creditsForPack(account, pack.priceNaira) ?? 0;
                const tooSmall = packCreditCount < short;
                const active = pack.priceNaira === price;
                return (
                  <li key={pack.priceNaira}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={tooSmall}
                      onClick={() => setPrice(pack.priceNaira)}
                      className="motion-focus flex w-full items-center pl-4 text-left disabled:cursor-not-allowed"
                    >
                      <span
                        className={`flex flex-1 items-center gap-3 py-3.5 pr-4 ${index > 0 ? 'border-t border-content-primary/10' : ''} ${
                          tooSmall ? 'opacity-40' : ''
                        }`}
                      >
                        <span className="flex-1 text-[17px] text-content-primary">{packCredits(packCreditCount)}</span>
                        <span className="text-[17px] tabular-nums text-content-primary/55">
                          {currency === 'USD' ? `$${packPriceUsd(pack)}` :`₦${pack.priceNaira.toLocaleString('en')}`}
                        </span>
                        <span className="grid w-5 place-items-center text-brand" aria-hidden="true">
                          {active ? <CheckMark size={17} width={2.6} /> : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-status-error">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void pay()}
              disabled={busy}
              className="motion-press mt-5 inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[17px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {payButtonLabel(price)}
            </button>
            <p className="mt-2 text-center text-[13px] text-content-primary/55">{PAYSTACK_FOOTNOTE}</p>
          </>
        )}
      </DialogPanel>
    </div>,
    document.body
  );
}
