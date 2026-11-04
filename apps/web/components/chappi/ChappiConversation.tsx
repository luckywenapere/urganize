'use client';

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardList,
  Copy,
  CornerDownLeft,
  Disc3,
  Layers,
  Loader2,
  Mic,
  NotebookPen,
  RotateCcw,
  Rocket,
  Send,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  type LucideIcon,
} from '@/components/icons';
import { SEND_ARROW_CLASS, SEND_BUTTON_CLASS } from './send-button';
import { TeamBriefNudge } from './TeamBriefNudge';
import { BriefAttribution } from './BriefAttribution';
import { ReplyText } from './ReplyText';
import { stripModelMarkup } from '@/lib/model-markup';
import {
  isSpeechSupported,
  speakChunks,
  speechChunksForReply,
} from '@/lib/chappi/speech';
import { describeTranscriptAnnouncement } from '@/lib/chappi/transcript-announcement';
import { createTextBatcher, isStreamContentType, URGANS_STREAM_HEADER } from '@/lib/chappi/stream-protocol';
import { CONNECTION_DROPPED_NOTE, readStreamedTurn } from '@/lib/chappi/stream-client';
import { RECORD_CAPTURE_PLACEHOLDER, recordIdFromPath } from '@/lib/chappi/record-scope';
import { startUrgansTelemetry } from '@/lib/chappi/urgans-telemetry';
import { TURN_DROPPED_NOTE, failedTurnOutcome, isDeviceOnline } from '@/lib/chappi/turn-failure';
import { ChappiConfirmationCard } from '@/components/chappi/ChappiConfirmationCard';
import { ChappiCoverArtUploadCard } from '@/components/chappi/ChappiCoverArtUploadCard';
import { ChappiRecapCard } from '@/components/chappi/ChappiRecapCard';
import { ChappiProjectOfferCard } from '@/components/chappi/ChappiProjectOfferCard';
import { projectOfferDoneLine, type ProjectOffer, type ProjectOfferChoice } from '@/lib/project-offer';
import { addProjectTask } from '@/lib/project-tasks-client';
import { ChappiIdeasCard } from '@/components/chappi/ChappiIdeasCard';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import type { ReleaseCoverArt } from '@/types/cover-art';
import { ChappiScopePicker } from '@/components/chappi/ChappiScopePicker';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useChappiStore } from '@/stores/useChappiStore';
import {
  appendToChat,
  selectChatSaveNotice,
  useChappiHistoryStore,
} from '@/stores/useChappiHistoryStore';
import {
  CHAPPI_HISTORY_LIMIT,
  isChappiHistoryEnabled,
  newChatId,
} from '@/lib/chappi/conversation-history';
import { useTaskStore } from '@/stores/useTaskStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { useShareStore } from '@/stores/useShareStore';
import { deferFirstShareOffer } from '@/components/share/withFirstShareOffer';
import { actionsForLeftChat, firstShareOffersIn } from '@/lib/chappi/left-chat-actions';
import { mayAutoFocusComposer, readAutoFocusContext } from '@/lib/composer-focus';
import { TASKS_CHANGED_EVENT, useTaskUI } from '@/components/tasks/TaskUIProvider';
import { matchTasksByTitle, parseTaskStatusCommand, type TaskStatusCommand } from '@/lib/chappi/task-status-command';
import { getTaskStatusLabel } from '@/lib/tasks';
import type { Task } from '@/types/tasks';
import { useLazyVoiceInput } from '@/components/chappi/useLazyVoiceInput';
import { useHoldToTalk } from '@/components/chappi/useHoldToTalk';
import { holdToTalkPlaceholder } from '@/lib/hold-to-talk';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { useAttachments } from '@/components/chappi/useAttachments';
import { ChappiAttachMenu } from '@/components/chappi/ChappiAttachMenu';
import { ChappiAttachmentTray, ChappiMessageAttachments } from '@/components/chappi/ChappiAttachments';
import { isChappiEnabled, isUrgansRealtimeEnabled, isUrgansVoiceEnabled } from '@/lib/chappi/config';
import {
  attachmentOnlyContent,
  isAttachmentOnlyContent,
  selectAttachmentsToSend,
  stripAttachmentPayloads,
} from '@/lib/urgans-attachments';
import { mergeTranscript } from '@/lib/urgans-voice';
import { describeStatusFacts, type StatusFacts } from '@/lib/release-status';
import { supabase } from '@/lib/supabase/client';
import { scrollIntoColumn } from '@/lib/scroll-in-column';
import { isAwayFromLatest } from '@/lib/chat-scroll-position';
import { CHAPPI_CHIPS, buildHelpReply, resolveIntent } from '@/lib/chappi/intent-router';
import type {
  ChappiAttachment,
  ChappiChip,
  ChappiClientAction,
  ChappiIntent,
  ChappiMessage,
  ChappiPendingConfirmation,
  ChappiReply,
  ChappiResponse,
} from '@/lib/chappi/types';

type ChappiConversationProps = {
  /** Opens the CreateReleaseModal owned by the mounting surface. */
  onNewRelease: () => void;
  /**
   * Layout variant.
   * - 'page' (default): the full /dashboard/urgans surface — vertically
   *   centered empty state, header row with New conversation.
   * - 'panel': the floating ChappiDock — compact bottom-anchored empty state
   *   and NO internal header (the dock's own header owns title/reset/expand/
   *   close), sized for a ~380px column.
   */
  variant?: 'page' | 'panel';
  /**
   * The empty state's question is the page's h1 on the full chat page. On
   * desktop Home the greeting is already the h1, so Home passes 'h2'.
   */
  headingLevel?: 'h1' | 'h2';
  /**
   * Bump to put the cursor in the box (desktop Home's "+ New session" and the
   * search bar's "Ask UrgAns"). 0 or absent asks for nothing.
   */
  focusRequest?: number;
  /**
   * The swipe navigation's UrgAns tab (URG-380). Optional; every other surface
   * leaves these out and is unchanged.
   *  - `trailing` + `trailingAt`: one extra turn drawn in the transcript after
   *    the first `trailingAt` messages (the Home card carried into Main, the
   *    "Needs you" notices). Its presence counts as a conversation.
   *  - `emptyHero`: the empty state as a serif question, a line, and wrapped
   *    prompts that send themselves.
   *  - `placeholder`: the composer's placeholder.
   */
  trailing?: ReactNode;
  trailingAt?: number;
  emptyHero?: { title: string; subtitle: string; prompts: string[] };
  placeholder?: string;
  /**
   * The swipe navigation draws one shared "Message UrgAns…" box at shell level
   * for all three tabs (URG-380), so the UrgAns tab's conversation draws none
   * of its own: the box hands its text over with `sendInputOnOpen`, and this
   * conversation publishes `replyInFlight` for the box's busy state.
   */
  externalComposer?: boolean;
  /**
   * Send a message the shell's box handed over (sendInputOnOpen) even as a
   * panel. Only the project page's phone sheet sets it (2026-11-04, #1074):
   * its box hands the message to the sheet instead of the AI tab.
   */
  takeHandedInput?: boolean;
};

// Icons live here, not in the client-safe intent-router lib (icons are React
// nodes). Keyed by chip id (not intent) so the three plan_release chips can
// each get their own distinct glyph instead of sharing one. Sparkles is the
// fallback for any chip id without an entry.
const DEFAULT_CHIP_ICON: LucideIcon = Sparkles;
const CHIP_ICONS: Record<string, LucideIcon> = {
  'what-can-you-do': Sparkles,
  'todays-focus': Rocket,
  'new-release': Disc3,
  'plan-release': Layers,
  'status-update': Send,
  'add-task': ClipboardList,
  'take-note': NotebookPen,
};

// Hover tooltip (title attr) for each quick-action button — the "clicks"
// this page exists to preserve, only ever shown at lg+.
const CHIP_DESCRIPTIONS: Record<string, string> = {
  'what-can-you-do': 'What Urganize does, and what you can ask me for',
  'todays-focus': "What's due, what's late and what's blocked",
  // #570's wording, on the chip that survived: the three planner presets it
  // also described are gone from CHAPPI_CHIPS, so their keys would be dead.
  'new-release': 'Start a new rollout, planned from the playbook',
  // The three planner-preset keys #571 renamed are gone with the presets
  // themselves: CHAPPI_CHIPS folded them into one 'plan-release' chip, so a
  // description keyed on 'plan-single-6w' would never be looked up. Their
  // rename of the object is kept — "rollouts", never "releases".
  'plan-release': 'Answer a few questions and get your rollout plan',
  'status-update': 'A paragraph on where the rollout stands, ready to send',
  'add-task': 'Create an activity for one of your rollouts',
  'take-note': 'Park a thought before it gets away',
};

/** A date `weeks` from today, as YYYY-MM-DD. Module scope for the same reason
 * nextMessageId is: the clock must not be read during render. */
function ymdWeeksFromNow(weeks: number): string {
  return new Date(Date.now() + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from today to a YYYY-MM-DD date, for the voice greeting; null when unknown. */
function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const at = Date.parse(`${date.slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(at)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((at - today.getTime()) / 86_400_000);
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

// Saved chats (NEXT_PUBLIC_FEATURE_URGANS_HISTORY). Read once, like every
// other flag, so Next inlines it.
const HISTORY_ENABLED = isChappiHistoryEnabled();
const VOICE_ENABLED = isUrgansVoiceEnabled();
// Voice loads on demand (URG-314 batch 6): dictation through useLazyVoiceInput,
// the Talk button and the call store only when Talk is switched on. Both are
// off since the Oct 16 feature cuts, so none of that code is fetched.
const TalkButton = dynamic(() =>
  import('@/components/chappi/voice/TalkButton').then((m) => m.TalkButton)
);
const TALK_ENABLED = isChappiEnabled() && isUrgansRealtimeEnabled();
// Said when a message with a picture or file reaches the fallback (no model, or
// the monthly limit): the typed-command router cannot read either.
const ATTACHMENTS_UNAVAILABLE_NOTE =
  'I cannot read pictures or files right now, so I did not look at what you attached. Send it again in a moment.';

// "Listening… 0:07" — mm:ss, single-digit minutes are enough for a 60s cap.
const formatElapsed = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Module-scope id generator: keeps impure Date.now() out of component scope
// (react-hooks/purity), and the counter guarantees uniqueness even when two
// turns land in the same millisecond (e.g. a chip's user+assistant pair).
//
// With chat history on, ids are compared position by position across tabs
// and devices to notice two places writing one chat, so they must be unique
// EVERYWHERE, not just in this tab — two tabs opened at once would otherwise
// both mint `<ms>-1-u`. A random uuid then. With history off, the old form.
let messageSeq = 0;
function nextMessageId(role: 'u' | 'a'): string {
  if (HISTORY_ENABLED) return newChatId();
  messageSeq += 1;
  return `${Date.now()}-${messageSeq}-${role}`;
}

/** What the composer says when the chat on screen has stopped saving. Only
 * failures earn a line; a save in progress is silent. */
const SAVE_NOTICE_COPY: Record<'retrying' | 'blocked' | 'too_long', string> = {
  retrying: "Not saved yet. We'll keep trying.",
  blocked: "This session can't be saved right now.",
  too_long: 'This session is too long to save. Start a new session.',
};

/** One request/response exchange: the store epoch it started under, and the
 * saved chat it belongs to — see beginTurn inside the component. */
type Turn = { epoch: number; conversationId: string | null };

/**
 * Chappi's full conversation surface — lives on its own page
 * (`/dashboard/urgans`), separate from the release/task workspace, so a long
 * conversation never pushes releases/tasks down the page.
 *
 * Two states, switched on `messages.length`:
 *  - Empty: a Perplexity-style landing — one plain question sits right above
 *    the input. On the `page` variant the whole block centers vertically on
 *    the full screen; the compact `panel` variant (dock/rail) bottom-anchors
 *    instead. The quick-action buttons (New rollout or the three planner
 *    chips, plus Add activity) render BELOW the box, but only at lg+ — a
 *    phone gets the question and the box and nothing else.
 *  - Active: a scrolling transcript of every turn, chip-triggered or typed,
 *    with the input pinned at the bottom.
 *
 * Chips run deterministic app actions instantly (no round-trip) and are
 * recorded as a turn either way. Free-text goes to the agent backend
 * (/api/urgans) with the FULL conversation history; when the model isn't
 * configured — or the call fails — it falls back to the local keyword
 * intent-router, so the page always does something useful.
 */
export function ChappiConversation({
  onNewRelease,
  variant = 'page',
  headingLevel = 'h1',
  focusRequest = 0,
  trailing = null,
  trailingAt,
  emptyHero,
  placeholder,
  externalComposer = false,
  takeHandedInput = false,
}: ChappiConversationProps) {
  const isPanel = variant === 'panel';
  const router = useRouter();
  const todaysDirective = useReleaseStore((state) => state.todaysDirective);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const tasks = useTaskStore((state) => state.tasks);
  // The planner intake is mounted app-wide by AppShell, so a chip can open it
  // from here as well as from the dock, with no modal of its own.
  const openIntake = usePlannerStore((state) => state.openIntake);
  const {
    input,
    setInput,
    reply,
    setReply,
    messages,
    appendMessage,
    truncateFromMessage,
    scopedReleaseId,
    setScopedReleaseId,
    scopedRecordId,
    pendingConfirmation,
    setPendingConfirmation,
    epoch,
    conversationId,
    restoredCount,
  } = useChappiStore();
  // One quiet line above the composer when this chat has stopped saving.
  // Null with history off, and for every ordinary save in progress.
  const saveNotice = useChappiHistoryStore((state) =>
    HISTORY_ENABLED ? selectChatSaveNotice(state, conversationId) : null
  );
  // The release the conversation is pinned to (scope picker under the
  // composer). Falls back to null if the id no longer resolves (deleted
  // release, stale store) so the scope silently degrades to "All releases".
  const scopedRelease = scopedReleaseId
    ? releases.find((release) => release.id === scopedReleaseId) ?? null
    : null;
  // The record in the making on screen, or the one a phone's box handed this
  // chat over from (lib/chappi/record-scope.ts). UrgAns files into it.
  const pageRecordId = recordIdFromPath(usePathname());
  const recordScope = pageRecordId ?? scopedRecordId;
  const { openQuickCreate, openTask } = useTaskUI();
  // Which transcript a request is thinking FOR, as the store epoch it started
  // under — not a plain boolean. "New chat" (or sign-out) mid-reply bumps the
  // epoch, so the new transcript is not thinking even though the old request
  // is still in flight: its composer is usable immediately instead of staying
  // disabled for up to a minute while an answer for another chat finishes.
  const [thinkingEpoch, setThinkingEpoch] = useState<number | null>(null);
  const isThinking = thinkingEpoch === epoch;
  // The shared box outside (swipe navigation) shows the same busy state.
  useEffect(() => {
    if (!externalComposer) return;
    useChappiStore.getState().setReplyInFlight(isThinking);
  }, [externalComposer, isThinking]);
  useEffect(() => {
    if (!externalComposer) return;
    return () => useChappiStore.getState().setReplyInFlight(false);
  }, [externalComposer]);
  // The reply as it is being written, while the model is still writing it. A
  // preview only: when the turn ends, the reply the server sends replaces it.
  // Keyed by epoch like `thinkingEpoch`, so a preview for a transcript that has
  // left the screen is never shown over a different one.
  const [preview, setPreview] = useState<{ epoch: number; text: string } | null>(null);
  const previewText = preview && preview.epoch === epoch ? preview.text : '';
  // The reply that just replaced a preview. It is already on screen, so it must
  // not fade in word by word a second time.
  const [noRevealId, setNoRevealId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // The transcript's scroller, so the way-back arrow can read how far up the
  // reader is (2026-10-20). Only the active-conversation branch mounts it.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Opening UrgAns brings the keyboard up (founder call, 2026-10-04): a person
  // who taps UrgAns is there to ask, so the box is ready. The full page only,
  // never the dock or the rail, which sit on every other page and would take the
  // keyboard from whatever the person is doing there. The field is 16px below
  // sm, so focusing it never zooms iOS. A mobile browser may still refuse a
  // keyboard that no tap asked for; the Urganize app allows it.
  // The box often is not there on the first frame (the page shows a skeleton
  // until auth and the saved chat resolve, and the input can be disabled for a
  // moment), so a single focus on mount silently did nothing on a phone. Retry
  // for up to ten seconds until the field actually holds focus.
  // Since desktop Home carries this conversation beside its own column
  // (2026-10-07), the retry never takes focus from an open dialog (the tour, the
  // create modal) or from something the person is using on the page, and it
  // stops for good at their first click or key press.
  useEffect(() => {
    if (variant !== 'page') return;
    let tries = 0;
    let timer: number | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    const tick = () => {
      if (stopped) return;
      const el = inputRef.current;
      if (el && !el.disabled && mayAutoFocusComposer(readAutoFocusContext(el))) {
        el.focus({ preventScroll: true });
        if (document.activeElement === el) return;
      }
      if (++tries < 100) timer = window.setTimeout(tick, 100);
    };
    window.addEventListener('pointerdown', stop, { capture: true, once: true });
    window.addEventListener('keydown', stop, { capture: true, once: true });
    tick();
    return () => {
      stop();
      window.removeEventListener('pointerdown', stop, { capture: true });
      window.removeEventListener('keydown', stop, { capture: true });
    };
  }, [variant]);

  // An explicit ask for the cursor ("+ New session", "Ask UrgAns"). The box can
  // be disabled for a moment while a reply finishes, so try for a short while.
  useEffect(() => {
    if (!focusRequest) return;
    let tries = 0;
    let timer: number | undefined;
    const tick = () => {
      const el = inputRef.current;
      if (el && !el.disabled) {
        el.focus({ preventScroll: true });
        if (document.activeElement === el) return;
      }
      if (++tries < 20) timer = window.setTimeout(tick, 100);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [focusRequest]);

  // Voice input (NEXT_PUBLIC_FEATURE_URGANS_VOICE). The transcript is MERGED
  // into whatever is typed — never replacing it, never sending. Reading the
  // input from getState avoids a stale closure at transcribe time (a clip can
  // land many seconds after recording started).
  // A hold to talk sends what was said once it is words (read through a ref:
  // the hold hook comes after, and sendUserTurn is defined further down).
  const holdSendRef = useRef<() => boolean>(() => false);
  const holdDeliverRef = useRef<(text: string) => void>(() => undefined);
  const [voice, voiceDriver] = useLazyVoiceInput({
    enabled: VOICE_ENABLED,
    onTranscript: (text) => {
      const merged = mergeTranscript(useChappiStore.getState().input, text);
      setInput(merged);
      if (holdSendRef.current()) {
        holdDeliverRef.current(merged);
        return;
      }
      inputRef.current?.focus();
    },
    getHints: () =>
      scopedRelease
        ? { releaseTitle: scopedRelease.title, artistName: scopedRelease.artistName }
        : {},
  });
  const isRecording = voice.state === 'recording';
  const isTranscribing = voice.state === 'transcribing';
  // Hold to talk, phones only (founder approved docs/mocks/hold-to-talk).
  const isDesktopBox = useIsDesktopViewport();
  const hold = useHoldToTalk(voice, !isDesktopBox && voice.supported);
  useEffect(() => {
    holdSendRef.current = hold.shouldSend;
  });

  // Photos, camera shots and text files .
  // They live in the browser until the message is sent; nothing is stored.
  const attach = useAttachments();

  // The release whose cover art the transcript is currently offering to
  // upload, or null. Component state rather than the store, unlike
  // pendingConfirmation: nothing has been proposed and nothing is waiting on a
  // server round trip — it is just a file picker sitting in the log, and a
  // reload dropping it costs the user one re-ask.
  //
  // It also survives subsequent turns, which pendingConfirmation deliberately
  // does not. A permission card must never outlive the reply that proposed it;
  // this card is not destructive, and clearing it the moment someone types
  // "which formats do you take?" would take the picker away mid-question.
  // (The song picker that used to sit beside it was removed Oct 17, 2026.)
  const [coverArtReleaseId, setCoverArtReleaseId] = useState<string | null>(null);
  const coverArtRelease = coverArtReleaseId
    ? releases.find((release) => release.id === coverArtReleaseId) ?? null
    : null;
  // The recap card is the same slot mechanics for the opposite direction: the
  // one above hands a file IN, this one hands two PNGs OUT. Its own slot for the
  // same reason — a manager can plausibly be finishing one release while
  // uploading art for another, and one shared slot would swallow whichever
  // card was already there.
  const [recapReleaseId, setRecapReleaseId] = useState<string | null>(null);
  // The "n ideas are in" card add_rollout_idea shows under its reply (Nov 2, 2026).
  const [ideasReleaseId, setIdeasReleaseId] = useState<string | null>(null);
  const [ideasSuggest, setIdeasSuggest] = useState<string | null>(null);
  // The next jobs on a project, as chips after add_to_record (2026-11-04, #1074).
  const [projectOffer, setProjectOffer] = useState<ProjectOffer | null>(null);
  const ideasRelease = ideasReleaseId ? releases.find((release) => release.id === ideasReleaseId) ?? null : null;
  const recapRelease = recapReleaseId
    ? releases.find((release) => release.id === recapReleaseId) ?? null
    : null;
  const invalidateScene = useSceneDataStore((state) => state.invalidate);

  // Which assistant message (if any) gets the word-by-word reveal. Only a
  // reply that ARRIVES while this instance is mounted animates: the transcript
  // is shared store state carried across surfaces (dock ↔ rail ↔ page), so a
  // remount or navigation must not replay the reveal over old messages —
  // hence the initial state is "nothing animates" and only a change in the
  // last message id observed by THIS instance arms it. Render-time prev-guard
  // rather than an effect (the MonthGrid/DeleteReleaseDialog convention).
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastMessageId = lastMessage?.id ?? null;
  const [prevLastMessageId, setPrevLastMessageId] = useState<string | null>(lastMessageId);
  const [revealMessageId, setRevealMessageId] = useState<string | null>(null);
  // The transcript was REPLACED rather than added to (a saved chat opened,
  // "New chat", sign-out): the new last message did not just arrive, so it
  // must not replay word by word, and the cards belong to the transcript that
  // left. Checked before the arrival guard below, which would otherwise read
  // an opened chat's last reply as brand new.
  const [prevEpoch, setPrevEpoch] = useState(epoch);
  if (epoch !== prevEpoch) {
    setPrevEpoch(epoch);
    setPrevLastMessageId(lastMessageId);
    setRevealMessageId(null);
    if (coverArtReleaseId) setCoverArtReleaseId(null);
    if (recapReleaseId) setRecapReleaseId(null);
    if (ideasReleaseId) setIdeasReleaseId(null);
    if (ideasSuggest) setIdeasSuggest(null);
    if (projectOffer) setProjectOffer(null);
  } else if (lastMessageId !== prevLastMessageId) {
    setPrevLastMessageId(lastMessageId);
    // A new user turn clears the reveal (the previous reply has finished
    // animating; keeping the id would replay it if the node ever remounts).
    setRevealMessageId(
      lastMessage?.role === 'assistant' && lastMessageId !== noRevealId ? lastMessageId : null
    );
  }

  // "New chat" empties the transcript, and a picker with no conversation
  // around it is orphaned chrome. Render-time prev-guard rather than an effect,
  // the same convention the reveal above uses.
  const [prevMessageCount, setPrevMessageCount] = useState(messages.length);
  if (messages.length !== prevMessageCount) {
    setPrevMessageCount(messages.length);
    if (messages.length === 0) {
        if (coverArtReleaseId) setCoverArtReleaseId(null);
      if (recapReleaseId) setRecapReleaseId(null);
      if (ideasReleaseId) setIdeasReleaseId(null);
      if (ideasSuggest) setIdeasSuggest(null);
      if (projectOffer) setProjectOffer(null);
    }
  }

  const hasMessages = messages.length > 0 || Boolean(trailing);

  // With history on, a chat that was just opened (or restored, or this
  // surface just mounted over one) JUMPS to its end — smooth-scrolling
  // through a long saved transcript reads as the page doing something on its
  // own. A message arriving in the chat on screen still scrolls smoothly.
  // Null to start, so the first run counts as an open.
  const scrolledEpochRef = useRef<number | null>(null);
  useEffect(() => {
    const opened = HISTORY_ENABLED && scrolledEpochRef.current !== epoch;
    scrolledEpochRef.current = epoch;
    // An explicit `behavior: 'smooth'` overrides the CSS scroll-behavior the
    // reduced-motion rule sets, so the preference has to be honoured here.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollIntoColumn(bottomRef.current, {
      behavior: opened || reduceMotion ? 'instant' : 'smooth',
      block: 'end',
    });
  }, [messages.length, isThinking, epoch]);

  // While a reply is being written the page follows it down, but only if the
  // reader is already at the bottom: someone who scrolled up to reread something
  // is not dragged back every few words. Instant, not smooth: a smooth scroll
  // restarted every fraction of a second never gets anywhere.
  useEffect(() => {
    if (!previewText) return;
    const sentinel = bottomRef.current;
    if (!sentinel) return;
    let scroller: HTMLElement | null = sentinel.parentElement;
    while (scroller) {
      const overflowY = window.getComputedStyle(scroller).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const target = scroller ?? document.documentElement;
    const fromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (fromBottom < 160) scrollIntoColumn(sentinel, { behavior: 'instant', block: 'end' });
  }, [previewText]);

  // The way-back arrow (2026-10-20): shown while the reader is far enough up
  // the transcript that the newest message is out of reach, gone as soon as
  // they are back near it. The state is set from the scroller's own events and
  // from a size observer on its content (a reply streaming in below a reader
  // who scrolled up grows the distance without any scroll event), never from
  // the effect body itself. The scroller only exists once a conversation does,
  // so this re-subscribes when the landing hands over to the transcript.
  const hasConversation = messages.length > 0;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = () => setAwayFromLatest(isAwayFromLatest(scroller));
    scroller.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' || !scroller.firstElementChild
        ? null
        : new ResizeObserver(measure);
    observer?.observe(scroller.firstElementChild as Element);
    return () => {
      scroller.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [hasConversation]);

  const scrollToLatest = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollIntoColumn(bottomRef.current, { behavior: reduceMotion ? 'instant' : 'smooth', block: 'end' });
  };

  // Appends only the ASSISTANT side of a turn. Callers own appending the
  // user side (a chip's label, or the typed prompt) — keeps each turn
  // recorded exactly once regardless of which path produced it.
  const appendAssistantReply = (
    replyText: string,
    replyMeta?: ChappiReply,
    briefSections?: string[],
    messageId?: string
  ) => {
    appendMessage({
      id: messageId ?? nextMessageId('a'),
      role: 'assistant',
      content: replyText,
      // Attribution rides the MESSAGE, not this component's state: scrolling
      // back up a transcript should show what each answer was working from,
      // and a single latest value would relabel every earlier one.
      ...(briefSections?.length ? { briefSections } : {}),
    });
    setReply(replyMeta ?? { text: replyText });
  };

  // Every reply that arrives AFTER an await is a late append: the transcript
  // it was asked from may have been replaced in the meantime ("New chat",
  // sign-out, another saved chat opened). A turn captures the store epoch and
  // the chat id when it starts, read from the store rather than this render so
  // a handler created before the change cannot pass off an old epoch as current.
  const beginTurn = (): Turn => {
    const state = useChappiStore.getState();
    return { epoch: state.epoch, conversationId: state.conversationId };
  };
  const isTurnCurrent = (turn: Turn) => useChappiStore.getState().epoch === turn.epoch;

  // With chat history on, an answer for a chat that has left the screen is
  // SAVED to that chat instead of dropped (founder decision, 2026-09-24). It
  // arrives without its suggestions, approval card or page jump: those belong
  // to a screen nobody is looking at. appendToChat refuses anything it has
  // nowhere to put — history off, another account, a chat deleted here.
  const deliverToChat = (chatId: string | null, text: string, briefSections?: string[]) => {
    if (!HISTORY_ENABLED || !chatId) return;
    appendToChat(chatId, {
      id: nextMessageId('a'),
      role: 'assistant',
      content: text,
      ...(briefSections?.length ? { briefSections } : {}),
    });
  };

  // Appends a late reply only if its transcript is still the one on screen,
  // and says whether it did — callers use that to decide whether the rest of
  // the reply (an approval card, a page jump, an opened card) still applies.
  // A reply for a transcript that has gone is never shown under a different
  // conversation, or a different account: with history on it is saved to its
  // own chat, with history off it is dropped.
  const deliverReply = (
    turn: Turn,
    replyText: string,
    replyMeta?: ChappiReply,
    briefSections?: string[],
    options?: { streamed?: boolean }
  ): boolean => {
    if (!isTurnCurrent(turn)) {
      deliverToChat(turn.conversationId, replyText, briefSections);
      return false;
    }
    if (options?.streamed) {
      // Its text was already on screen as a preview; the reply takes its place
      // without being revealed again.
      const id = nextMessageId('a');
      setNoRevealId(id);
      appendAssistantReply(replyText, replyMeta, briefSections, id);
      return true;
    }
    appendAssistantReply(replyText, replyMeta, briefSections);
    return true;
  };

  // Opens a fresh, empty note on the Notes page. `?new=1` is the deep link
  // NotesPageClient consumes to mint a note and focus its editor — the one
  // sanctioned way to create from a link (clicking chrome never creates data),
  // and it strips the param itself so a refresh doesn't mint a second one.
  const openBlankNote = () => {
    router.push(
      scopedRelease
        ? `/dashboard/notes?release=${scopedRelease.id}&new=1`
        : '/dashboard/notes?new=1'
    );
    appendAssistantReply(
      scopedRelease
        ? `Opening a new note for ${scopedRelease.title}.`
        : 'Opening a new note.'
    );
  };

  // A cover art upload has finished: record it as a turn, drop the card, and
  // drop the cached scene so the workspace shows the new file when it is next
  // opened rather than the one from before the upload.
  //
  // The card calls these when an upload FINISHES, which can be after its
  // transcript was replaced ("New chat" clears the card slots, unmounting the
  // card, but its upload keeps going). The file really did land, so the scene
  // is invalidated either way; the transcript note goes to the transcript
  // this card sat in — on screen if it still is, else (history on) into that
  // saved chat, else nowhere. `epoch` and `conversationId` here are this
  // render's, which is the render the card last received the handler from —
  // so a card that outlived its transcript carries the old ones.
  const cardStillCurrent = () => useChappiStore.getState().epoch === epoch;
  const cardChatId = conversationId;
  const reportFromCard = (text: string) => {
    if (cardStillCurrent()) appendAssistantReply(text);
    else deliverToChat(cardChatId, text);
  };

  // Cover art has landed. The CATALOG has to be refreshed as well, because the
  // release card and the topbar both show the artwork, and a stale card is the
  // one place someone would notice nothing had happened.
  const handleCoverArtUploaded = (coverArt: ReleaseCoverArt) => {
    setCoverArtReleaseId(null);
    invalidateScene(coverArt.releaseId, 'coverart');
    void loadCommandCenter({ force: true });
    const releaseTitle = releases.find((item) => item.id === coverArt.releaseId)?.title;
    reportFromCard(
      releaseTitle
        ? `Set "${coverArt.fileName}" as the cover art for ${releaseTitle}.`
        : `Set "${coverArt.fileName}" as the cover art.`
    );
  };

  // The recap card reports "saved" / "could not save" back into the log. Same
  // rule as the upload handlers above: only into the transcript it sat in.
  const handleReportRecap = (message: string) => reportFromCard(message);

  // A chip under the project offer: the choice is the user's turn, the tasks
  // are added straight through the task route (no model, no credits), and the
  // answer says what landed. The card goes either way, so nothing is added twice.
  const handleProjectOfferChoice = async (choice: ProjectOfferChoice) => {
    const offer = projectOffer;
    if (!offer) return;
    appendMessage({ id: nextMessageId('u'), role: 'user', content: choice.label });
    setProjectOffer(null);
    if (choice.jobs.length === 0) {
      reportFromCard("Okay. They stay under Suggested next on the project whenever you want them.");
      return;
    }
    let added = 0;
    let failure = '';
    for (const job of choice.jobs) {
      const result = await addProjectTask(offer.recordId, { title: job.title, description: job.description, source: 'ai' });
      if (result.ok) {
        added += 1;
        captureAnalyticsEvent({ name: 'project_task_added', properties: { source: 'ai' } });
      } else failure = result.error;
    }
    if (added === 0) reportFromCard(failure || 'Could not add them. Try again from the project page.');
    else if (failure) reportFromCard(`${projectOfferDoneLine(added)} One could not be added: ${failure}`);
    else reportFromCard(projectOfferDoneLine(added));
  };

  // Deterministic intent handling — chips, and the AI-off fallback for prompts.
  const handleIntent = (intent: ChappiIntent) => {
    switch (intent.kind) {
      case 'new_release':
        onNewRelease();
        appendAssistantReply("Let's set up a new rollout. The form is open.");
        return;
      case 'plan_release': {
        const preset = intent.plannerPreset;
        // Only hand the planner an existing release when it has nothing in it
        // yet. A release with activities already has a plan, so planning it
        // again would be refused server-side.
        const scopedHasTasks = scopedRelease
          ? tasks.some((task) => task.releaseId === scopedRelease.id)
          : false;
        const target = scopedRelease && !scopedHasTasks ? scopedRelease.id : undefined;

        openIntake({
          source: 'chip',
          releaseId: target,
          prefill: {
            releaseType: preset?.releaseType,
            // Resolved at click time, not module load: a chip is a constant and
            // a baked-in date would go stale.
            releaseDate:
              typeof preset?.weeksOut === 'number'
                ? ymdWeeksFromNow(preset.weeksOut)
                : undefined,
            budget: preset?.budget,
          },
        });
        appendAssistantReply(
          "Let's plan it. A few quick questions, then I'll build your rollout plan."
        );
        return;
      }
      case 'add_task':
        // 'quick_create' is the canonical source; TaskCreateSource has no
        // 'chappi' member and adding one is out of scope. The scoped release
        // (if any) pre-fills the activity's release.
        openQuickCreate({ releaseId: scopedRelease?.id, source: 'quick_create' });
        appendAssistantReply(
          scopedRelease
            ? `Opening a new activity for ${scopedRelease.title}.`
            : 'Opening a new activity.'
        );
        return;
      case 'todays_focus':
        if (scopedRelease && todaysDirective?.releaseId !== scopedRelease.id) {
          // Scoped to a release the global directive doesn't belong to —
          // open that release's activities instead of someone else's task.
          router.push(`/dashboard?release=${scopedRelease.id}`);
          appendAssistantReply(`Opening the activities for ${scopedRelease.title}.`);
        } else if (todaysDirective) {
          // Cross-page open: the task detail view renders on the workspace
          // page, not here. Same pattern NotificationsBell uses — navigate
          // first, then openTask (route-agnostic; the state is picked up
          // wherever TaskDetailInline is rendered).
          router.push(`/dashboard?release=${todaysDirective.releaseId}`);
          openTask(todaysDirective.id);
          appendAssistantReply(`Today's focus: "${todaysDirective.title}". I've opened it for you.`);
        } else {
          appendAssistantReply("You're all caught up. Nothing needs your attention right now.");
        }
        return;
      case 'generate_status': {
        const target =
          scopedRelease?.id ??
          todaysDirective?.releaseId ??
          (releases.length === 1 ? releases[0]?.id : null);
        if (!target) {
          appendAssistantReply(
            'Which rollout? Open one first, or tell me its name and ask again.'
          );
          return;
        }
        // Generates here rather than pointing anywhere. This branch used to
        // navigate to the release and say 'use "Generate status update" there'
        // — that button was removed 2026-09-07 (founder call: the status
        // update belongs in this conversation, not on a pill), so a pointer
        // would now aim at nothing. It calls the same route the
        // generate_status_update tool calls, which is what keeps the answer
        // identical whether or not a model is configured.
        //
        // Captured before the first await: the answer lands a network round
        // trip later, by which time the transcript may have been replaced.
        const turn = beginTurn();
        void (async () => {
          try {
            const token = await getAccessToken();
            const response = await fetch(`/api/releases/${target}/generate-status`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({}),
            });
            const payload = (await response.json().catch(() => ({}))) as {
              status_update?: string;
              stats?: StatusFacts;
              error?: string;
            };
            if (!response.ok) {
              deliverReply(
                turn,
                // The route answers 404 both for the flag being off and for a
                // release that is not yours, so it must not name a switch —
                // the same reason the tool routes this through isFlagGateOff.
                String(payload.error || 'Could not write that status update. Try again.')
              );
              return;
            }
            const statusUpdate = String(payload.status_update || '').trim();
            // Same facts line the tool appends, from the same builder, so the
            // deterministic answer and the agentic one carry identical figures.
            const facts = payload.stats ? describeStatusFacts(payload.stats) : '';
            deliverReply(
              turn,
              [statusUpdate || 'Could not write that status update. Try again.', facts]
                .filter(Boolean)
                .join('\n\n')
            );
          } catch {
            deliverReply(
              turn,
              'Could not reach the status update generator. Check your connection and try again.'
            );
          }
        })();
        return;
      }
      case 'generate_recap': {
        const target =
          scopedRelease?.id ??
          todaysDirective?.releaseId ??
          (releases.length === 1 ? releases[0]?.id : null);
        if (!target) {
          appendAssistantReply(
            'Which rollout? Open one first, or tell me its name and ask again.'
          );
          return;
        }
        // Builds the card here rather than pointing at a button, for the same
        // reason the status branch above does: the recap modal was removed
        // 2026-09-07 (founder call — the recap belongs in this conversation),
        // so a pointer would aim at nothing. Same route the generate_recap
        // tool calls, so the answer is identical with or without a model.
        //
        // No highlight in this path, deliberately: there is no model to hear
        // "say it went platinum", and the route treats it as optional. Anyone
        // who wants one asks in a sentence, which is the agentic path.
        const turn = beginTurn();
        void (async () => {
          try {
            const token = await getAccessToken();
            const response = await fetch(`/api/releases/${target}/recap`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({}),
            });
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) {
              deliverReply(
                turn,
                // The route's own wording covers both "not finished yet" and
                // "not yours", and it must not name a switch — the same reason
                // the tool routes this through isFlagGateOff.
                String(payload.error || 'Could not build that recap. Try again.')
              );
              return;
            }
            // The card fetches its own signed URLs on mount, so nothing from
            // this response is carried into it. Only opened if the reply
            // actually landed: a card under a different conversation would be
            // orphaned chrome.
            if (deliverReply(turn, 'Here is your recap card. Pick a size and save it.')) {
              setRecapReleaseId(target);
            }
          } catch {
            deliverReply(
              turn,
              'Could not reach the recap builder. Check your connection and try again.'
            );
          }
        })();
        return;
      }
      case 'share_socials': {
        // No model in this path, so there is nobody to hear "the Lagos Nights
        // one". The rollout in view, or the only one there is; anything else
        // is a question, because opening the sheet on the wrong rollout would
        // put the wrong title on somebody's post.
        const target =
          scopedRelease?.id ?? (releases.length === 1 ? releases[0]?.id : null);
        if (!target) {
          appendAssistantReply(
            'Which rollout? Pick it below the prompt and ask me again.'
          );
          return;
        }
        if (openShareSheet(target)) {
          appendAssistantReply(
            'Opening the share sheet. Answer four quick questions and your posts are ready.'
          );
        }
        return;
      }
      case 'create_note': {
        const body = intent.noteBody?.trim() ?? '';
        // Nothing to save — treat it as the chip and open an empty editor.
        if (!body) {
          openBlankNote();
          return;
        }
        // In deterministic mode the scope picker IS the release context: there
        // is no model to hear "put it under Best", so a scoped conversation
        // attaches its notes the same way add_task attaches its activities.
        const releaseId = scopedRelease?.id ?? null;
        const turn = beginTurn();
        // create() resolves to null on a failed write rather than throwing, so
        // the value is the success check; catch only covers a network throw.
        void useNotesStore
          .getState()
          .create({ body, releaseId })
          .then((note) => {
            deliverReply(
              turn,
              note
                ? scopedRelease
                  ? `Saved to Notes, under ${scopedRelease.title}.`
                  : 'Saved to Notes.'
                : "Couldn't save that note. Try again, or open Notes and write it there."
            );
          })
          .catch(() => {
            deliverReply(
              turn,
              "Couldn't save that note. Try again, or open Notes and write it there."
            );
          });
        return;
      }
      case 'take_note':
        openBlankNote();
        return;
      case 'help':
      default: {
        const helpReply = buildHelpReply();
        appendAssistantReply(helpReply.text, helpReply);
      }
    }
  };

  const handleChipClick = (chip: ChappiChip) => {
    // An ASK chip is a question, so it goes through the ordinary send path and
    // the assistant answers it. Deliberately NOT handleIntent: the router would
    // keyword-match the question and act on it — "How do I plan a release?"
    // contains 'plan', so it would open the planner instead of explaining it.
    // With no model configured submitPrompt falls back to the router anyway,
    // which lands on the help card for these — an honest answer to "what can
    // you do", rather than a wrong one.
    // `!== undefined` rather than truthiness: an ask chip's `ask` is a required
    // string, so a falsy check cannot exclude the variant and TS keeps `intent`
    // possibly-undefined in the branch below.
    if (chip.ask !== undefined) {
      sendUserTurn(chip.ask);
      return;
    }
    appendMessage({ id: nextMessageId('u'), role: 'user', content: chip.label });
    handleIntent({ kind: chip.intent, plannerPreset: chip.plannerPreset });
  };

  // The share sheet is mounted once, in AppShell, and opened through its store.
  // `open` answers false only when no sheet is mounted yet (it is a lazy chunk),
  // and then the honest reply is that it is not ready, not that it opened.
  const openShareSheet = (releaseId: string): boolean => {
    const opened = useShareStore.getState().open({ releaseId, source: 'urgans' });
    if (!opened) {
      appendAssistantReply('The share sheet is still loading. Ask me again in a moment.');
    }
    return opened;
  };

  // Client-side actions the agent asks us to perform.
  const executeClientActions = (actions: ChappiClientAction[]) => {
    for (const action of actions) {
      if (action.type === 'navigate') {
        const href = action.href;
        // create_release sets this when that was the person's first rollout.
        // The once-only share offer is saved for the next visit, exactly as it
        // is after the create buttons, and the navigation runs straight away.
        if (action.offerFirstShareFor) deferFirstShareOffer(action.offerFirstShareFor, true);
        router.push(href);
      } else if (action.type === 'open_share') openShareSheet(action.releaseId);
      else if (action.type === 'open_create_release') onNewRelease();
      else if (action.type === 'open_quick_create')
        openQuickCreate({ releaseId: action.releaseId ?? undefined, source: 'quick_create' });
      else if (action.type === 'open_cover_art_upload') setCoverArtReleaseId(action.releaseId);
      else if (action.type === 'open_recap') setRecapReleaseId(action.releaseId);
      else if (action.type === 'offer_project_tasks') setProjectOffer(action.offer);
      else if (action.type === 'open_ideas') {
        setIdeasReleaseId(action.releaseId);
        setIdeasSuggest(action.suggest ?? null);
      }
      else if (action.type === 'refresh') void loadCommandCenter({ force: true });
    }
  };

  // A reply whose chat has left the screen keeps only a catalog refresh (its
  // tools did run), and still saves a first-rollout share offer for the next
  // visit rather than dropping it: that offer happens once. See
  // lib/chappi/left-chat-actions.ts.
  const settleLeftChatActions = (actions: ChappiClientAction[]) => {
    executeClientActions(actionsForLeftChat(actions));
    for (const releaseId of firstShareOffersIn(actions)) deferFirstShareOffer(releaseId, true);
  };

  const runDeterministic = (prompt: string) => handleIntent(resolveIntent(prompt));

  // "Mark the cover shoot as done": changed here, by rule, with no model call
  // and so no credits (founder, 2026-10-14). Says whether it handled the
  // message; a loose phrase ("the EP is done") that names no activity is left
  // for the model, as it always was. See lib/chappi/task-status-command.ts.
  const runTaskStatusCommand = async (turn: Turn, command: TaskStatusCommand): Promise<boolean> => {
    const token = await getAccessToken();
    if (!token) return false;
    const listResponse = await fetch('/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).catch(() => null);
    const listPayload = listResponse
      ? ((await listResponse.json().catch(() => ({}))) as { tasks?: Task[] })
      : {};
    if (!listResponse?.ok || !Array.isArray(listPayload.tasks)) {
      if (command.strength === 'loose') return false;
      deliverReply(turn, 'I could not load your activities just now, so nothing changed.');
      return true;
    }
    const matches = matchTasksByTitle(command.query, listPayload.tasks, scopedRelease?.id ?? null);
    const label = getTaskStatusLabel(command.status);
    if (matches.length === 0) {
      if (command.strength === 'loose') return false;
      deliverReply(turn, `I could not find an activity called “${command.query}”. Use its name as it appears in your activities.`);
      return true;
    }
    if (matches.length > 1) {
      const names = matches
        .slice(0, 5)
        .map((task) => `“${task.title}”`)
        .join(', ');
      deliverReply(turn, `More than one activity matches “${command.query}”: ${names}. Say the full name and I will change it.`);
      return true;
    }
    const task = matches[0];
    if (task.status === command.status) {
      deliverReply(turn, `“${task.title}” is already ${label}.`);
      return true;
    }
    if (command.status === 'done') {
      // The store's path, so the dependency check and the cascade-unlock run
      // exactly as they do for the checkbox.
      const completed = await useTaskStore.getState().completeTask(task.id);
      if (!completed) {
        const blocker = useTaskStore.getState().error;
        deliverReply(turn, blocker || `I could not mark “${task.title}” as Done just now.`);
        return true;
      }
    } else {
      const patchResponse = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: command.status }),
      }).catch(() => null);
      const patchPayload = patchResponse
        ? ((await patchResponse.json().catch(() => ({}))) as { task?: Task; error?: string })
        : {};
      if (!patchResponse?.ok) {
        deliverReply(turn, patchPayload.error || `I could not change “${task.title}” just now.`);
        return true;
      }
      if (patchPayload.task) {
        const updated = patchPayload.task;
        useTaskStore.setState((state) => ({
          tasks: state.tasks.map((candidate) =>
            candidate.id === updated.id ? { ...candidate, status: updated.status } : candidate
          ),
        }));
      }
    }
    window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    void loadCommandCenter({ force: true });
    deliverReply(turn, `Done. “${task.title}” is now ${label}.`);
    return true;
  };

  const submitPrompt = async (prompt: string, historyForApi: ChappiMessage[]) => {
    const turn = beginTurn();
    setThinkingEpoch(turn.epoch);
    // The router answers synchronously into whatever transcript is on screen,
    // so after any await it only runs if that is still this turn's transcript.
    const sentAttachments = Boolean(historyForApi[historyForApi.length - 1]?.attachments?.length);
    const fallBackToRouter = () => {
      if (!isTurnCurrent(turn)) return;
      // The typed-command router cannot read a picture or a file, and handing it
      // the stand-in text ("Attached: x.jpg") would only get a help card back.
      if (sentAttachments) {
        deliverReply(turn, ATTACHMENTS_UNAVAILABLE_NOTE);
        return;
      }
      runDeterministic(prompt);
    };
    // Set once fetch resolves: from then on the server has the request and its
    // tools may have run, so a failure must never be answered by the keyword
    // router (a rename that went through came back as "Let's plan it").
    let sent = false;
    let reachedServer = false;
    // Content-free breadcrumbs (sent, first byte, done, error) for Sentry.
    const telemetry = startUrgansTelemetry();
    const handleFailedTurn = () => {
      if (failedTurnOutcome({ sent, reachedServer, online: isDeviceOnline() }) === 'router') {
        fallBackToRouter();
        return;
      }
      // Show the real state rather than a guess: whatever ran is on screen
      // after the refresh, wherever the person is now.
      void loadCommandCenter({ force: true });
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
      if (isTurnCurrent(turn)) deliverReply(turn, TURN_DROPPED_NOTE);
    };
    try {
      // A status change is answered here, by rule, before any model call.
      if (!sentAttachments) {
        const command = parseTaskStatusCommand(prompt);
        if (command && (await runTaskStatusCommand(turn, command))) return;
      }
      const token = await getAccessToken();
      if (!token) {
        fallBackToRouter();
        return;
      }
      sent = true;
      telemetry.sent({ streamed: true, scoped: Boolean(scopedRelease), attachments: sentAttachments });
      const response = await fetch('/api/urgans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          // Asks for the reply a piece at a time. The server decides: with its
          // switch off it answers plain JSON and this changes nothing.
          [URGANS_STREAM_HEADER]: '1',
        },
        body: JSON.stringify({
          // The route forwards only the last CHAPPI_HISTORY_LIMIT messages to
          // the model, so sending more is weight with no effect — and a
          // restored chat can be hundreds of messages long.
          // Photos and files ride only with the latest message that has them, and
          // only while it is recent (lib/urgans-attachments.ts): a request never
          // carries a picture from an hour ago.
          messages: selectAttachmentsToSend(historyForApi.slice(-CHAPPI_HISTORY_LIMIT)),
          releaseScope: scopedRelease
            ? { id: scopedRelease.id, title: scopedRelease.title }
            : undefined,
          recordScope: recordScope ? { id: recordScope } : undefined,
        }),
        cache: 'no-store',
      });
      reachedServer = true;
      let data: ChappiResponse | null;
      let streamedText = '';
      const isStream = Boolean(response.body) && isStreamContentType(response.headers.get('content-type'));
      telemetry.response(response.status, isStream);
      if (response.body && isStream) {
        // Pieces of the reply are shown as they arrive, a few times a second at
        // most, so a fast model does not re-render the whole transcript on every
        // word.
        const batcher = createTextBatcher({
          emit: (piece) =>
            setPreview((current) => ({
              epoch: turn.epoch,
              text: (current && current.epoch === turn.epoch ? current.text : '') + piece,
            })),
        });
        const outcome = await readStreamedTurn(response, {
          onText: (delta) => {
            if (isTurnCurrent(turn)) batcher.push(delta);
          },
          // A new round replaced the one being shown.
          onReset: () => {
            batcher.discard();
            setPreview(null);
          },
          onFirstChunk: () => telemetry.firstByte(),
        });
        batcher.discard();
        streamedText = outcome.text;
        if (!outcome.final) {
          telemetry.failed('stream_dropped', { status: response.status, reachedServer: true });
          // The connection dropped before the answer was complete. The server
          // had the request, so its tools may have run: keep what was written
          // and say so, refresh, and never hand the prompt to the router.
          if (outcome.text) {
            void loadCommandCenter({ force: true });
            window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
            deliverReply(turn, `${outcome.text}\n\n${CONNECTION_DROPPED_NOTE}`, undefined, undefined, {
              streamed: true,
            });
          } else {
            handleFailedTurn();
          }
          return;
        }
        data = outcome.final;
      } else {
        data = (await response.json().catch(() => null)) as ChappiResponse | null;
      }

      if (response.ok && data?.mode === 'agent') {
        telemetry.done('agent');
        if (
          !deliverReply(turn, data.reply, undefined, data.briefSections, {
            streamed: streamedText.length > 0,
          })
        ) {
          // The user moved on. No approval card: it would be asking about a
          // conversation that is no longer on screen, and nothing has run.
          settleLeftChatActions(data.clientActions);
          return;
        }
        setPendingConfirmation(data.pendingConfirmation ?? null);
        if (data.pendingConfirmation) {
          captureAnalyticsEvent({
            name: 'urgans_confirmation',
            properties: { action: 'shown', tool: data.pendingConfirmation.toolName },
          });
        }
        executeClientActions(data.clientActions);
        return;
      }
      if (data?.mode === 'error') {
        telemetry.done('error');
        deliverReply(turn, data.error);
        return;
      }
      if (data?.mode === 'deterministic') telemetry.done('deterministic');
      // A ceiling reply carries a reason. Shown before the router runs so the
      // user understands why the answer reads differently, rather than
      // silently getting a terser assistant. The typed command still works —
      // that is the point of falling through rather than refusing.
      if (data?.mode === 'deterministic' && data.notice) {
        deliverReply(turn, data.notice);
      }
      // Deterministic mode (model not configured, or a ceiling): the server
      // said so before running anything, so the local router answers.
      if (data?.mode === 'deterministic') {
        fallBackToRouter();
        return;
      }
      // Any other shape (a 502/504 page, an unreadable body) after the request
      // reached the server: it may have run, so no router guess.
      telemetry.failed('bad_response', { status: response.status, reachedServer: true });
      handleFailedTurn();
    } catch (error) {
      telemetry.failed(!sent ? 'before_send' : reachedServer ? 'unexpected' : 'network', { error, reachedServer });
      handleFailedTurn();
    } finally {
      // Only clears the indicator this turn set. If the transcript was
      // replaced and a new turn started meanwhile, that one owns it now.
      setThinkingEpoch((current) => (current === turn.epoch ? null : current));
      setPreview((current) => (current && current.epoch === turn.epoch ? null : current));
    }
  };

  /**
   * The user approved a proposed action. This is the ONLY path that executes a
   * confirmation-gated tool — the model cannot reach it.
   *
   * Deliberately no deterministic fallback: if this request fails we do not
   * know whether the server ran the action, and quietly routing to the local
   * intent-router would be a lie either way.
   */
  const handleApproveConfirmation = async (extraArgs?: Record<string, unknown>) => {
    if (!pendingConfirmation || isThinking) return;
    const approved = extraArgs
      ? { ...pendingConfirmation, args: { ...pendingConfirmation.args, ...extraArgs } }
      : pendingConfirmation;
    captureAnalyticsEvent({
      name: 'urgans_confirmation',
      properties: { action: 'approved', tool: approved.toolName },
    });
    setPendingConfirmation(null);

    const userMessage: ChappiMessage = {
      id: nextMessageId('u'),
      role: 'user',
      content: 'Approve.',
    };
    const historyForApi = [...messages, userMessage];
    appendMessage(userMessage);

    const turn = beginTurn();
    setThinkingEpoch(turn.epoch);
    try {
      const token = await getAccessToken();
      if (!token) {
        deliverReply(turn, 'You are signed out, so nothing ran. Sign in and try again.');
        return;
      }
      const response = await fetch('/api/urgans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          // Approving a card writes one closing line. It never needs the picture.
          messages: stripAttachmentPayloads(historyForApi.slice(-CHAPPI_HISTORY_LIMIT)),
          releaseScope: scopedRelease
            ? { id: scopedRelease.id, title: scopedRelease.title }
            : undefined,
          recordScope: recordScope ? { id: recordScope } : undefined,
          confirmedAction: { toolName: approved.toolName, args: approved.args },
        }),
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => null)) as ChappiResponse | null;

      if (response.ok && data?.mode === 'agent') {
        // The approved action HAS run by now, so its catalog refresh applies
        // even if the user has moved on; the rest only belongs on screen.
        if (deliverReply(turn, data.reply, undefined, data.briefSections)) {
          executeClientActions(data.clientActions);
        } else {
          settleLeftChatActions(data.clientActions);
        }
        return;
      }
      if (data?.mode === 'error') {
        deliverReply(turn, data.error);
        return;
      }
      deliverReply(turn, 'That did not go through. Nothing was changed.');
    } catch {
      deliverReply(
        turn,
        'Something went wrong confirming that. Check your rollout, it may or may not have gone through.'
      );
    } finally {
      setThinkingEpoch((current) => (current === turn.epoch ? null : current));
    }
  };

  /** Cancel needs no round-trip: nothing was ever executed. Both turns are
   * appended locally so the model sees the decision in later history. */
  const handleCancelConfirmation = () => {
    if (!pendingConfirmation) return;
    captureAnalyticsEvent({
      name: 'urgans_confirmation',
      properties: { action: 'cancelled', tool: pendingConfirmation.toolName },
    });
    setPendingConfirmation(null);
    if (pendingConfirmation.cancelLabel) {
      // "Fix something": nothing ran, and the box is ready for the fix.
      appendMessage({ id: nextMessageId('u'), role: 'user', content: `${pendingConfirmation.cancelLabel}.` });
      appendAssistantReply('Nothing was added yet. Tell me what to change.');
      inputRef.current?.focus();
      return;
    }
    appendMessage({ id: nextMessageId('u'), role: 'user', content: 'Cancel that.' });
    appendAssistantReply('Cancelled. Nothing was changed.');
  };

  // Appends the user turn immediately (so it appears without waiting on the
  // round-trip), then sends the FULL prior history + this turn to the agent
  // — /api/urgans already accepts and expects multi-turn `messages`.
  const sendUserTurn = (text: string, attachments?: ChappiAttachment[]) => {
    // Typing something else abandons any pending proposal. Nothing ran, and
    // the model will re-propose if the user asks again.
    if (pendingConfirmation) setPendingConfirmation(null);
    const userMessage: ChappiMessage = {
      id: nextMessageId('u'),
      role: 'user',
      // Never empty, so a message with only a picture survives everywhere a
      // blank one is dropped (and a reopened chat still says what was shared).
      content: text || attachmentOnlyContent(attachments ?? []),
      ...(attachments?.length ? { attachments } : {}),
    };
    const historyForApi = [...messages, userMessage];
    appendMessage(userMessage);
    void submitPrompt(text, historyForApi);
  };

  // A message typed in Home's chat box is sent the moment a conversation shows.
  const sendInputOnOpen = useChappiStore((state) => state.sendInputOnOpen);
  useEffect(() => {
    // Only the full page takes a message handed over from Home, and only once
    // no reply is in flight, so a queued message is never lost or doubled.
    if (!sendInputOnOpen || (variant !== 'page' && !takeHandedInput) || isThinking) return;
    const text = useChappiStore.getState().input.trim();
    const files = useChappiStore.getState().pendingAttachments;
    useChappiStore.getState().setSendInputOnOpen(false);
    useChappiStore.getState().setPendingAttachments([]);
    if (!text && files.length === 0) return;
    useChappiStore.getState().setInput('');
    sendUserTurn(text, files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendInputOnOpen, variant, takeHandedInput, isThinking]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    const attached = attach.attachments;
    if ((!trimmed && attached.length === 0) || isThinking || attach.pending > 0) return;
    setInput('');
    attach.clear();
    sendUserTurn(trimmed, attached);
  };
  useEffect(() => {
    holdDeliverRef.current = (text) => {
      const trimmed = text.trim();
      const attached = attach.attachments;
      if ((!trimmed && attached.length === 0) || isThinking || attach.pending > 0) return;
      setInput('');
      attach.clear();
      sendUserTurn(trimmed, attached);
    };
  });

  // Regenerate the last reply: drop it from the transcript (keeping the user
  // turn that produced it) and re-submit the history up to that turn. Only
  // offered on the transcript's final message, and only when a user turn
  // precedes it — the standard chat-retry contract.
  //
  // And only on a reply added THIS session. A restored chat's last reply is
  // yesterday's answer: regenerating it would re-run whatever tools it used
  // and bill an action for a question the user is not asking now. With
  // history off `restoredCount` is always 0, so this changes nothing there.
  const canRetry =
    !isThinking &&
    lastMessage?.role === 'assistant' &&
    messages.length - 1 >= restoredCount &&
    messages.some((message) => message.role === 'user');
  const handleRetry = () => {
    if (!canRetry || !lastMessage) return;
    const history = messages.slice(0, messages.length - 1);
    const lastUserTurn = [...history].reverse().find((message) => message.role === 'user');
    if (!lastUserTurn) return;
    captureAnalyticsEvent({ name: 'urgans_reply_action', properties: { action: 'retry' } });
    truncateFromMessage(lastMessage.id);
    void submitPrompt(lastUserTurn.content, history);
  };

  // One input, two positions: vertically centered on the empty landing
  // (Perplexity-style, page variant — the panel variant bottom-anchors),
  // pinned at the bottom once a conversation exists.
  //
  // ONE ROW, not two (2026-08-16). The release scope picker used to sit on
  // its own line under the text field, which made the composer ~66px tall —
  // real estate a phone with the keyboard up cannot spare, and visually a
  // stacked box rather than a single control. It is now a leading chip in
  // the same row, the shape every mature mobile assistant composer has
  // settled on: context control, field, send. The dropdown still opens
  // upward from it, and it still renders nothing while the user has no
  // releases (in which case this is simply field + send).
  const inputForm = externalComposer ? null : (
    <form
      onSubmit={handleSubmit}
      className="w-full"
      data-chappi-composer
    >
      {voiceDriver}
      <ChappiAttachmentTray
        attachments={attach.attachments}
        pending={attach.pending}
        onRemove={attach.remove}
      />
      <div className="flex items-center gap-1 rounded-full border border-stroke-default bg-bg-surface/70 p-1.5 backdrop-blur-2xl transition-colors focus-within:border-brand/70 focus-within:bg-bg-elevated/80">
        <ChappiScopePicker
          releases={releases}
          scopedReleaseId={scopedReleaseId}
          onSelect={setScopedReleaseId}
        />
        <ChappiAttachMenu
          disabled={isThinking || isRecording || isTranscribing}
          onFiles={(files) => void attach.addFiles(files)}
        />
        {isRecording ? (
          // The field is replaced by a live "Listening…" readout while
          // recording. Same 16px/px-2 metrics as the input so the row height
          // does not jump.
          <div
            role="status"
            className="flex min-w-0 flex-1 items-center gap-2 px-2 text-[16px] text-content-secondary sm:text-sm"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-status-error motion-safe:animate-pulse"
              aria-hidden="true"
            />
            {hold.holding ? (
              <>
                <span className="tabular-nums">{formatElapsed(voice.elapsed)}</span>
                <span className={`truncate text-sm ${hold.cancelArmed ? 'text-status-error' : 'text-content-tertiary'}`}>
                  {hold.cancelArmed ? 'Let go to cancel' : '‹ Slide left to cancel'}
                </span>
              </>
            ) : (
              <>Listening… {formatElapsed(voice.elapsed)}</>
            )}
          </div>
        ) : (
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            // A picture pasted from the clipboard (a screenshot, a copied image)
            // attaches like a chosen one. Pasted text is left alone.
            onPaste={(event) => {
              const pictures = Array.from(event.clipboardData?.files ?? []).filter((file) =>
                file.type.startsWith('image/')
              );
              if (pictures.length === 0) return;
              event.preventDefault();
              void attach.addFiles(pictures);
            }}
            placeholder={
              isTranscribing
                ? 'Turning your voice into text…'
                : pageRecordId
                  ? RECORD_CAPTURE_PLACEHOLDER
                  : placeholder ??
                    holdToTalkPlaceholder({ phone: !isDesktopBox, micReady: voice.supported, hasMessages: messages.length > 0 }) ??
                    'Ask AI…'
            }
            aria-label="Message AI"
            disabled={isThinking || isTranscribing}
            // 16px below sm is deliberate: anything smaller makes iOS zoom the
            // page on focus, which is its own kind of layout jump.
            className="min-w-0 flex-1 bg-transparent px-2 text-[16px] text-content-primary placeholder:text-content-tertiary focus:outline-none disabled:opacity-60 sm:text-sm"
          />
        )}
        {voice.supported ? (
          <button
            type="button"
            {...hold.buttonProps}
            data-holding={hold.holding ? 'true' : undefined}
            // The label carries the state ("Stop recording" / "Talk to UrgAns"),
            // so no aria-pressed as well: announcing both reads as a double
            // negative. The recording colour keys off a data attribute.
            data-recording={isRecording ? 'true' : undefined}
            // "Dictate" once Talk sits beside it, so the two never share a name.
            aria-label={isRecording ? 'Stop recording' : TALK_ENABLED ? 'Dictate' : 'Talk to AI'}
            title={TALK_ENABLED && !isRecording ? 'Dictate' : undefined}
            // Ghost style so Send stays the primary action.
            disabled={isThinking || isTranscribing || (voice.state === 'requesting' && !hold.holding)}
            className="motion-press grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-secondary transition-[color,background-color,transform] hover:bg-bg-elevated hover:text-content-primary disabled:opacity-40 data-[recording=true]:text-status-error data-[holding=true]:scale-125 data-[holding=true]:bg-status-error data-[holding=true]:text-content-inverse"
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
            disabled={isThinking || isRecording || isTranscribing}
            onClick={() => {
              const scope = scopedRelease
                ? { id: scopedRelease.id, title: scopedRelease.title, daysToRelease: daysUntil(scopedRelease.releaseDate) }
                : null;
              void import('@/stores/useVoiceCallStore').then((m) => m.useVoiceCallStore.getState().openCall(scope));
            }}
          />
        ) : null}
        <button
          type="submit"
          aria-label="Send"
          disabled={
            (!input.trim() && attach.attachments.length === 0) ||
            attach.pending > 0 ||
            isThinking ||
            isRecording ||
            isTranscribing
          }
          className={SEND_BUTTON_CLASS}
        >
          {isThinking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowUp className={SEND_ARROW_CLASS} aria-hidden="true" />
          )}
        </button>
      </div>
      {voice.error ? (
        <p role="status" className="mt-2 px-2 text-center text-xs text-content-tertiary">
          {voice.error}
        </p>
      ) : null}
      {attach.error ? (
        // role="alert": the person just did something and it did not work.
        <p role="alert" className="mt-2 px-2 text-center text-xs text-status-error">
          {attach.error}
        </p>
      ) : null}
    </form>
  );

  // Empty landing: one plain question plus the composer — the same shape
  // every mainstream AI chat box has settled on (ChatGPT, Claude, Gemini's
  // "Any new ideas to explore?", Perplexity's "What do you want to know?").
  // No greeting, no eyebrow. Quick-action chips render below the box, but
  // ONLY at lg+: on a phone they were the "recommends" cluttering a screen
  // that already has a keyboard eating half of it, so below lg the box and
  // its one question are the entire surface.
  //
  // THE QUESTION AND THE COMPOSER ARE TWO INDEPENDENT REGIONS ON THE PAGE
  // VARIANT, and that is the entire point — do not merge them back into one
  // positioned block. Three attempts (2026-08-17) did exactly that and all
  // three were rejected: bottom-anchoring the pair dragged the question down
  // with it, dead-centering the pair left the composer floating mid-screen,
  // and biasing the pair ~2/3 down with unequal flex spacers still left a
  // dead band beneath it. Measured against the Gemini reference, the two are
  // simply not adjacent: the composer is pinned hard to the bottom edge and
  // the question is centered in the space ABOVE it, with a large gap
  // between. So: a `flex-1` region owns the question, a `shrink-0` sibling
  // owns the composer. This is the same structure the active-conversation
  // branch below already uses, which is also why the composer no longer
  // jumps when the first message is sent.
  //
  // The compact dock/rail panel (`panel` variant) keeps bottom-anchoring the
  // pair instead — it has its own footer to sit just above, and a full-height
  // split would strand the question at the top of a ~380px box.
  if (!hasMessages && emptyHero && !isPanel) {
    // The swipe navigation's empty Main (URG-380): the question sits low, just
    // above wrapped prompts and the composer. Chips wrap, never scroll sideways
    // (the pager owns horizontal swipes).
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1" />
        <div className="shrink-0 pb-4">
          {headingLevel === 'h2' ? (
            <h2 className="font-display text-[28px] leading-tight text-content-primary">{emptyHero.title}</h2>
          ) : (
            <h1 className="font-display text-[28px] leading-tight text-content-primary">{emptyHero.title}</h1>
          )}
          <p className="mb-[18px] mt-2 text-[14.5px] text-content-primary/55">{emptyHero.subtitle}</p>
          <div className="flex flex-wrap gap-x-1.5 gap-y-[7px]">
            {emptyHero.prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendUserTurn(prompt)}
                className="motion-focus motion-press inline-flex h-9 items-center rounded-full border border-content-primary/[0.14] px-3 text-[13.5px] text-content-primary/[0.88] transition-colors hover:border-brand/60 hover:bg-brand/[0.08]"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
        {inputForm ? <div className="shrink-0">{inputForm}</div> : null}
      </div>
    );
  }

  if (!hasMessages) {
    // The chips row is shared by both branches below (`hidden lg:flex`): the
    // side rail also mounts variant="panel" at lg+ (ChappiSidePanel), so
    // "chips visible at lg+" must not become "chips visible on the page
    // variant only" — that would silently drop them from the rail.
    const chipsRow = (
      <div className="mt-4 hidden flex-wrap items-center justify-center gap-2 lg:flex">
        {CHAPPI_CHIPS.map((chip) => {
          const Icon = CHIP_ICONS[chip.id] ?? DEFAULT_CHIP_ICON;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleChipClick(chip)}
              title={CHIP_DESCRIPTIONS[chip.id]}
              className="motion-focus motion-press inline-flex items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary"
            >
              <Icon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              {chip.label}
            </button>
          );
        })}
      </div>
    );
    if (isPanel) {
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-end overflow-y-auto px-2 pb-2 pt-4 text-center">
          <h1 className="font-display text-base font-semibold tracking-tight text-content-primary">
            What do you want to get done today?
          </h1>
          <div className="mt-3 w-full max-w-2xl">{inputForm}</div>
          {chipsRow}
        </div>
      );
    }
    // Two independent regions below lg, NOT one positioned block — that part
    // of the fix stands: a phone still gets the composer pinned hard to the
    // bottom edge with the question centered in the space above it (see the
    // history above for why). At lg+ (2026-08-18, founder call: the desktop
    // page read as "the box is stuck at the bottom" against the Gemini/
    // Perplexity/ChatGPT reference, where the question+box pair sits as ONE
    // group vertically centered on the page, not split into two flex regions
    // that shove the composer to the container's bottom edge), the header
    // region drops its `flex-1` growth (`lg:flex-none`) so it no longer
    // consumes all the leftover height, and the outer column gains
    // `lg:justify-center` so the now content-sized header+footer pair centers
    // as a group instead. Below lg none of the `lg:` classes apply, so mobile
    // is byte-for-byte the same layout as before.
    return (
      <div className="flex h-full min-h-0 flex-col px-2 text-center lg:justify-center">
        {/* The question sits inside the SAME flex-1 region: the two-region
            split below is what three rejected attempts landed on. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto lg:flex-none lg:overflow-visible">
          {/* One block, so the question glides with the keyboard as one piece
              instead of snapping half a screen (morph-urgans-hero, globals.css;
              KeyboardViewportBridge runs the move in a view transition). */}
          <div className="morph-urgans-hero flex flex-col items-center gap-4">
            {headingLevel === 'h2' ? (
              <h2 className="font-display text-xl font-semibold tracking-tight text-content-primary sm:text-2xl">
                What do you want to get done today?
              </h2>
            ) : (
              <h1 className="font-display text-xl font-semibold tracking-tight text-content-primary sm:text-2xl">
                What do you want to get done today?
              </h1>
            )}
          </div>
        </div>
        <div className="mt-3 shrink-0 lg:mt-6">
          <div className="morph-urgans-composer mx-auto w-full max-w-2xl">{inputForm}</div>
          {chipsRow}
        </div>
      </div>
    );
  }

  // Active conversation — the Claude-desktop shape (founder call,
  // 2026-07-23): a NARROW centered column (the transcript never expands to
  // the full page width), no greeting/name header once chatting has begun,
  // and the input pinned to the bottom of the surface. The only chrome is a
  // quiet "New chat" reset at the top of the column (the dock variant skips
  // it — its own header carries reset/expand/close).
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* overscroll-contain stops the transcript's scroll from chaining to
          the page on mobile — the input never rides away (Claude-app
          mechanics, founder call, 2026-07-23). */}
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* The transcript starts at the TOP and grows down (founder call,
            2026-08-16), the shape every assistant people already use has.
            This REVERSES the messenger anchoring of 2026-07-23, which was
            `min-h-full` + `justify-end`: the first messages sat right above
            the composer and the column grew upward. Both read fine once the
            conversation is long enough to scroll — the difference is the
            first few turns, which used to hang at the bottom of an empty
            column. Don't restore the old pair without a fresh call; the
            auto-scroll below still follows the newest reply either way. */}
        <div className={`mx-auto flex w-full flex-col ${isPanel ? '' : 'max-w-[46rem] px-1'}`}>
          <Transcript
            trailing={trailing}
            trailingAt={trailingAt}
            markMessages={Boolean(emptyHero)}
            messages={messages}
            isThinking={isThinking}
            previewText={previewText}
            suggestions={reply?.suggestions}
            onSuggestion={sendUserTurn}
            bottomRef={bottomRef}
            revealMessageId={revealMessageId}
            retryMessageId={canRetry ? lastMessage?.id ?? null : null}
            onRetry={handleRetry}
            pendingConfirmation={pendingConfirmation}
            onApproveConfirmation={(extraArgs) => void handleApproveConfirmation(extraArgs)}
            onCancelConfirmation={handleCancelConfirmation}
            coverArtUpload={
              coverArtRelease
                ? { releaseId: coverArtRelease.id, releaseTitle: coverArtRelease.title }
                : null
            }
            onCoverArtUploaded={handleCoverArtUploaded}
            onDismissCoverArtUpload={() => setCoverArtReleaseId(null)}
            recap={
              recapRelease
                ? { releaseId: recapRelease.id, releaseTitle: recapRelease.title }
                : null
            }
            onDismissRecap={() => setRecapReleaseId(null)}
            onReportRecap={handleReportRecap}
            ideas={ideasRelease ? { releaseId: ideasRelease.id, releaseTitle: ideasRelease.title, suggest: ideasSuggest } : null}
            ideasVersion={messages.length}
            projectOffer={projectOffer}
            onProjectOfferChoice={handleProjectOfferChoice}
          />
        </div>
      </div>

      {/* The composer sits on a frosted ground the transcript scrolls UNDER
          (founder call, 2026-10-20): the wrapper pulls up over the last 40px
          of the scroller (-mt-10; the bottom sentinel is 48px tall so a
          message scrolled to the end still clears it), and its top padding
          puts the pill back exactly where it was (52px = the 40px overlap plus
          the old 12px gap). The ground fades from clear to the page colour
          over that padding and blurs what passes beneath, the way the phone's
          bottom bar already does, so the box reads as part of the
          conversation rather than a form stuck to it. The panel variant
          fades to its card's surface instead of the page. backdrop-filter
          makes this wrapper the containing block for fixed descendants; the
          scope and attach menus are absolute, which it does not affect. */}
      <div
        className={`relative z-10 -mt-10 shrink-0 bg-gradient-to-t pt-[3.25rem] backdrop-blur-xl ${
          isPanel ? 'from-bg-surface via-bg-surface/90 to-transparent' : 'from-bg-base via-bg-base/90 to-transparent'
        }`}
      >
        {awayFromLatest ? (
          // The way back down: one round button in the frost's top edge, the
          // same material as the pill. Only while the newest message is out of
          // reach, so a short chat never shows it.
          // Centred with auto margins, never a transform: the fade-up keyframe
          // ends on transform: translateY(0) and would cancel a translateX.
          <button
            type="button"
            onClick={scrollToLatest}
            aria-label="Scroll to the latest message"
            className="motion-focus motion-press absolute inset-x-0 top-1 z-20 mx-auto grid h-9 w-9 place-items-center rounded-full border border-stroke-default bg-bg-surface/80 text-content-primary shadow-md backdrop-blur-xl transition-colors hover:bg-bg-elevated animate-in"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <div className={`mx-auto w-full ${isPanel ? '' : 'max-w-[46rem] px-1'}`}>
          {/* Phase 3 nudge: only once UrgAns has actually answered ("when
              AI answers in a team with an empty brief", per the spec) —
              never on the empty landing, never mid-question. Above the
              composer so it is visible without scrolling; the component
              itself decides whether it has anything to say. */}
          {messages.some((message) => message.role === 'assistant') ? <TeamBriefNudge /> : null}
          {saveNotice ? (
            <p role="status" className="mb-2 px-2 text-center text-xs text-content-tertiary">
              {SAVE_NOTICE_COPY[saveNotice]}
            </p>
          ) : null}
          {inputForm}
        </div>
      </div>
    </div>
  );
}

type TranscriptProps = {
  /** See ChappiConversationProps.trailing. */
  trailing?: ReactNode;
  trailingAt?: number;
  /** Swipe navigation only (URG-380): draw data-message-id on each turn so a
   *  ?m=<id> link can find it. Off everywhere else, so the DOM is unchanged. */
  markMessages?: boolean;
  messages: ChappiMessage[];
  isThinking: boolean;
  /** The reply as it is being written; '' when nothing has streamed. */
  previewText: string;
  suggestions?: string[];
  onSuggestion: (suggestion: string) => void;
  bottomRef: RefObject<HTMLDivElement | null>;
  /** Assistant message that gets the word-by-word reveal (arrived while this
   * surface was mounted); null = render everything plain. */
  revealMessageId: string | null;
  /** Assistant message the Retry action applies to (always the transcript's
   * last message, when retryable); null hides the action. */
  retryMessageId: string | null;
  onRetry: () => void;
  /** A gated action the model proposed and nobody has approved yet. */
  pendingConfirmation: ChappiPendingConfirmation | null;
  onApproveConfirmation: (extraArgs?: Record<string, unknown>) => void;
  onCancelConfirmation: () => void;
  /** A cover art picker the assistant put in the log; null when there isn't one. */
  coverArtUpload: { releaseId: string; releaseTitle: string } | null;
  onCoverArtUploaded: (coverArt: ReleaseCoverArt) => void;
  onDismissCoverArtUpload: () => void;
  /** A finished recap poster the assistant put in the log, ready to save. */
  recap: { releaseId: string; releaseTitle: string } | null;
  onDismissRecap: () => void;
  onReportRecap: (message: string) => void;
  /** The ideas card add_rollout_idea asked for, and the transcript length it reloads on. */
  ideas: { releaseId: string; releaseTitle: string; suggest: string | null } | null;
  ideasVersion: number;
  /** The next jobs on a project, offered as chips (add_to_record). */
  projectOffer: ProjectOffer | null;
  onProjectOfferChoice: (choice: ProjectOfferChoice) => Promise<void>;
};

/**
 * The scrolling conversation log — Claude-style (founder call, 2026-07-23):
 * no "You" / "Chappi" role labels. The user's turns sit right-aligned in
 * soft rounded bubbles; the assistant's replies are plain text flowing the
 * column's width, each followed by a quiet action row (copy / retry /
 * thumbs — the streamed-answer pattern, 2026-08-12). Streamlined and quiet.
 */
function Transcript({
  trailing = null,
  trailingAt,
  markMessages = false,
  messages,
  isThinking,
  previewText,
  suggestions,
  onSuggestion,
  bottomRef,
  revealMessageId,
  retryMessageId,
  onRetry,
  pendingConfirmation,
  onApproveConfirmation,
  onCancelConfirmation,
  coverArtUpload,
  onCoverArtUploaded,
  onDismissCoverArtUpload,
  recap,
  onDismissRecap,
  onReportRecap,
  ideas,
  ideasVersion,
  projectOffer,
  onProjectOfferChoice,
}: TranscriptProps) {
  return (
    <div className="space-y-5 pb-2">
      {trailing && trailingAt !== undefined && trailingAt <= 0 ? trailing : null}
      {messages.map((message, index) => (
        <Fragment key={message.id}>
        {message.role === 'user' ? (
          <div data-message-id={markMessages ? message.id : undefined} className="flex justify-end">
            <div className="flex max-w-[85%] flex-col items-end">
              {message.attachments?.length ? (
                <ChappiMessageAttachments attachments={message.attachments} />
              ) : null}
              {/* The stand-in text for a message sent with only a picture is the
                  same words as the chips above it, so it is not shown twice. */}
              {isAttachmentOnlyContent(message.content, message.attachments) ? null : (
                <div className="whitespace-pre-wrap rounded-2xl rounded-br-md border border-brand/25 bg-brand/15 px-4 py-2.5 text-sm leading-6 text-content-primary">
                  {message.content}
                </div>
              )}
            </div>
          </div>
        ) : (
          <AssistantMessage
            messageId={markMessages ? message.id : undefined}
            content={message.content}
            reveal={message.id === revealMessageId}
            onRetry={message.id === retryMessageId ? onRetry : undefined}
            briefSections={message.briefSections}
          />
        )}
        {trailing && trailingAt !== undefined && trailingAt === index + 1 ? trailing : null}
        </Fragment>
      ))}
      {trailing && (trailingAt === undefined || trailingAt > messages.length) ? trailing : null}

      {isThinking && previewText ? (
        // Hidden from assistive technology on purpose: the finished reply is
        // announced by the live region below when it arrives, and reading out a
        // sentence that is still changing is noise.
        <div className="flex">
          <div aria-hidden="true" className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-stroke-default bg-bg-surface px-4 py-3 text-sm leading-7 text-content-primary">
            <ReplyText content={previewText} reveal={false} />
          </div>
        </div>
      ) : null}
      {isThinking && !previewText ? (
        <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-tertiary">
          Thinking…
        </div>
      ) : null}

      {/* The permission gate. Sits below the reply that proposed it and above
          Follow-ups, so it reads as this turn's outstanding question. Hidden
          while a request is in flight — the card's own buttons own that
          moment. Nothing has executed while this is on screen. */}
      {pendingConfirmation && !isThinking ? (
        <ChappiConfirmationCard
          pending={pendingConfirmation}
          onApprove={onApproveConfirmation}
          onCancel={onCancelConfirmation}
          isBusy={isThinking}
        />
      ) : null}

      {/* The cover art picker. Below the reply that offered it, like the
          permission card above — but NOT hidden while a request is in flight:
          an upload runs entirely in the browser, so the user can keep talking
          while the file goes up. Keyed by release so switching the card to a
          different one resets its internal upload state. */}
      {coverArtUpload ? (
        <ChappiCoverArtUploadCard
          key={coverArtUpload.releaseId}
          releaseId={coverArtUpload.releaseId}
          releaseTitle={coverArtUpload.releaseTitle}
          onUploaded={onCoverArtUploaded}
          onDismiss={onDismissCoverArtUpload}
        />
      ) : null}

      {/* The finished recap poster. Keyed by release for the same reason the
          pickers above are: switching it to another release must reset the
          size toggle and re-fetch that release's own images, not paint the
          previous one's under a new title. */}
      {recap ? (
        <ChappiRecapCard
          key={recap.releaseId}
          releaseId={recap.releaseId}
          releaseTitle={recap.releaseTitle}
          onDismiss={onDismissRecap}
          onReport={onReportRecap}
        />
      ) : null}

      {ideas ? (
        <ChappiIdeasCard
          key={ideas.releaseId}
          releaseId={ideas.releaseId}
          releaseTitle={ideas.releaseTitle}
          suggest={ideas.suggest}
          version={ideasVersion}
        />
      ) : null}

      {projectOffer ? (
        <ChappiProjectOfferCard key={projectOffer.recordId} offer={projectOffer} onChoose={onProjectOfferChoice} />
      ) : null}

      {/* Follow-ups — a titled list of full-width rows (the streamed-answer
          pattern, 2026-08-12), replacing the earlier floating pills: rows
          read as "next questions to ask" rather than tags, and the ↵ mark
          says "this sends" without any copy. Same data + click behavior. */}
      {suggestions?.length ? (
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-content-tertiary">
            Follow-ups
          </p>
          <div className="mt-1 divide-y divide-stroke-subtle">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestion(suggestion)}
                className="motion-focus flex w-full items-center gap-2.5 py-2.5 text-left text-sm text-content-secondary transition-colors hover:text-content-primary"
              >
                <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden="true" />
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div ref={bottomRef} className="h-12 shrink-0" aria-hidden="true" />

      {/* Screen readers: the transcript changes under a composer that keeps
          focus, so one stable live region carries what just happened. It is
          the last child so the visible column's spacing is untouched. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {describeTranscriptAnnouncement({
          isThinking,
          pendingConfirmation: pendingConfirmation ?? null,
          lastAssistantContent:
            [...messages].reverse().find((message) => message.role === 'assistant')?.content ?? null,
        })}
      </div>
    </div>
  );
}

/**
 * One assistant reply: the (optionally revealed) text plus its action row.
 * Owns its own copy/feedback state so a transcript of many replies doesn't
 * lift per-message UI state anywhere shared.
 */
function AssistantMessage({
  messageId,
  content,
  reveal,
  onRetry,
  briefSections,
}: {
  /** Drawn as data-message-id on the turn's own box (no wrapper), so a
   *  ?m=<id> link can find it (URG-380). */
  messageId?: string;
  content: string;
  reveal: boolean;
  onRetry?: () => void;
  briefSections?: string[];
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const stopSpeechRef = useRef<(() => void) | null>(null);
  // Cleared on unmount so a copy right before navigating can't set state on
  // a dead component.
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      // Leaving the chat (or a new chat replacing this reply) silences it.
      stopSpeechRef.current?.();
    };
  }, []);
  // Browser support is only known after mount, so the server and client render
  // the same markup first and the button appears once speech is confirmed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanSpeak(isSpeechSupported() && speechChunksForReply(content).length > 0);
  }, [content]);

  const handleSpeak = () => {
    if (speaking) {
      stopSpeechRef.current?.();
      return;
    }
    const chunks = speechChunksForReply(content);
    if (chunks.length === 0) return;
    captureAnalyticsEvent({ name: 'urgans_reply_action', properties: { action: 'speak' } });
    setSpeaking(true);
    stopSpeechRef.current = speakChunks(chunks, document.documentElement.lang || 'en-US', () => {
      stopSpeechRef.current = null;
      setSpeaking(false);
    });
  };

  const handleCopy = async () => {
    try {
      // Clean text, not the raw reply: a copied "**Setup:**" pasted into
      // WhatsApp or an email would show its asterisks literally there too.
      await navigator.clipboard.writeText(stripModelMarkup(content));
      captureAnalyticsEvent({ name: 'urgans_reply_action', properties: { action: 'copy' } });
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied (permissions, insecure context) — nothing to show;
      // the icon simply doesn't flip to the check.
    }
  };

  const handleFeedback = (rating: 'up' | 'down') => {
    // Re-clicking the same thumb is a no-op; switching sides re-captures.
    if (feedback === rating) return;
    setFeedback(rating);
    captureAnalyticsEvent({
      name: 'urgans_reply_action',
      properties: { action: rating === 'up' ? 'thumbs_up' : 'thumbs_down' },
    });
  };

  const actionButtonClass =
    'motion-focus grid h-7 w-7 place-items-center rounded-md text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary';

  return (
    <div className="max-w-[90%]" data-message-id={messageId}>
      <div className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-stroke-default bg-bg-surface px-4 py-3 text-sm leading-7 text-content-primary">
        <ReplyText content={content} reveal={reveal} />
      </div>
      {/* Attribution sits between the answer and the action row: it belongs to
          the answer, and placing it among copy/retry/thumbs would read as a
          fourth button. */}
      {briefSections?.length ? <BriefAttribution sections={briefSections} /> : null}
      {/* Quiet action row — tertiary ink, brightening on hover, same voice as
          the "New chat" control above the transcript. */}
      <div className="mt-1.5 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? 'Copied' : 'Copy reply'}
          title={copied ? 'Copied' : 'Copy'}
          className={actionButtonClass}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
        {canSpeak ? (
          <button
            type="button"
            onClick={handleSpeak}
            aria-label={speaking ? 'Stop reading aloud' : 'Read reply aloud'}
            aria-pressed={speaking}
            title={speaking ? 'Stop' : 'Listen'}
            className={`${actionButtonClass} ${speaking ? 'text-brand' : ''}`}
          >
            {/* A square while speaking, a speaker otherwise, so the state is
                not carried by colour alone. */}
            {speaking ? (
              <Square className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Regenerate this reply"
            title="Retry"
            className={actionButtonClass}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => handleFeedback('up')}
          aria-label="Good reply"
          aria-pressed={feedback === 'up'}
          title="Good reply"
          className={`${actionButtonClass} ${feedback === 'up' ? 'text-brand' : ''}`}
        >
          {/* Filled when chosen, so the state is not carried by colour alone. */}
          <ThumbsUp
            className="h-3.5 w-3.5"
            fill={feedback === 'up' ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => handleFeedback('down')}
          aria-label="Poor reply"
          aria-pressed={feedback === 'down'}
          title="Poor reply"
          className={`${actionButtonClass} ${feedback === 'down' ? 'text-brand' : ''}`}
        >
          <ThumbsDown
            className="h-3.5 w-3.5"
            fill={feedback === 'down' ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
