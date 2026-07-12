'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Disc3, FileText, ListPlus, Loader2, Target, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { supabase } from '@/lib/supabase/client';
import { CHAPPI_CHIPS, buildHelpReply, resolveIntent } from '@/lib/chappi/intent-router';
import type {
  ChappiChipIntent,
  ChappiClientAction,
  ChappiIntent,
  ChappiResponse,
} from '@/lib/chappi/types';

type ChappiHeroProps = {
  /** Opens the CreateReleaseModal owned by WorkspaceView. */
  onNewRelease: () => void;
};

// Icons live here, not in the client-safe intent-router lib (icons are React
// nodes). Keyed by chip intent so the two can't drift.
const CHIP_ICONS: Record<ChappiChipIntent, LucideIcon> = {
  new_release: Disc3,
  add_task: ListPlus,
  todays_focus: Target,
  generate_status: FileText,
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

/**
 * Chappi front door. Chips run deterministic app actions instantly (no
 * round-trip). Free-text goes to the agent backend (/api/chappi); when the
 * model isn't configured — or the call fails — it falls back to the local
 * keyword intent-router, so the front door always does something useful.
 */
export function ChappiHero({ onNewRelease }: ChappiHeroProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const todaysDirective = useReleaseStore((state) => state.todaysDirective);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const { input, setInput, reply, setReply, appendMessage } = useChappiStore();
  const { openQuickCreate, openTask } = useTaskUI();
  const [isThinking, setIsThinking] = useState(false);

  const firstName = user?.name ? user.name.split(' ')[0] : null;
  const greeting = firstName
    ? `${greetingPrefix(new Date())}, ${firstName}`
    : greetingPrefix(new Date());

  // Deterministic intent handling — chips, and the AI-off fallback for prompts.
  const handleIntent = (intent: ChappiIntent) => {
    switch (intent.kind) {
      case 'new_release':
        onNewRelease();
        setReply({ text: "Let's set up a new release — the form is open." });
        return;
      case 'add_task':
        // 'quick_create' is the canonical source; TaskCreateSource has no
        // 'chappi' member and adding one is out of scope.
        openQuickCreate({ source: 'quick_create' });
        setReply({ text: 'Opening a new task.' });
        return;
      case 'todays_focus':
        if (todaysDirective) {
          openTask(todaysDirective.id);
          setReply({ text: `Today's focus: "${todaysDirective.title}". I've opened it for you.` });
        } else {
          setReply({ text: "You're all caught up — nothing needs your attention right now." });
        }
        return;
      case 'generate_status': {
        const target =
          todaysDirective?.releaseId ?? (releases.length === 1 ? releases[0]?.id : null);
        if (target) {
          router.push(`/dashboard/releases/${target}`);
          setReply({
            text: 'Taking you to the release — use "Generate status update" on its page.',
          });
        } else {
          setReply({
            text: 'Open a release first, then generate its status update from the release page.',
          });
        }
        return;
      }
      case 'help':
      default:
        setReply(buildHelpReply());
    }
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

  const submitPrompt = async (prompt: string) => {
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
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => null)) as ChappiResponse | null;

      if (response.ok && data?.mode === 'agent') {
        setReply({ text: data.reply });
        appendMessage({ id: `${Date.now()}-u`, role: 'user', content: prompt });
        appendMessage({ id: `${Date.now()}-a`, role: 'assistant', content: data.reply });
        executeClientActions(data.clientActions);
        return;
      }
      if (data?.mode === 'error') {
        setReply({ text: data.error });
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;
    setInput('');
    void submitPrompt(trimmed);
  };

  return (
    <section
      aria-label="Chappi assistant"
      className="mb-8 border border-stroke-default bg-bg-surface/60 p-5 sm:p-6"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Chappi</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">
        {greeting}
      </h1>
      <p className="mt-1 text-sm text-content-secondary">
        Ask a question or run a command — I&apos;ll take it from here.
      </p>

      <form onSubmit={handleSubmit} className="mt-4">
        <div className="flex items-center gap-2 border border-stroke-default bg-bg-base px-3 py-2 transition-colors focus-within:border-brand">
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
            className="motion-press grid h-8 w-8 shrink-0 place-items-center bg-brand text-content-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isThinking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {CHAPPI_CHIPS.map((chip) => {
          const Icon = CHIP_ICONS[chip.intent];
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleIntent({ kind: chip.intent })}
              className="motion-focus motion-press inline-flex items-center gap-1.5 border border-stroke-default bg-bg-base px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary"
            >
              <Icon className="h-3.5 w-3.5 text-content-tertiary" aria-hidden="true" />
              {chip.label}
            </button>
          );
        })}
      </div>

      {reply ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 whitespace-pre-wrap border border-stroke-default bg-bg-base p-3 text-sm"
        >
          <p className="text-content-primary">{reply.text}</p>
          {reply.suggestions?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {reply.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void submitPrompt(suggestion)}
                  className="motion-focus border border-stroke-default px-2.5 py-1 text-xs text-brand transition-colors hover:border-brand"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
