'use client';

// The first block of Home on a computer (#1295, part of #1175; founder
// approved docs/mocks/home-chat-desktop): one dark card, a box to ask AI on the
// left and the Next drop on the right. It replaces the Next drop banner, so
// Home still leads with one big card and the countdown is still on it.
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

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUp, Check, ChevronDown, Loader2, Sparkles } from '@/components/icons';
import { ChappiAttachMenu } from '@/components/chappi/ChappiAttachMenu';
import { ChappiAttachmentTray } from '@/components/chappi/ChappiAttachments';
import { useAttachments } from '@/components/chappi/useAttachments';
import { showMain } from '@/components/shell/swipe/main-thread';
import { Cover, percent, shortDay, typeLabel, type ListRow } from '@/components/artists/ArtistListParts';
import { assistantHref } from '@/lib/assistant-chats';
import { useAuthStore } from '@/lib/auth-store';
import { releaseHref } from '@/lib/artist-page';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { markArrivingFromHome, prefersReducedMotion } from '@/lib/home-chat-glide';
import {
  CHAT_CARD_COPY,
  aboutOptions,
  buildChatSuggestions,
  chatCardGreeting,
  defaultAboutId,
  type AboutOption,
  type ChatSuggestion,
  type SuggestionKind,
} from '@/lib/home-desktop/chat-card';
import { URGANS_HREF } from '@/lib/shell-nav';
import { useChappiStore } from '@/stores/useChappiStore';
import { showRolloutSession } from '@/stores/useChappiHistoryStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { displayReleaseTitle } from '@/types/releases';

const INK = '#1d2a21';
// A fine woven texture on the ink, as the mock: two sets of hairlines.
const WEAVE =
  'repeating-linear-gradient(0deg, rgba(245,240,230,.035) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(245,240,230,.03) 0 1px, transparent 1px 4px)';
const GLOW = 'radial-gradient(closest-side, rgba(127,217,154,.28), rgba(127,217,154,0))';

const DOT: Record<SuggestionKind, string> = {
  late: 'bg-[#ff9d8f]',
  today: 'bg-[#7fd99a]',
  plan: 'bg-[#f0c66b]',
  write: 'bg-[#a9c4ff]',
};

export function HomeChatCard({ rows, spotlight, today }: { rows: ListRow[]; spotlight: ListRow | null; today: string }) {
  const router = useRouter();
  const name = useAuthStore((state) => state.user?.name ?? null);
  const releases = useReleaseStore((state) => state.releases);
  const attach = useAttachments();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

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
    router.push(assistantHref(releaseId));
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
      className="relative grid grid-cols-[minmax(0,1fr)_17rem] gap-6 rounded-[24px] p-7 text-[#f5f0e6] shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_24px_48px_-16px_rgba(29,42,33,.45),0_4px_12px_rgba(29,42,33,.18)] xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-7 xl:p-8"
      style={{ backgroundColor: INK, backgroundImage: WEAVE }}
    >
      {/* A soft green glow behind the greeting. Decoration, not a placeholder. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]">
        <div className="absolute -left-36 -top-64 h-[520px] w-[520px] rounded-full" style={{ backgroundImage: GLOW }} />
      </div>

      <div className="relative flex min-w-0 flex-col">
        <p className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.02em] text-[#7fd99a]">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-[#7fd99a] shadow-[0_0_0_4px_rgba(127,217,154,.18),0_0_18px_rgba(127,217,154,.7)]"
          />
          {hello.line}
        </p>
        <h2 className="mt-2.5 font-display text-[34px] font-normal leading-[42px] tracking-[-0.01em] xl:text-[38px] xl:leading-[44px]">
          {hello.greeting}
          <br />
          <span className="text-[#f5f0e6]/60">{CHAT_CARD_COPY.ask}</span>
        </h2>

        <form
          onSubmit={onSubmit}
          className="group mt-5 rounded-[18px] bg-[#fbf7ef] px-4 pb-3 pt-4 text-[#1a1611] shadow-[0_0_0_1px_rgba(245,240,230,.5),0_18px_36px_-12px_rgba(0,0,0,.55),inset_0_2px_0_rgba(255,255,255,.9)] transition-shadow focus-within:shadow-[0_0_0_2px_#7fd99a,0_0_0_7px_rgba(127,217,154,.22),0_18px_36px_-12px_rgba(0,0,0,.55)]"
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
            onPaste={(event) => {
              const pictures = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
              if (pictures.length === 0) return;
              event.preventDefault();
              void attach.addFiles(pictures);
            }}
            placeholder={CHAT_CARD_COPY.placeholder}
            disabled={sending}
            autoComplete="off"
            className="block min-h-12 w-full resize-none bg-transparent text-[17px] leading-6 text-[#1a1611] outline-none focus:outline-none focus-visible:outline-none placeholder:text-[#6a665f] disabled:opacity-60"
          />
          <div className="mt-2 flex items-center gap-2.5">
            <ChappiAttachMenu
              disabled={sending}
              onFiles={(files) => void attach.addFiles(files)}
              triggerClassName="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[rgba(26,22,17,.18)] bg-white text-[#4b4740] transition-colors hover:text-[#1a1611] disabled:opacity-40"
            />
            <AboutPicker options={options} value={aboutId} onChange={setPicked} disabled={sending} />
            <span className="ml-auto text-xs text-[#6a665f]" aria-hidden="true">
              {CHAT_CARD_COPY.enterHint}
            </span>
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send to AI"
              className={`motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
                hasContent && !sending
                  ? 'bg-[#14643a] text-white shadow-[0_6px_14px_-4px_rgba(20,100,58,.7)]'
                  : 'bg-[#d9d3c5] text-[#6a665f]'
              }`}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {attach.error ? (
            <p role="alert" className="mt-2 text-xs text-[#961a1a]">
              {attach.error}
            </p>
          ) : null}
        </form>

        {suggestions.length > 0 ? (
          <ul className="mt-[18px] flex flex-wrap gap-2" aria-label="Suggestions">
            {suggestions.map((chip) => (
              <li key={chip.kind}>
                <SuggestionChip chip={chip} disabled={sending} onPick={() => void send(chip.text, chip.releaseId, 'suggestion')} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <NextDropPanel row={spotlight} />
    </section>
  );
}

function SuggestionChip({ chip, disabled, onPick }: { chip: ChatSuggestion; disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="motion-focus motion-press inline-flex h-9 items-center gap-2 rounded-full border border-[#f5f0e6]/[.18] bg-[#f5f0e6]/[.07] px-3.5 text-[13px] text-[#f5f0e6] backdrop-blur-[4px] transition-colors hover:bg-[#f5f0e6]/[.13] disabled:opacity-50"
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[chip.kind]}`} />
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
    'motion-focus flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-content-primary transition-colors hover:bg-bg-hover';

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
            ? 'border-[#14643a] bg-[#e6eee6] text-[#14643a]'
            : 'border-[rgba(26,22,17,.18)] bg-white text-[#1a1611] hover:bg-[#f5f0e6]'
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
          className="absolute left-0 top-full z-50 mt-2 max-h-[22rem] w-80 overflow-y-auto rounded-[14px] border border-stroke-default bg-bg-surface p-1.5 shadow-[0_24px_48px_-12px_rgba(0,0,0,.45)]"
        >
          <button type="button" onClick={() => choose(null)} aria-current={value === null ? 'true' : undefined} className={`${row} ${value === null ? 'bg-bg-sidebar-active font-semibold' : ''}`}>
            <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#1d2a21] text-[#7fd99a]">
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
                <Cover release={releaseById.get(option.id) ?? null} size={28} />
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

/** The Next drop, on the right of the card: what the old banner showed, smaller. */
function NextDropPanel({ row }: { row: ListRow | null }) {
  const release = row?.next ?? null;
  const panel =
    'relative flex flex-col rounded-[18px] border border-[#f5f0e6]/[.14] bg-[#f5f0e6]/[.07] p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]';
  const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.1em] text-[#f5f0e6]/70';

  if (!row || !release || row.daysToGo === null) {
    return (
      <div className={panel}>
        <p className={eyebrow}>Next drop</p>
        <p className="mt-3 font-display text-xl leading-6">{CHAT_CARD_COPY.noDropTitle}</p>
        <p className="mt-1.5 text-[13px] leading-5 text-[#f5f0e6]/70">{CHAT_CARD_COPY.noDropLine}</p>
      </div>
    );
  }

  const days = row.daysToGo;
  const open = row.total - row.done;
  return (
    <Link
      href={releaseHref(release.id)}
      onClick={() => captureAnalyticsEvent({ name: 'artists_list_action', properties: { artist_id: row.artist.id, action: 'spotlight' } })}
      className={`${panel} motion-focus group transition-colors hover:bg-[#f5f0e6]/[.1]`}
    >
      <p className={eyebrow}>Next drop</p>
      <span className="mt-3 flex min-w-0 items-center gap-3">
        <Cover
          release={release}
          size={64}
          onInk
          className="-rotate-3 !rounded-[10px] shadow-[0_10px_20px_-6px_rgba(0,0,0,.6),inset_0_0_0_1px_rgba(255,255,255,.12)]"
        />
        <span className="min-w-0">
          <span className="block truncate font-display text-xl leading-6">{displayReleaseTitle(release.title)}</span>
          <span className="block truncate text-[13px] text-[#f5f0e6]/70">
            {row.artist.name} · {typeLabel(release)}
          </span>
        </span>
      </span>
      <span className="mt-4 flex items-center gap-3">
        <span className="font-display text-[56px] leading-[52px] tabular-nums text-[#7fd99a]">{days === 0 ? 'Today' : days}</span>
        <span className="text-[13px] leading-[18px] text-[#f5f0e6]/70">
          {days === 0 ? 'it drops' : days === 1 ? 'day to go' : 'days to go'}
          <br />
          {shortDay(release.releaseDate)}
        </span>
      </span>
      {row.total > 0 ? (
        <>
          <span className="mt-3.5 block h-1 overflow-hidden rounded-full bg-[#f5f0e6]/[.16]">
            <span className="block h-full rounded-full bg-[#7fd99a]" style={{ width: `${percent(row)}%` }} />
          </span>
          <span className="mt-2 block text-[13px] text-[#f5f0e6]/70">
            {row.done} of {row.total} done
            {row.late > 0 ? (
              <>
                {' · '}
                <span className="font-semibold text-[#ffb4a8]">{row.late} late</span>
              </>
            ) : open === 0 ? (
              ' · all done'
            ) : null}
          </span>
        </>
      ) : null}
      <span className="mt-auto inline-flex items-center gap-1.5 pt-3.5 text-[13px] font-semibold text-[#f5f0e6]">
        Open rollout
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * The card's loading shape, for HomeDesktopSkeleton: the same ink card, padding
 * and columns, with the greeting, the box, the chips and the panel as quiet
 * blocks, so nothing moves when Home lands.
 */
export function HomeChatCardSkeleton() {
  const bar = 'block animate-pulse rounded bg-[#f5f0e6]/[.12]';
  return (
    <div
      aria-hidden="true"
      data-skeleton="home-chat"
      className="grid grid-cols-[minmax(0,1fr)_17rem] gap-6 rounded-[24px] p-7 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-7 xl:p-8"
      style={{ backgroundColor: INK }}
    >
      <div className="flex min-w-0 flex-col">
        {/* Line boxes of the live card: the day line, the two greeting lines,
            the box, and the suggestions, which usually wrap to two rows. */}
        <span className="flex h-5 items-center">
          <span className={`h-3.5 w-32 ${bar}`} />
        </span>
        <span className="mt-2.5 flex h-[84px] flex-col justify-around xl:h-[88px]">
          <span className={`h-8 w-72 ${bar}`} />
          <span className={`h-8 w-56 ${bar}`} />
        </span>
        <span className="mt-5 block h-[124px] rounded-[18px] bg-[#fbf7ef]/90" />
        <span className="mt-[18px] flex flex-col gap-2">
          <span className="flex gap-2">
            {['w-48', 'w-44', 'w-52'].map((width) => (
              <span key={width} className={`h-9 rounded-full ${width} ${bar}`} />
            ))}
          </span>
          <span className={`h-9 w-52 rounded-full ${bar}`} />
        </span>
      </div>
      <span className="block rounded-[18px] border border-[#f5f0e6]/[.14] bg-[#f5f0e6]/[.07]" />
    </div>
  );
}
