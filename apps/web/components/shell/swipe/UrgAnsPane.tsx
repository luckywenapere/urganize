'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home as HomeIcon } from '@/components/icons';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { ChappiScopePicker } from '@/components/chappi/ChappiScopePicker';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { RolloutCreateFlow } from '@/components/releases/RolloutCreateFlow';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import { formatRelativeTime } from '@/lib/relative-time';
import { getNotificationMessage, type TaskNotification } from '@/lib/tasks';
import { readUrgansLink } from '@/lib/swipe-nav';
import { useChappiStore } from '@/stores/useChappiStore';
import { refreshMainChat, useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import { showMain } from './main-thread';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useNeedsYouStore } from '@/stores/useNeedsYouStore';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';
import { useSessionsViewStore } from '@/stores/useSessionsViewStore';
import { scrollIntoColumn } from '@/lib/scroll-in-column';

const HISTORY_ENABLED = isChappiHistoryEnabled();

export { showMain };

function useOnMain(): boolean {
  const homeChatId = useChappiHistoryStore((state) => state.homeChatId);
  const conversationId = useChappiStore((state) => state.conversationId);
  const nextChatId = useChappiStore((state) => state.nextChatId);
  if (!HISTORY_ENABLED) return true;
  if (!homeChatId) return true;
  return conversationId === homeChatId || (conversationId === null && nextChatId === homeChatId);
}

/**
 * UrgAns as a tab (URG-380): one persistent Main thread (the Main-thread pill and
 * Sessions sheet moved to the Sessions tab, Nov 2, 2026), the rollout scope, the conversation
 * (its box is the shell's one shared composer, SwipeFrame, so it never changes
 * shape between tabs), and two kinds of turn the swipe navigation adds at the end of Main:
 * the Home card carried in, and "Needs you" (what the bell used to hold).
 */
export function UrgAnsPane({ active }: { active: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const onMain = useOnMain();
  const messageCount = useChappiStore((state) => state.messages.length);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const releases = useReleaseStore((state) => state.releases);
  const handoff = useSwipeNavStore((state) => state.handoff);
  const unread = useNeedsYouStore((state) => state.items).filter((item) => !item.read);
  const loadNeedsYou = useNeedsYouStore((state) => state.load);
  const [fresh, setFresh] = useState(false);
  const scopedReleaseId = useChappiStore((state) => state.scopedReleaseId);
  const setScopedReleaseId = useChappiStore((state) => state.setScopedReleaseId);

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  // Arriving on the tab: Main, unless a link names a session or a message.
  const handledSearch = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    void loadNeedsYou();
    // A rollout session pins the assistant's scope; coming here takes the pin
    // off, on a fresh mount too (Codex review on #1022).
    const view = useSessionsViewStore.getState();
    if (view.pinnedScope) {
      useChappiStore.getState().setScopedReleaseId(null);
      view.setPinnedScope(false);
    }
    const search = window.location.search;
    if (handledSearch.current === search) {
      // Back on the tab from Sessions: the one chat store may hold a rollout's
      // session, so Main is put on screen again.
      void showMain();
      return;
    }
    const first = handledSearch.current === null;
    handledSearch.current = search;
    const link = readUrgansLink(search);
    if (link.session && HISTORY_ENABLED) {
      void useChappiHistoryStore.getState().open(link.session);
      return;
    }
    if (link.message) {
      void showMain().then(() => highlightMessage(link.message as string));
      return;
    }
    if (first) void showMain();
  }, [active, loadNeedsYou]);

  // The morning brief lands in Main at 8am (#1207): check for it when the tab
  // is shown and when the app comes back to the front.
  useEffect(() => {
    if (!active || !HISTORY_ENABLED) return;
    void refreshMainChat();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshMainChat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active]);

  // A freshly carried card: the composer gets a soft ring (no keyboard).
  useEffect(() => {
    if (!handoff || Date.now() - handoff.at > 2000) return;
    setFresh(true);
    const timer = window.setTimeout(() => setFresh(false), 2400);
    return () => window.clearTimeout(timer);
  }, [handoff]);

  // The shared composer lives outside this pane (portalled to <body>), so the
  // ring is keyed off <html>.
  useEffect(() => {
    if (!fresh) return;
    const root = document.documentElement;
    root.dataset.composerReady = '';
    return () => {
      delete root.dataset.composerReady;
    };
  }, [fresh]);

  const prompts = useMemo(() => {
    const next = [...releases]
      .filter((release) => release.releaseDate && new Date(release.releaseDate).getTime() >= Date.now() - 86_400_000)
      .sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)))[0];
    const title = next?.title;
    return [
      title ? `What's left before ${title} drops?` : "What's left this week?",
      "Who hasn't replied?",
      title ? `Draft the pitch for ${title}` : 'Draft a pitch',
      'How did my last release do?',
    ];
  }, [releases]);

  const showHandoff = Boolean(handoff) && onMain;
  const showNeedsYou = unread.length > 0 && onMain;
  const trailing =
    showHandoff || showNeedsYou ? (
      <>
        {showNeedsYou ? <NeedsYouTurn items={unread} /> : null}
        {showHandoff && handoff ? <FromHomeTurn key={handoff.cardId + handoff.at} /> : null}
      </>
    ) : null;

  return (
    <div className="swipe-urgans flex h-full min-h-0 flex-col px-5 lg:mx-auto lg:max-w-[46rem]">
      <div className="flex shrink-0 items-center gap-2 pt-2">
        <ChappiScopePicker
          placement="header"
          releases={releases}
          scopedReleaseId={scopedReleaseId}
          onSelect={setScopedReleaseId}
        />
      </div>
      <div className="shrink-0">
        <InviteTeamBanner />
      </div>
      <div className="swipe-urgans-body min-h-0 flex-1 pt-3">
        <ErrorBoundary name="swipe-urgans-conversation" onError={reportBoundaryError}>
          <ChappiConversation
            onNewRelease={() => setCreateOpen(true)}
            headingLevel="h2"
            trailing={trailing}
            trailingAt={showHandoff && handoff ? Math.min(messageCount, handoffCountRef(handoff.cardId, messageCount)) : undefined}
            emptyHero={{
              title: 'What do you need?',
              subtitle: 'One thread for every rollout. Ask anything.',
              prompts,
            }}
            externalComposer
          />
        </ErrorBoundary>
      </div>

      <RolloutCreateFlow open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// Where the carried card sits: after the messages Main had when it arrived, so
// a reply typed under it lands below it, never above.
const handoffCounts = new Map<string, number>();
function handoffCountRef(cardId: string, count: number): number {
  if (!handoffCounts.has(cardId)) handoffCounts.set(cardId, count);
  return handoffCounts.get(cardId) as number;
}

/** /dashboard/urgans?m=<id>: scroll to the turn and ring it for 1.2s. */
function highlightMessage(id: string) {
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-swipe-pane="urgans"] [data-message-id="${CSS.escape(id)}"]`);
    if (!el) return;
    scrollIntoColumn(el, { block: 'center', behavior: 'smooth' });
    el.classList.add('swipe-message-ring');
    window.setTimeout(() => el.classList.remove('swipe-message-ring'), 1200);
  }, 250);
}

/** The Home card, landed as the newest turn in Main. */
function FromHomeTurn() {
  const handoff = useSwipeNavStore((state) => state.handoff);
  const setHandoff = useSwipeNavStore((state) => state.setHandoff);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollIntoColumn(ref.current, { block: 'end', behavior: 'smooth' });
  }, []);

  if (!handoff) return null;
  return (
    <div
      ref={ref}
      data-handoff-turn
      className="swipe-turn-in rounded-[22px] border border-content-primary/[0.08] bg-bg-surface px-[18px] pb-[18px] pt-4"
    >
      <span className="inline-flex h-[26px] max-w-full items-center gap-1.5 rounded-full bg-content-primary/[0.06] px-2.5 text-[12.5px] text-content-primary/70">
        <HomeIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="shrink-0">From Home ·</span>
        <b className="truncate font-semibold text-content-primary">{handoff.title}</b>
      </span>
      {handoff.body ? <p className="mt-2.5 text-[16.5px] leading-[1.45] text-content-primary">{handoff.body}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {handoff.actionLabel && handoff.onAction ? (
          <button
            type="button"
            onClick={() => {
              const run = handoff.onAction;
              setHandoff(null);
              run?.();
            }}
            className="motion-focus motion-press inline-flex h-10 items-center rounded-full bg-brand px-[18px] text-[15px] font-semibold text-content-inverse hover:bg-brand-hover"
          >
            {handoff.actionLabel}
          </button>
        ) : null}
        {handoff.onDismiss ? (
          <button
            type="button"
            onClick={() => {
              const dismiss = handoff.onDismiss;
              setHandoff(null);
              dismiss?.();
            }}
            className="hit-44 relative motion-focus inline-flex h-10 items-center rounded-full px-1.5 text-[15px] font-medium text-content-primary/55 hover:text-content-primary"
          >
            Not now
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** What the bell used to hold: unread notices, one quiet turn at the end of Main. */
function NeedsYouTurn({ items }: { items: TaskNotification[] }) {
  const router = useRouter();
  const { openTask } = useTaskUI();
  const markRead = useNeedsYouStore((state) => state.markRead);
  const shown = items.slice(0, 5);

  return (
    <div data-needs-you className="rounded-[22px] border border-content-primary/[0.08] bg-bg-surface px-[18px] py-3.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-content-primary/45">Needs you</span>
        <button
          type="button"
          onClick={() => void markRead('all')}
          className="motion-focus rounded-md px-1 text-[12.5px] text-content-primary/55 hover:text-content-primary"
        >
          Mark all read
        </button>
      </div>
      <ul className="mt-1">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                void markRead([item.id]);
                const href = item.taskReleaseId ? `/dashboard?release=${encodeURIComponent(item.taskReleaseId)}` : '/dashboard';
                router.push(href);
                if (item.taskId) openTask(item.taskId);
              }}
              className="motion-focus flex w-full items-start gap-3 border-b border-content-primary/[0.07] py-2.5 text-left last:border-b-0"
            >
              <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug text-content-primary">{getNotificationMessage(item)}</span>
                <span className="block truncate text-[13px] text-content-primary/50">
                  {item.taskTitle} · {formatRelativeTime(item.createdAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
