'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  GLIDE_MS,
  LEAVING_CLASS,
  composerBottomGap,
  glideOffset,
  markArrivingFromHome,
  prefersReducedMotion,
} from '@/lib/home-chat-glide';
import { COMPOSER_FOCUS_EVENT } from '@/lib/composer-focus';
import { ArrowUp, Loader2, Mic } from '@/components/icons';
import { SEND_ARROW_CLASS, SEND_BUTTON_DOCK_CLASS } from '@/components/chappi/send-button';
import { ChappiAttachMenu } from '@/components/chappi/ChappiAttachMenu';
import { ChappiAttachmentTray } from '@/components/chappi/ChappiAttachments';
import { useAttachments } from '@/components/chappi/useAttachments';
import { useLazyVoiceInput } from '@/components/chappi/useLazyVoiceInput';
import { isChappiEnabled, isUrgansRealtimeEnabled, isUrgansVoiceEnabled } from '@/lib/chappi/config';
import { mergeTranscript } from '@/lib/urgans-voice';
import { useChappiStore } from '@/stores/useChappiStore';
import { useReleaseStore } from '@/stores/useReleaseStore';

const VOICE_ENABLED = isUrgansVoiceEnabled();
// Voice loads on demand (URG-314 batch 6): dictation through useLazyVoiceInput,
// the Talk button and the call store only when Talk is switched on. Both are
// off since the Oct 16 feature cuts, so none of that code is fetched.
const TalkButton = dynamic(() =>
  import('@/components/chappi/voice/TalkButton').then((m) => m.TalkButton)
);
const TALK_ENABLED = isChappiEnabled() && isUrgansRealtimeEnabled();

// True only in the browser after hydration, false on the server and in the
// hydration render, so the portal never makes the two disagree.
const subscribeNever = () => () => undefined;
const useInBrowser = () =>
  useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

/**
 * The UrgAns box on a phone's Home (2026-10-07, founder call): pinned to the
 * bottom of the screen just above the bottom bar, with everything else on Home
 * scrolling above it. It is a real box: type here, attach a photo or file with
 * +, or talk with the mic, all without leaving Home. Send slides the box down
 * into the full chat (lib/home-chat-glide.ts), where the message is sent.
 *
 * Phone only. On a desktop Home has no chat (2026-10-27): UrgAns is its own
 * page, so this is never mounted there.
 *
 * Three things about it are not obvious:
 *  - It is portalled to <body>. .app-layout carries a transform, which makes it
 *    the anchor of any fixed element inside it, so a fixed box inside <main>
 *    would sit at the end of the page instead of the bottom of the screen.
 *  - The text lives in useChappiStore.input, the same text the chat's own box
 *    shows, so "Ask UrgAns" in the search bar fills this box with no special
 *    case and a half-typed message carries into the chat.
 *  - It publishes its height as --home-dock-height and data-home-dock on
 *    <html>, so Home's padding and the toasts clear it (globals.css).
 */
export function HomeAskBar({
  variant = 'home',
  onSend,
  replying = false,
  placeholder = 'Message UrgAns...',
}: {
  /** 'swipe' (URG-380): the swipe navigation's one box under Home and Artists,
   *  on phones and desktops, centred to the page column. 'page' (Oct 24,
   *  2026, founder call): the same box on every other phone screen (a
   *  rollout, timeline, settings), phone only; desktops keep FloatingUrgAns. */
  variant?: 'home' | 'swipe' | 'page';
  /** Replaces opening the chat page: the swipe navigation hands the message to
   *  Main and glides the pager to UrgAns instead. */
  onSend?: () => void;
  /** The box's hint; on a record page it asks what happened (next record v2). */
  placeholder?: string;
  /** The conversation it feeds is writing a reply (the swipe navigation's
   *  UrgAns tab): the box holds still, field and send disabled, a spinner in
   *  send. Same shape and size either way. */
  replying?: boolean;
} = {}) {
  const router = useRouter();
  const releases = useReleaseStore((state) => state.releases);
  const scopedReleaseId = useChappiStore((state) => state.scopedReleaseId);
  const input = useChappiStore((state) => state.input);
  const setInput = useChappiStore((state) => state.setInput);
  const setSendInputOnOpen = useChappiStore((state) => state.setSendInputOnOpen);
  const setPendingAttachments = useChappiStore((state) => state.setPendingAttachments);
  const attach = useAttachments();
  const inBrowser = useInBrowser();
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // How far the box is sliding, while it slides to the chat (null at rest).
  const [glide, setGlide] = useState<number | null>(null);

  // Never leave Home faded: on leaving the page, or if the chat never opens.
  useEffect(() => {
    if (glide === null) return;
    const root = document.documentElement;
    const giveUp = window.setTimeout(() => {
      root.classList.remove(LEAVING_CLASS);
      setGlide(null);
    }, 6000);
    return () => {
      window.clearTimeout(giveUp);
      root.classList.remove(LEAVING_CLASS);
    };
  }, [glide]);

  // Tell the page how tall the box is, so the last card and the toasts clear it.
  useEffect(() => {
    const dock = dockRef.current;
    const root = document.documentElement;
    if (!dock) return;
    const publish = () => {
      root.style.setProperty('--home-dock-height', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    };
    root.dataset.homeDock = '';
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      delete root.dataset.homeDock;
      root.style.removeProperty('--home-dock-height');
    };
    // Again once the box is in the page: it is not in the first render.
  }, [inBrowser]);

  // "Ask UrgAns" in the search bar puts the question here and asks for focus.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener(COMPOSER_FOCUS_EVENT, focus);
    return () => window.removeEventListener(COMPOSER_FOCUS_EVENT, focus);
  }, []);

  // Fetch the chat page ahead of time so the glide never waits on a download.
  useEffect(() => {
    router.prefetch('/dashboard/urgans');
  }, [router]);

  const scopedRelease = scopedReleaseId
    ? releases.find((release) => release.id === scopedReleaseId) ?? null
    : null;
  const [voice, voiceDriver] = useLazyVoiceInput({
    enabled: VOICE_ENABLED,
    onTranscript: (spoken) => setInput(mergeTranscript(useChappiStore.getState().input, spoken)),
    getHints: () =>
      scopedRelease
        ? { releaseTitle: scopedRelease.title, artistName: scopedRelease.artistName }
        : {},
  });
  const isRecording = voice.state === 'recording';
  const isTranscribing = voice.state === 'transcribing';
  const busy = isRecording || isTranscribing;
  const canSend =
    (input.trim().length > 0 || attach.attachments.length > 0) && attach.pending === 0 && !busy && !replying;

  // Slide the box down to where the chat's message box sits and fade the rest
  // of Home, while the chat page loads underneath. Nothing waits on the slide.
  const openChat = (box: HTMLElement) => {
    if (!prefersReducedMotion()) {
      const rect = box.getBoundingClientRect();
      setGlide(
        glideOffset({
          boxBottom: rect.bottom,
          viewportHeight: window.innerHeight,
          bottomGap: composerBottomGap(window.innerWidth),
          keyboardOpen: document.documentElement.dataset.keyboardOpen === 'true',
        })
      );
      document.documentElement.classList.add(LEAVING_CLASS);
      markArrivingFromHome();
    }
    router.push('/dashboard/urgans');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    setInput(input.trim());
    setPendingAttachments(attach.attachments);
    if (!onSend) setSendInputOnOpen(true);
    attach.clear();
    if (onSend) {
      // The swipe navigation: the conversation is already mounted beside Home.
      inputRef.current?.blur();
      onSend();
      return;
    }
    // Always the full chat page: it mounts the conversation that picks the
    // message up and sends it. No keyboard hand-off: the chat's box is busy
    // while the reply comes, so a kept keyboard would only lose what is typed.
    openChat(event.currentTarget);
  };

  if (!CHAPPI_ENABLED || !inBrowser) return null;

  return createPortal(
    <div
      ref={dockRef}
      className={
        variant === 'swipe'
          ? 'home-dock swipe-dock fixed inset-x-4 z-40 mx-auto max-w-[40rem]'
          : variant === 'page'
            ? 'home-dock swipe-dock page-dock fixed inset-x-4 z-40 mx-auto max-w-[40rem] lg:hidden'
            : 'home-dock fixed inset-x-3 z-40 lg:hidden'
      }
    >
      {voiceDriver}
      <form
        onSubmit={handleSubmit}
        style={
          glide === null
            ? undefined
            : { transform: `translateY(${glide}px)`, transition: `transform ${GLIDE_MS}ms var(--motion-out)` }
        }
      >
        <ChappiAttachmentTray attachments={attach.attachments} pending={attach.pending} onRemove={attach.remove} />
        <div className="flex items-center gap-1 rounded-full border border-stroke-control bg-bg-surface/95 p-1.5 shadow-lg backdrop-blur-2xl transition-colors focus-within:border-brand/70">
          <ChappiAttachMenu disabled={busy || replying} onFiles={(files) => void attach.addFiles(files)} />
          {isRecording ? (
            <div role="status" className="flex min-w-0 flex-1 items-center gap-2 px-2 text-[16px] text-content-secondary">
              <span className="h-2 w-2 shrink-0 rounded-full bg-status-error motion-safe:animate-pulse" aria-hidden="true" />
              Listening...
            </div>
          ) : (
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => {
                const pictures = Array.from(event.clipboardData?.files ?? []).filter((file) =>
                  file.type.startsWith('image/')
                );
                if (pictures.length === 0) return;
                event.preventDefault();
                void attach.addFiles(pictures);
              }}
              placeholder={isTranscribing ? 'Turning your voice into text...' : placeholder}
              aria-label="Message UrgAns"
              enterKeyHint="send"
              disabled={isTranscribing || replying}
              // 16px: anything smaller makes iOS zoom the page on focus.
              className="min-w-0 flex-1 bg-transparent px-2 text-[16px] text-content-primary placeholder:text-content-tertiary focus:outline-none disabled:opacity-60"
            />
          )}
          {voice.supported ? (
            <button
              type="button"
              onClick={voice.toggle}
              data-recording={isRecording ? 'true' : undefined}
              aria-label={isRecording ? 'Stop recording' : TALK_ENABLED ? 'Dictate' : 'Talk to UrgAns'}
              title={TALK_ENABLED && !isRecording ? 'Dictate' : undefined}
              disabled={isTranscribing || voice.state === 'requesting'}
              className="motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-elevated hover:text-content-primary disabled:opacity-40 data-[recording=true]:text-status-error"
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
          {TALK_ENABLED ? (
            <TalkButton
              size="lg"
              disabled={isRecording || isTranscribing}
              onClick={() =>
                void import('@/stores/useVoiceCallStore').then((m) => m.useVoiceCallStore.getState().openCall(null))
              }
            />
          ) : null}
          <button
            type="submit"
            aria-label="Send to UrgAns"
            disabled={!canSend}
            className={SEND_BUTTON_DOCK_CLASS}
          >
            {replying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUp className={SEND_ARROW_CLASS} aria-hidden="true" />
            )}
          </button>
        </div>
        {voice.error ? (
          <p role="status" className="mt-1.5 rounded-lg bg-bg-surface/95 px-3 py-1 text-xs text-content-tertiary">
            {voice.error}
          </p>
        ) : null}
        {attach.error ? (
          <p role="alert" className="mt-1.5 rounded-lg bg-bg-surface/95 px-3 py-1 text-xs text-status-error">
            {attach.error}
          </p>
        ) : null}
      </form>
    </div>,
    document.body
  );
}
