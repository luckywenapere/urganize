'use client';

import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  Disc3,
  FileText,
  ListPlus,
  Loader2,
  RotateCcw,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { ChappiBetaBadge } from '@/components/chappi/ChappiBetaBadge';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { supabase } from '@/lib/supabase/client';
import { CHAPPI_CHIPS, buildHelpReply, resolveIntent } from '@/lib/chappi/intent-router';
import type {
  ChappiChip,
  ChappiChipIntent,
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
   * - 'page' (default): the full /dashboard/chappi surface — centered
   *   PostHog-style empty state, header row with greeting + New conversation.
   * - 'panel': the floating ChappiDock — compact top-aligned empty state and
   *   NO internal header (the dock's own header owns title/reset/expand/
   *   close), sized for a ~380px column.
   */
  variant?: 'page' | 'panel';
};

// Icons live here, not in the client-safe intent-router lib (icons are React
// nodes). Keyed by chip intent so the two can't drift.
const CHIP_ICONS: Record<ChappiChipIntent, LucideIcon> = {
  new_release: Disc3,
  add_task: ListPlus,
  todays_focus: Target,
  generate_status: FileText,
};

// Hover tooltip (title attr) for each quick-action button — the "clicks"
// this page exists to preserve, kept compact per the PostHog-style landing.
const CHIP_DESCRIPTIONS: Record<ChappiChipIntent, string> = {
  new_release: 'Start a new release with a rollout plan',
  add_task: 'Create an activity for one of your releases',
  todays_focus: "See what needs your attention right now",
  generate_status: 'Draft a status update for a release',
};

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
 * (`/dashboard/chappi`), separate from the release/task workspace, so a long
 * conversation never pushes releases/tasks down the page.
 *
 * Two states, switched on `messages.length`:
 *  - Empty: PostHog-home-style landing — centered greeting, the input
 *    mid-screen, and the 4 quick-action buttons (the "clicks" — New release,
 *    Add task, Today's focus, Generate status) directly BELOW the box.
 *  - Active: a scrolling transcript of every turn, chip-triggered or typed,
 *    with the input pinned at the bottom.
 *
 * Chips run deterministic app actions instantly (no round-trip) and are
 * recorded as a turn either way. Free-text goes to the agent backend
 * (/api/chappi) with the FULL conversation history; when the model isn't
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
  const { input, setInput, reply, setReply, messages, appendMessage, reset } = useChappiStore();
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

  // Deterministic intent handling — chips, and the AI-off fallback for prompts.
  const handleIntent = (intent: ChappiIntent) => {
    switch (intent.kind) {
      case 'new_release':
        onNewRelease();
        appendAssistantReply("Let's set up a new release — the form is open.");
        return;
      case 'add_task':
        // 'quick_create' is the canonical source; TaskCreateSource has no
        // 'chappi' member and adding one is out of scope.
        openQuickCreate({ source: 'quick_create' });
        appendAssistantReply('Opening a new activity.');
        return;
      case 'todays_focus':
        if (todaysDirective) {
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
          todaysDirective?.releaseId ?? (releases.length === 1 ? releases[0]?.id : null);
        if (target) {
          router.push(`/dashboard/releases/${target}`);
          appendAssistantReply(
            'Taking you to the release — use "Generate status update" on its page.'
          );
        } else {
          appendAssistantReply(
            'Open a release first, then generate its status update from the release page.'
          );
        }
        return;
      }
      case 'help':
      default: {
        const helpReply = buildHelpReply();
        appendAssistantReply(helpReply.text, helpReply);
      }
    }
  };

  const handleChipClick = (chip: ChappiChip) => {
    appendMessage({ id: nextMessageId('u'), role: 'user', content: chip.label });
    handleIntent({ kind: chip.intent });
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
      const response = await fetch('/api/chappi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: historyForApi }),
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
  // — /api/chappi already accepts and expects multi-turn `messages`.
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
      <div className="flex items-center gap-2 rounded-2xl border border-stroke-default bg-bg-surface px-3 py-2 transition-colors focus-within:border-brand">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask Chappi or type a command…"
          aria-label="Message Chappi"
          disabled={isThinking}
          className="min-w-0 flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none disabled:opacity-60"
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
    </form>
  );

  // Empty landing: centered greeting → input → quick actions BELOW the box
  // (compact icon+label buttons, screenshot-style). No header row, no
  // bottom-pinned input — the whole surface is one centered column.
  if (!hasMessages) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col items-center px-2 text-center ${
          isPanel ? 'justify-start overflow-y-auto pt-4' : 'justify-center'
        }`}
      >
        {/* The dock's own header already says "Chappi"; the page shows the
            eyebrow itself. */}
        {isPanel ? null : (
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            Chappi
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
            const Icon = CHIP_ICONS[chip.intent];
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleChipClick(chip)}
                title={CHIP_DESCRIPTIONS[chip.intent]}
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
      <div className="min-h-0 flex-1 overflow-y-auto">
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
