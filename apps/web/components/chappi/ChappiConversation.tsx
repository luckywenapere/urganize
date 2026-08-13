'use client';

import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  ClipboardList,
  Disc3,
  Layers,
  Loader2,
  NotebookPen,
  PiggyBank,
  RotateCcw,
  Rocket,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { ChappiBetaBadge } from '@/components/chappi/ChappiBetaBadge';
import { ChappiScopePicker } from '@/components/chappi/ChappiScopePicker';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { supabase } from '@/lib/supabase/client';
import { CHAPPI_CHIPS, buildHelpReply, resolveIntent } from '@/lib/chappi/intent-router';
import type {
  ChappiChip,
  ChappiClientAction,
  ChappiIntent,
  ChappiMessage,
  ChappiReply,
  ChappiResponse,
} from '@/lib/chappi/types';

type ChappiConversationProps = {
  /** Opens the CreateReleaseModal owned by the mounting surface. */
  onNewRelease: () => void;
  /**
   * Layout variant.
   * - 'page' (default): the full /dashboard/urgans surface — centered
   *   PostHog-style empty state, header row with greeting + New conversation.
   * - 'panel': the floating ChappiDock — compact top-aligned empty state and
   *   NO internal header (the dock's own header owns title/reset/expand/
   *   close), sized for a ~380px column.
   */
  variant?: 'page' | 'panel';
};

// Icons live here, not in the client-safe intent-router lib (icons are React
// nodes). Keyed by chip id (not intent) so the three plan_release chips can
// each get their own distinct glyph instead of sharing one. Sparkles is the
// fallback for any chip id without an entry.
const DEFAULT_CHIP_ICON: LucideIcon = Sparkles;
const CHIP_ICONS: Record<string, LucideIcon> = {
  'new-release': Disc3,
  'plan-single-6w': Rocket,
  'plan-ep': Layers,
  'plan-small-budget': PiggyBank,
  'add-task': ClipboardList,
  'take-note': NotebookPen,
};

// Hover tooltip (title attr) for each quick-action button — the "clicks"
// this page exists to preserve, kept compact per the PostHog-style landing.
const CHIP_DESCRIPTIONS: Record<string, string> = {
  'new-release': 'Start a new release with a rollout plan',
  'plan-single-6w': 'Answer a few questions and get a draft rollout plan',
  'plan-ep': 'Answer a few questions and get a draft rollout plan',
  'plan-small-budget': 'Answer a few questions and get a draft rollout plan',
  'add-task': 'Create an activity for one of your releases',
  'take-note': 'Park a thought before it gets away',
};

/** A date `weeks` from today, as YYYY-MM-DD. Module scope for the same reason
 * nextMessageId is: the clock must not be read during render. */
function ymdWeeksFromNow(weeks: number): string {
  return new Date(Date.now() + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
}

function greetingPrefix(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

// Module-scope id generator: keeps impure Date.now() out of component scope
// (react-hooks/purity), and the counter guarantees uniqueness even when two
// turns land in the same millisecond (e.g. a chip's user+assistant pair).
let messageSeq = 0;
function nextMessageId(role: 'u' | 'a'): string {
  messageSeq += 1;
  return `${Date.now()}-${messageSeq}-${role}`;
}

/**
 * Chappi's full conversation surface — lives on its own page
 * (`/dashboard/urgans`), separate from the release/task workspace, so a long
 * conversation never pushes releases/tasks down the page.
 *
 * Two states, switched on `messages.length`:
 *  - Empty: PostHog-home-style landing — centered greeting, the input
 *    mid-screen, and the quick-action buttons (the "clicks" — New release
 *    or the three planner chips, plus Add activity) directly BELOW the box.
 *  - Active: a scrolling transcript of every turn, chip-triggered or typed,
 *    with the input pinned at the bottom.
 *
 * Chips run deterministic app actions instantly (no round-trip) and are
 * recorded as a turn either way. Free-text goes to the agent backend
 * (/api/urgans) with the FULL conversation history; when the model isn't
 * configured — or the call fails — it falls back to the local keyword
 * intent-router, so the page always does something useful.
 */
export function ChappiConversation({ onNewRelease, variant = 'page' }: ChappiConversationProps) {
  const isPanel = variant === 'panel';
  const router = useRouter();
  const { user } = useAuthStore();
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
    reset,
    scopedReleaseId,
    setScopedReleaseId,
  } = useChappiStore();
  // The release the conversation is pinned to (scope picker under the
  // composer). Falls back to null if the id no longer resolves (deleted
  // release, stale store) so the scope silently degrades to "All releases".
  const scopedRelease = scopedReleaseId
    ? releases.find((release) => release.id === scopedReleaseId) ?? null
    : null;
  const { openQuickCreate, openTask } = useTaskUI();
  const [isThinking, setIsThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const firstName = user?.name ? user.name.split(' ')[0] : null;
  const greeting = firstName
    ? `${greetingPrefix(new Date())}, ${firstName}`
    : greetingPrefix(new Date());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isThinking]);

  // Appends only the ASSISTANT side of a turn. Callers own appending the
  // user side (a chip's label, or the typed prompt) — keeps each turn
  // recorded exactly once regardless of which path produced it.
  const appendAssistantReply = (replyText: string, replyMeta?: ChappiReply) => {
    appendMessage({ id: nextMessageId('a'), role: 'assistant', content: replyText });
    setReply(replyMeta ?? { text: replyText });
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

  // Deterministic intent handling — chips, and the AI-off fallback for prompts.
  const handleIntent = (intent: ChappiIntent) => {
    switch (intent.kind) {
      case 'new_release':
        onNewRelease();
        appendAssistantReply("Let's set up a new release — the form is open.");
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
          "Let's plan it. Seven quick questions, then I'll draft your rollout."
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
          appendAssistantReply("You're all caught up — nothing needs your attention right now.");
        }
        return;
      case 'generate_status': {
        const target =
          scopedRelease?.id ??
          todaysDirective?.releaseId ??
          (releases.length === 1 ? releases[0]?.id : null);
        if (target) {
          router.push(`/dashboard?release=${target}`);
          appendAssistantReply(
            'Taking you to the release — use "Generate status update" there.'
          );
        } else {
          appendAssistantReply(
            'Open a release first, then generate its status update from the release page.'
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
        // create() resolves to null on a failed write rather than throwing, so
        // the value is the success check; catch only covers a network throw.
        void useNotesStore
          .getState()
          .create({ body, releaseId })
          .then((note) => {
            appendAssistantReply(
              note
                ? scopedRelease
                  ? `Saved to Notes, under ${scopedRelease.title}.`
                  : 'Saved to Notes.'
                : "Couldn't save that note. Try again, or open Notes and write it there."
            );
          })
          .catch(() => {
            appendAssistantReply(
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
    appendMessage({ id: nextMessageId('u'), role: 'user', content: chip.label });
    handleIntent({ kind: chip.intent, plannerPreset: chip.plannerPreset });
  };

  // Client-side actions the agent asks us to perform.
  const executeClientActions = (actions: ChappiClientAction[]) => {
    for (const action of actions) {
      if (action.type === 'navigate') router.push(action.href);
      else if (action.type === 'open_create_release') onNewRelease();
      else if (action.type === 'open_quick_create')
        openQuickCreate({ releaseId: action.releaseId ?? undefined, source: 'quick_create' });
      else if (action.type === 'refresh') void loadCommandCenter({ force: true });
    }
  };

  const runDeterministic = (prompt: string) => handleIntent(resolveIntent(prompt));

  const submitPrompt = async (prompt: string, historyForApi: ChappiMessage[]) => {
    setIsThinking(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        runDeterministic(prompt);
        return;
      }
      const response = await fetch('/api/urgans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: historyForApi,
          releaseScope: scopedRelease
            ? { id: scopedRelease.id, title: scopedRelease.title }
            : undefined,
        }),
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => null)) as ChappiResponse | null;

      if (response.ok && data?.mode === 'agent') {
        appendAssistantReply(data.reply);
        executeClientActions(data.clientActions);
        return;
      }
      if (data?.mode === 'error') {
        appendAssistantReply(data.error);
        return;
      }
      // Deterministic mode (model not configured) or any unexpected shape:
      // fall back to the local intent router.
      runDeterministic(prompt);
    } catch {
      runDeterministic(prompt);
    } finally {
      setIsThinking(false);
    }
  };

  // Appends the user turn immediately (so it appears without waiting on the
  // round-trip), then sends the FULL prior history + this turn to the agent
  // — /api/urgans already accepts and expects multi-turn `messages`.
  const sendUserTurn = (text: string) => {
    const userMessage: ChappiMessage = { id: nextMessageId('u'), role: 'user', content: text };
    const historyForApi = [...messages, userMessage];
    appendMessage(userMessage);
    void submitPrompt(text, historyForApi);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;
    setInput('');
    sendUserTurn(trimmed);
  };

  // One input, two positions: centered mid-screen on the empty landing
  // (PostHog-home style), pinned at the bottom once a conversation exists —
  // the Claude-desktop shape (founder call, 2026-07-23).
  const inputForm = (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="rounded-2xl border border-stroke-default bg-bg-surface px-3 py-2 transition-colors focus-within:border-brand">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask UrgAns or type a command…"
            aria-label="Message UrgAns"
            disabled={isThinking}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-content-primary placeholder:text-content-tertiary focus:outline-none disabled:opacity-60 sm:text-sm"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || isThinking}
            className="motion-press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-content-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isThinking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {/* Scope row — Linear-style release context picker (founder call,
            2026-07-23): pick which release this conversation is about. Sits
            inside the composer, under the text line; hidden while the user
            has no releases (the picker renders null). */}
        <div className="mt-1 flex justify-start">
          <ChappiScopePicker
            releases={releases}
            scopedReleaseId={scopedReleaseId}
            onSelect={setScopedReleaseId}
          />
        </div>
      </div>
    </form>
  );

  // Empty landing: centered greeting → input → quick actions BELOW the box
  // (compact icon+label buttons, screenshot-style). No header row, no
  // bottom-pinned input — the whole surface is one centered column.
  if (!hasMessages) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col items-center px-2 text-center ${
          // The dock panel bottom-anchors its empty state (founder call,
          // 2026-07-23) — greeting, input, and chips sit right above the
          // footer like a chat, not suspended at the top of the panel.
          isPanel ? 'justify-end overflow-y-auto pb-2 pt-4' : 'justify-center'
        }`}
      >
        {/* The dock's own header already says "UrgAns"; the page shows the
            eyebrow itself. */}
        {isPanel ? null : (
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            UrgAns
            <ChappiBetaBadge />
          </p>
        )}
        <h1
          className={`font-display font-semibold tracking-tight text-content-primary ${
            isPanel ? 'text-lg' : 'mt-3 text-3xl sm:text-4xl'
          }`}
        >
          {greeting}
        </h1>
        <div className={`w-full max-w-2xl ${isPanel ? 'mt-4' : 'mt-6'}`}>{inputForm}</div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
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
    <div className="flex h-full min-h-0 flex-col">
      {/* overscroll-contain stops the transcript's scroll from chaining to
          the page on mobile — the input never rides away (Claude-app
          mechanics, founder call, 2026-07-23). */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* min-h-full + justify-end anchors the conversation to the BOTTOM
            (founder call, 2026-07-23): the first messages sit right above
            the input like a messenger, growing upward until the column
            fills, then scrolling normally. */}
        <div className={`mx-auto flex min-h-full w-full flex-col justify-end ${isPanel ? '' : 'max-w-[46rem] px-1'}`}>
          {isPanel ? null : (
            <div className="flex shrink-0 justify-end pb-3 pt-1">
              <button
                type="button"
                onClick={reset}
                className="motion-focus inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                New chat
              </button>
            </div>
          )}
          <Transcript
            messages={messages}
            isThinking={isThinking}
            suggestions={reply?.suggestions}
            onSuggestion={sendUserTurn}
            bottomRef={bottomRef}
          />
        </div>
      </div>

      <div className="mt-3 shrink-0">
        <div className={`mx-auto w-full ${isPanel ? '' : 'max-w-[46rem] px-1'}`}>{inputForm}</div>
      </div>
    </div>
  );
}

type TranscriptProps = {
  messages: ChappiMessage[];
  isThinking: boolean;
  suggestions?: string[];
  onSuggestion: (suggestion: string) => void;
  bottomRef: RefObject<HTMLDivElement | null>;
};

/**
 * The scrolling conversation log — Claude-style (founder call, 2026-07-23):
 * no "You" / "Chappi" role labels. The user's turns sit right-aligned in
 * soft rounded bubbles; the assistant's replies are plain text flowing the
 * column's width. Streamlined and quiet.
 */
function Transcript({ messages, isThinking, suggestions, onSuggestion, bottomRef }: TranscriptProps) {
  return (
    <div className="space-y-5 pb-2">
      {messages.map((message) =>
        message.role === 'user' ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bg-elevated px-4 py-2.5 text-sm leading-6 text-content-primary">
              {message.content}
            </div>
          </div>
        ) : (
          <div
            key={message.id}
            className="whitespace-pre-wrap text-sm leading-7 text-content-primary"
          >
            {message.content}
          </div>
        )
      )}

      {isThinking ? (
        <div className="flex items-center gap-2 text-sm text-content-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Thinking…
        </div>
      ) : null}

      {suggestions?.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="motion-focus rounded-full border border-stroke-default px-3 py-1 text-xs text-brand transition-colors hover:border-brand"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}
