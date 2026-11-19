'use client';

// The first block of Home on a computer (#1295, part of #1175; founder
// approved docs/mocks/home-chat-desktop): a box to ask AI on the left and the
// Next drop on the right. Since #1305 (docs/mocks/home-wallpaper) it has no
// card: the greeting, the box, the suggestions and the Next drop sit on the
// page, with one thin line between the chat and the Next drop.
//
// Sending hands the message to the Assistant the way the phone's box and the
// rollout pages' box do (HomeAskBar, PageComposer in SwipeFrame): the chat it
// belongs to is put on screen first, then the text and files go into
// useChappiStore with sendInputOnOpen, and the Assistant's conversation sends
// them as it mounts. A picked rollout goes to that rollout's own chat
// (?rollout=), Everything to the person's own chat. The box is local state, so
// it is empty again when the person comes back to Home.
//
// Rules (greeting, picker order and default, suggestions) live in
// lib/home-desktop/chat-card.ts, tested.

import { Button } from '@/components/ui/button';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUp, Check, ChevronDown, Clock, Loader2, Mic, Sparkles, UserPlus } from '@/components/icons';
import { ChappiAttachMenu } from '@/components/chappi/ChappiAttachMenu';
import { ChappiAttachmentTray } from '@/components/chappi/ChappiAttachments';
import { useAttachments } from '@/components/chappi/useAttachments';
import { useLazyVoiceInput } from '@/components/chappi/useLazyVoiceInput';
import { useHoldToTalk } from '@/components/chappi/useHoldToTalk';
import { isUrgansVoiceEnabled } from '@/lib/chappi/config';
import { COMPOSER_FOCUS_EVENT } from '@/lib/composer-focus';
import { formatHoldElapsed } from '@/lib/hold-to-talk';
import { mergeTranscript } from '@/lib/urgans-voice';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';
import { showMain } from '@/components/shell/swipe/main-thread';
import { Cover, percent, shortDay, typeLabel, type ListRow } from '@/components/artists/ArtistListParts';
import { assistantHref } from '@/lib/assistant-chats';
import { useAuthStore } from '@/lib/auth-store';
import { releaseHref } from '@/lib/artist-page';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { markArrivingFromHome, prefersReducedMotion } from '@/lib/home-chat-glide';
import {
  CHAT_CARD_COPY,
  PHONE_TRY_CARDS,
  TRY_CARDS_LABEL,
  aboutOptions,
  buildChatSuggestions,
  chatCardGreeting,
  defaultAboutId,
  showTryCards,
  type AboutOption,
  type ChatSuggestion,
  type TryCard,
} from '@/lib/home-desktop/chat-card';
import { URGANS_HREF } from '@/lib/shell-nav';
import { useChappiStore } from '@/stores/useChappiStore';
import { showRolloutSession } from '@/stores/useChappiHistoryStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useShellStore } from '@/stores/useShellStore';
import { displayReleaseTitle } from '@/types/releases';
import { HOME_RULE } from './home-style';

/** How many messages this person has sent from a phone's Home box, so the
 *  Try one cards can step aside once they use it (lib: showTryCards). */
const PHONE_SENT_KEY = 'urganize.home.phone-sent.';
const VOICE_ENABLED = isUrgansVoiceEnabled();

function readPhoneSent(userId: string | null): number {
  if (!userId || typeof window === 'undefined') return 0;
  try {
    return Number(window.localStorage.getItem(`${PHONE_SENT_KEY}${userId}`) ?? '0');
  } catch {
    return 0;
  }
}

export function HomeChatCard({
  rows,
  spotlight,
  today,
  layout = 'desktop',
}: {
  rows: ListRow[];
  spotlight: ListRow | null;
  today: string;
  /** 'phone' (#1339, docs/mocks/home-chat-phone, after Linear's phone
   *  screen): one column at the top of the phone's Home, no Next drop beside
   *  it, and three Try one cards in place of the suggestion pills. */
  layout?: 'desktop' | 'phone';
}) {
  const phone = layout === 'phone';
  const router = useRouter();
  const name = useAuthStore((state) => state.user?.name ?? null);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const openPlanChoice = useShellStore((state) => state.openPlanChoice);
  const openAddArtist = useShellStore((state) => state.openAddArtist);
  // Read on render, so it is right once the signed-in user is known. The
  // phone's Home only draws in the browser (its rows come from stores loaded
  // there), so the server never renders a different answer.
  const phoneSent = phone ? readPhoneSent(userId) : 0;
  const releases = useReleaseStore((state) => state.releases);
  const attach = useAttachments();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // On a phone this is Home's only box (#1339), so it says so, takes what
  // "Ask AI" in the search bar puts in the shared box, and keeps the hold to
  // talk mic the pinned box had.
  useEffect(() => {
    if (!phone) return;
    const swipe = useSwipeNavStore.getState();
    swipe.setHomeAsk(true);
    const focus = () => {
      const asked = useChappiStore.getState().input;
      if (asked) setText(asked);
      fieldRef.current?.focus();
    };
    window.addEventListener(COMPOSER_FOCUS_EVENT, focus);
    return () => {
      useSwipeNavStore.getState().setHomeAsk(false);
      window.removeEventListener(COMPOSER_FOCUS_EVENT, focus);
    };
  }, [phone]);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  });
  const holdSendRef = useRef<() => boolean>(() => false);
  const sendSpokenRef = useRef<(spoken: string) => void>(() => undefined);
  const [voice, voiceDriver] = useLazyVoiceInput({
    enabled: phone && VOICE_ENABLED,
    onTranscript: (spoken) => {
      const merged = mergeTranscript(textRef.current, spoken);
      setText(merged);
      if (holdSendRef.current()) sendSpokenRef.current(merged);
    },
    getHints: () => ({}),
  });
  const hold = useHoldToTalk(voice, phone && voice.supported && !sending);
  useEffect(() => {
    holdSendRef.current = hold.shouldSend;
  });
  const isRecording = voice.state === 'recording';
  const isTranscribing = voice.state === 'transcribing';

  // The device clock, read when Home mounts (Home on a computer only ever
  // draws in the browser, so the server never renders a different hour).
  const hello = useMemo(() => chatCardGreeting({ name }), [name]);

  const options = useMemo(
    () =>
      aboutOptions(
        releases.map((release) => ({
          id: release.id,
          title: displayReleaseTitle(release.title),
          artistName: release.artistName,
          releaseDate: release.releaseDate,
        })),
        today
      ),
    [releases, today]
  );
  // Starts on Everything, or on the only rollout. A pick that is gone falls back.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const aboutId = picked === undefined || (picked && !options.some((option) => option.id === picked))
    ? defaultAboutId(options)
    : picked;

  const suggestions = useMemo(
    () =>
      buildChatSuggestions(
        rows.map((row) => ({
          artistName: row.artist.name,
          status: row.status,
          releaseId: row.next?.id ?? null,
          title: row.next ? displayReleaseTitle(row.next.title) : null,
          daysToGo: row.daysToGo,
          late: row.late,
        }))
      ),
    [rows]
  );

  // Fetch the Assistant ahead of time, so sending never waits on a download.
  useEffect(() => {
    router.prefetch(URGANS_HREF);
  }, [router]);

  // The box grows with what is typed, up to a few lines, then scrolls.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 168)}px`;
  }, [text]);

  const hasContent = text.trim().length > 0 || attach.attachments.length > 0;
  const canSend = hasContent && attach.pending === 0 && !sending;

  const send = async (message: string, releaseId: string | null, source: 'box' | 'suggestion') => {
    const trimmed = message.trim();
    const files = source === 'box' ? attach.attachments : [];
    if (sending || attach.pending > 0 || (!trimmed && files.length === 0)) return;
    setSending(true);
    if (phone && userId) {
      try {
        window.localStorage.setItem(`${PHONE_SENT_KEY}${userId}`, String(readPhoneSent(userId) + 1));
      } catch {
        // A count that cannot be kept only means the cards stay.
      }
    }
    captureAnalyticsEvent({
      name: 'home_chat_sent',
      properties: { source, about: releaseId ? 'rollout' : 'everything', files: files.length },
    });
    // Put the chat it belongs to on screen first, so the Assistant sends into
    // that chat and not whichever one was open last (PageComposer's order).
    try {
      if (releaseId) await showRolloutSession(releaseId);
      else await showMain();
    } catch {
      // The Assistant opens the right chat from its address anyway.
    }
    const store = useChappiStore.getState();
    store.setInput(trimmed);
    store.setPendingAttachments(files);
    store.setScopedRecordId(null);
    store.setScopedReleaseId(releaseId);
    store.setSendInputOnOpen(true);
    if (source === 'box') attach.clear();
    if (!prefersReducedMotion()) markArrivingFromHome();
    // On a phone the chat sits in the next swipe tab: glide there, as the
    // pinned box did, rather than pushing a page over the pager.
    const go = phone && !releaseId ? useSwipeNavStore.getState().go : null;
    if (go) go('urgans');
    else router.push(assistantHref(releaseId));
  };
  useEffect(() => {
    sendSpokenRef.current = (spoken) => void send(spoken, aboutId, 'box');
  });

  const onTryCard = (card: TryCard) => {
    captureAnalyticsEvent({ name: 'home_try_card', properties: { kind: card.kind } });
    if (card.kind === 'plan') openPlanChoice();
    else if (card.kind === 'artist') openAddArtist();
    else if (card.ask) void send(card.ask, null, 'suggestion');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend) void send(text, aboutId, 'box');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift and Enter is a new line. Never mid-composition (IME).
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) void send(text, aboutId, 'box');
  };

  return (
    <section
      data-home-block="next_drop"
      aria-label="Ask AI"
      className={
        phone
          ? 'pb-1 pt-2'
          : 'grid grid-cols-[minmax(0,1fr)_16rem] gap-8 pb-1 pt-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-14'
      }
    >
      <div className="flex min-w-0 flex-col">
        <p className="text-[13px] font-medium leading-5 text-content-secondary">{hello.line}</p>
        <h2
          className={
            phone
              ? 'mt-1.5 font-display text-[28px] font-normal leading-[34px] tracking-[-0.01em] text-content-primary'
              : 'mt-2.5 font-display text-[34px] font-normal leading-[42px] tracking-[-0.01em] text-content-primary xl:text-[40px] xl:leading-[44px]'
          }
        >
          {hello.greeting}
          <br />
          <span className="text-content-tertiary">{CHAT_CARD_COPY.ask}</span>
        </h2>

        <form
          onSubmit={onSubmit}
          data-home-chat-box
          className={`${phone ? 'mt-4 px-4 pt-4' : 'mt-[22px] px-[18px] pt-[18px]'} rounded-[24px] bg-bg-surface pb-3.5 shadow-[0_0_0_1.5px_var(--home-line-strong)] transition-shadow focus-within:shadow-[0_0_0_2px_rgb(var(--color-brand))]`}
        >
          <ChappiAttachmentTray attachments={attach.attachments} pending={attach.pending} onRemove={attach.remove} />
          <label htmlFor="home-chat-box" className="sr-only">
            Message AI
          </label>
          <textarea
            id="home-chat-box"
            ref={fieldRef}
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            enterKeyHint="send"
            onPaste={(event) => {
              const pictures = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
              if (pictures.length === 0) return;
              event.preventDefault();
              void attach.addFiles(pictures);
            }}
            placeholder={CHAT_CARD_COPY.placeholder}
            disabled={sending}
            autoComplete="off"
            className="block min-h-12 w-full resize-none bg-transparent text-[17px] leading-6 text-content-primary outline-none focus:outline-none focus-visible:outline-none placeholder:text-content-tertiary disabled:opacity-60"
          />
          <div className="mt-2 flex items-center gap-2.5">
            <ChappiAttachMenu
              disabled={sending}
              onFiles={(files) => void attach.addFiles(files)}
              triggerClassName="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-full border border-stroke-control text-content-secondary transition-colors hover:text-content-primary disabled:opacity-40"
            />
            <AboutPicker options={options} value={aboutId} onChange={setPicked} disabled={sending} />
            {phone ? (
              <>
                {voiceDriver}
                {isRecording && hold.holding ? (
                  <span role="status" className="ml-auto truncate text-xs text-content-secondary">
                    {formatHoldElapsed(voice.elapsed)}{' '}
                    {hold.cancelArmed ? 'Let go to cancel' : '‹ Slide left to cancel'}
                  </span>
                ) : (
                  <span className="ml-auto" />
                )}
                {voice.supported ? (
                  <button
                    type="button"
                    {...hold.buttonProps}
                    data-recording={isRecording ? 'true' : undefined}
                    data-holding={hold.holding ? 'true' : undefined}
                    aria-label={isRecording ? 'Stop recording' : 'Talk to AI'}
                    disabled={isTranscribing || sending || (voice.state === 'requesting' && !hold.holding)}
                    className="motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full text-content-secondary transition-[color,background-color,transform] hover:bg-bg-hover hover:text-content-primary disabled:opacity-40 data-[recording=true]:text-status-error data-[holding=true]:scale-125 data-[holding=true]:bg-status-error data-[holding=true]:text-content-inverse"
                  >
                    {isTranscribing || voice.state === 'requesting' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : isRecording ? (
                      <span className="h-3 w-3 rounded-[3px] bg-current" aria-hidden="true" />
                    ) : (
                      <Mic className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </>
            ) : (
              <span className="ml-auto" />
            )}
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send to AI"
              className={`motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
                hasContent && !sending
                  ? 'bg-brand text-content-inverse'
                  : 'bg-bg-hover text-content-secondary'
              }`}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {phone && voice.error ? (
            <p role="status" className="mt-2 text-xs text-content-tertiary">
              {voice.error}
            </p>
          ) : null}
          {attach.error ? (
            <p role="alert" className="mt-2 text-xs text-status-error">
              {attach.error}
            </p>
          ) : null}
        </form>

        {phone ? (
          showTryCards(phoneSent) ? <TryCards disabled={sending} onPick={onTryCard} /> : null
        ) : suggestions.length > 0 ? (
          <ul className="mt-[18px] flex flex-wrap gap-2" aria-label="Suggestions">
            {suggestions.map((chip) => (
              <li key={chip.kind}>
                <SuggestionChip chip={chip} disabled={sending} onPick={() => void send(chip.text, chip.releaseId, 'suggestion')} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {phone ? null : <NextDropPanel row={spotlight} />}
    </section>
  );
}

const TRY_CARD_ICON = { plan: Sparkles, late: Clock, artist: UserPlus } as const;

/** The phone's three Try one cards, in one row of three (Linear's examples):
 *  shadcn outline Buttons (#1342), a small icon tile and the title, no second
 *  line. */
function TryCards({ disabled, onPick }: { disabled: boolean; onPick: (card: TryCard) => void }) {
  return (
    <div className="mt-5">
      <p className="text-[13px] leading-5 text-content-secondary">{TRY_CARDS_LABEL}</p>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {PHONE_TRY_CARDS.map((card) => {
          const Icon = TRY_CARD_ICON[card.kind];
          return (
            <li key={card.kind} className="min-w-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onPick(card)}
                disabled={disabled}
                className="motion-focus motion-press h-[76px] w-full flex-col items-start justify-between whitespace-normal rounded-xl border-stroke-control bg-bg-surface/85 px-2.5 py-2.5 text-left font-normal text-content-primary backdrop-blur-sm hover:bg-bg-surface hover:text-content-primary"
              >
                <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-brand/10 text-brand" aria-hidden="true">
                  <Icon className="!size-[15px]" />
                </span>
                <span className="text-[13px] font-semibold leading-[17px]">{card.title}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A suggestion: an outlined pill, no dot. */
function SuggestionChip({ chip, disabled, onPick }: { chip: ChatSuggestion; disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="motion-focus motion-press inline-flex h-[38px] items-center rounded-full px-4 text-[13px] text-content-primary shadow-[0_0_0_1px_var(--home-line-strong)] transition-colors hover:bg-bg-hover/60 disabled:opacity-50"
    >
      {chip.text}
    </button>
  );
}

/**
 * "About": Everything, then each rollout, nearest drop first. A disclosure,
 * not a role="menu": the rows are buttons reached with Tab, and the chosen
 * one carries aria-current and a tick (docs/notes accessibility pass, rule 4).
 * Escape or a click outside closes it and focus goes back to the button.
 */
function AboutPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: AboutOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const current = value ? options.find((option) => option.id === value) ?? null : null;
  const releases = useReleaseStore((state) => state.releases);
  const releaseById = useMemo(() => new Map(releases.map((release) => [release.id, release])), [releases]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && !rootRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    // Tabbing out of the list closes it.
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (target && !rootRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  const choose = (id: string | null) => {
    onChange(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const row =
    'motion-focus flex w-full min-w-0 items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left text-sm text-content-primary transition-colors hover:bg-bg-hover';

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`motion-focus inline-flex h-8 max-w-[15rem] items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-50 ${
          current
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-stroke-control text-content-primary hover:bg-bg-hover/60'
        }`}
      >
        {current ? (
          <Cover release={releaseById.get(current.id) ?? null} size={18} className="!rounded" />
        ) : null}
        <span className="truncate">{current ? current.title : `About: ${CHAT_CARD_COPY.everything}`}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label="What your message is about"
          className="absolute left-0 top-full z-50 mt-2 max-h-[22rem] w-80 overflow-y-auto rounded-[20px] border border-stroke-default bg-bg-surface p-1.5 shadow-[0_24px_48px_-12px_rgba(0,0,0,.45)]"
        >
          <button type="button" onClick={() => choose(null)} aria-current={value === null ? 'true' : undefined} className={`${row} ${value === null ? 'bg-bg-sidebar-active font-semibold' : ''}`}>
            <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bg-hover text-content-secondary">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{CHAT_CARD_COPY.everything}</span>
              <span className="block truncate text-xs font-normal text-content-secondary">{CHAT_CARD_COPY.everythingDetail}</span>
            </span>
            {value === null ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
          </button>
          {options.length > 0 ? <div className="mx-1.5 my-1 h-px bg-stroke-subtle" aria-hidden="true" /> : null}
          {options.map((option) => {
            const on = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option.id)}
                aria-current={on ? 'true' : undefined}
                className={`${row} ${on ? 'bg-bg-sidebar-active font-semibold' : ''}`}
              >
                <Cover release={releaseById.get(option.id) ?? null} size={28} className="!rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.title}</span>
                  <span className="block truncate text-xs font-normal text-content-secondary">{option.detail}</span>
                </span>
                {on ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** The Next drop, to the right of the chat, past one thin line. No late count
 *  here: a late task says so on its own row (#1305). */
function NextDropPanel({ row }: { row: ListRow | null }) {
  const release = row?.next ?? null;
  const panel = `flex min-w-0 flex-col border-l ${HOME_RULE} pl-8 xl:pl-10`;
  const eyebrow = 'text-[13px] font-medium leading-5 text-content-secondary';

  if (!row || !release || row.daysToGo === null) {
    return (
      <div className={panel}>
        <p className={eyebrow}>Next drop</p>
        <p className="mt-3 font-display text-xl leading-6 text-content-primary">{CHAT_CARD_COPY.noDropTitle}</p>
        <p className="mt-1.5 text-[13px] leading-5 text-content-secondary">{CHAT_CARD_COPY.noDropLine}</p>
      </div>
    );
  }

  const days = row.daysToGo;
  const open = row.total - row.done;
  return (
    <Link
      href={releaseHref(release.id)}
      onClick={() => captureAnalyticsEvent({ name: 'artists_list_action', properties: { artist_id: row.artist.id, action: 'spotlight' } })}
      className={`${panel} motion-focus group`}
    >
      <p className={eyebrow}>Next drop</p>
      <span className="mt-3 flex min-w-0 items-center gap-3">
        <Cover release={release} size={64} className="!rounded-[14px]" />
        <span className="min-w-0">
          <span className="block truncate font-display text-xl leading-6 text-content-primary">{displayReleaseTitle(release.title)}</span>
          <span className="block truncate text-[13px] leading-5 text-content-secondary">
            {row.artist.name} · {typeLabel(release)}
          </span>
        </span>
      </span>
      <span className="mt-4 flex items-center gap-3">
        <span className="font-display text-[56px] leading-[52px] tabular-nums text-content-primary">{days === 0 ? 'Today' : days}</span>
        <span className="text-[13px] leading-[18px] text-content-secondary">
          {days === 0 ? 'it drops' : days === 1 ? 'day to go' : 'days to go'}
          <br />
          {shortDay(release.releaseDate)}
        </span>
      </span>
      {row.total > 0 ? (
        <>
          <span className="mt-3.5 block h-1.5 overflow-hidden rounded-full bg-bg-hover">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${percent(row)}%` }} />
          </span>
          <span className="mt-2 block text-[13px] leading-5 text-content-secondary">
            {row.done} of {row.total} done
            {open === 0 ? ' · all done' : null}
          </span>
        </>
      ) : null}
      <span className="mt-auto inline-flex items-center gap-1.5 pt-3.5 text-[13px] font-semibold text-content-primary">
        Open rollout
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * The block's loading shape, for HomeDesktopSkeleton: the same columns and
 * line boxes with no card, so nothing moves when Home lands.
 */
export function HomeChatCardSkeleton() {
  const bar = 'block animate-pulse rounded-full bg-bg-hover';
  return (
    <div
      aria-hidden="true"
      data-skeleton="home-chat"
      className="grid grid-cols-[minmax(0,1fr)_16rem] gap-8 pb-1 pt-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-14"
    >
      <div className="flex min-w-0 flex-col">
        {/* Line boxes of the live block: the day line, the two greeting lines,
            the box, and the suggestions, which usually wrap to two rows. */}
        <span className="flex h-5 items-center">
          <span className={`h-3.5 w-32 ${bar}`} />
        </span>
        <span className="mt-2.5 flex h-[84px] flex-col justify-around xl:h-[88px]">
          <span className={`h-8 w-72 ${bar}`} />
          <span className={`h-8 w-56 ${bar}`} />
        </span>
        <span className="mt-[22px] block h-[128px] rounded-[24px] shadow-[0_0_0_1.5px_var(--home-line-strong)]" />
        <span className="mt-[18px] flex flex-col gap-2">
          <span className="flex gap-2">
            {['w-48', 'w-44', 'w-52'].map((width) => (
              <span key={width} className={`h-[38px] ${width} ${bar}`} />
            ))}
          </span>
          <span className={`h-[38px] w-52 ${bar}`} />
        </span>
      </div>
      <div className={`flex min-w-0 flex-col border-l ${HOME_RULE} pl-8 xl:pl-10`}>
        <span className="flex h-5 items-center">
          <span className={`h-3 w-16 ${bar}`} />
        </span>
        <span className="mt-3 flex items-center gap-3">
          <span className="h-16 w-16 shrink-0 animate-pulse rounded-[14px] bg-bg-hover" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className={`h-4 w-28 ${bar}`} />
            <span className={`h-3 w-20 ${bar}`} />
          </span>
        </span>
        <span className="mt-4 block h-[52px] w-32 animate-pulse rounded-2xl bg-bg-hover" />
        <span className={`mt-3.5 h-1.5 w-full ${bar}`} />
        <span className="mt-2 flex h-5 items-center">
          <span className={`h-3 w-24 ${bar}`} />
        </span>
      </div>
    </div>
  );
}

/**
 * The phone block's loading shape (#1339), for the phone's Home while the
 * roster loads: the day line, the two greeting lines, the box and the three
 * Try one cards, with the same heights as the live block.
 */
export function HomeChatCardPhoneSkeleton() {
  const bar = 'block animate-pulse rounded-full bg-bg-hover';
  return (
    <div aria-hidden="true" data-skeleton="home-chat-phone" className="pb-1 pt-2">
      <span className="flex h-5 items-center">
        <span className={`h-3.5 w-28 ${bar}`} />
      </span>
      <span className="mt-1.5 flex h-[68px] flex-col justify-around">
        <span className={`h-7 w-56 ${bar}`} />
        <span className={`h-7 w-48 ${bar}`} />
      </span>
      <span className="mt-4 block h-[122px] rounded-[24px] shadow-[0_0_0_1.5px_var(--home-line-strong)]" />
      <span className="mt-5 flex h-5 items-center">
        <span className={`h-3 w-14 ${bar}`} />
      </span>
      <span className="mt-2 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((key) => (
          <span key={key} className="block h-[76px] animate-pulse rounded-xl bg-bg-hover" />
        ))}
      </span>
    </div>
  );
}
