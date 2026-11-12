'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, Plus, Sparkles } from '@/components/icons';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { UrgansActivityView } from '@/components/urgans-activity/UrgansActivityView';
import { showMain } from '@/components/shell/swipe/main-thread';
import { Cover } from '@/components/shell/swipe/SessionsPane';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import { rolloutSessionIdFor } from '@/lib/rollout-session';
import { formatRelativeTime } from '@/lib/relative-time';
import { shouldBackgroundPrefetch } from '@/lib/connection';
import { useAuthStore } from '@/lib/auth-store';
import {
  assistantHref,
  orderRolloutChats,
  readAssistantRollout,
  shownRolloutChats,
} from '@/lib/assistant-chats';
import { displayReleaseTitle } from '@/types/releases';
import type { ExecutionRelease } from '@/lib/execution-types';
import { useChappiStore } from '@/stores/useChappiStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSessionsViewStore } from '@/stores/useSessionsViewStore';
import {
  prefetchChat,
  refreshMainChat,
  showRolloutSession,
  useChappiHistoryStore,
} from '@/stores/useChappiHistoryStore';

const HISTORY_ENABLED = isChappiHistoryEnabled();

const typeLabel = (release: ExecutionRelease) =>
  release.releaseType === 'ep' ? 'EP' : release.releaseType === 'album' ? 'Album' : 'Single';

type ChatRow = { id: string; release: ExecutionRelease; last: string | null; releaseDate: string | null };

/**
 * The Assistant on a computer (Nov 12, 2026, #1218, part of #1175; founder
 * approved docs/mocks/assistant-chats-desktop): every chat with UrgAns in one
 * page. The left column holds "Ask about everything", the ONE general chat
 * that never resets (#1207: the morning brief and "Show earlier" live in it),
 * and under it each rollout's own chat, most recently used first. The right
 * side is the open chat with a thin header. The Rollouts top tab left the
 * computer's top bar; /dashboard/sessions forwards here (?rollout=<id>).
 *
 * The mock also drew "New chat" and "Past chats"; both were left out on
 * purpose, because since #1207 the general chat never resets and old sessions
 * were folded into it as earlier pages.
 *
 * No unread dot: nothing records when a person last read a chat, so the app
 * cannot know what is new.
 *
 * The file keeps its name so every import stays put. Sized by
 * .home-split-height, which leaves room for the top bar.
 */
export function UrgansSessionsLayout({ onNewRelease }: { onNewRelease: () => void }) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const releases = useReleaseStore((state) => state.releases);
  const summaries = useChappiHistoryStore((state) => state.summaries);
  const nextCursor = useChappiHistoryStore((state) => state.nextCursor);
  const loadList = useChappiHistoryStore((state) => state.loadList);
  const loadMore = useChappiHistoryStore((state) => state.loadMore);

  // The rollout chat on screen, or null for the general chat. Read once from
  // the address, then kept there with replaceState so a reload stays put.
  const [requestedId, setRequestedId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : readAssistantRollout(window.location.search)
  );
  const [expanded, setExpanded] = useState(false);
  // "What AI did" shows in place of the general chat (#849).
  const [showActivity, setShowActivity] = useState(false);

  // A rollout that is gone, or that this person cannot see, opens the general
  // chat instead of an empty half.
  const openRelease = HISTORY_ENABLED && requestedId ? releases.find((entry) => entry.id === requestedId) ?? null : null;
  const openId = openRelease?.id ?? null;

  // Every saved chat is needed to tell when each rollout's chat was last used,
  // so the older pages load too (as the Rollouts list did).
  useEffect(() => {
    if (HISTORY_ENABLED) void loadList();
  }, [loadList]);
  useEffect(() => {
    if (HISTORY_ENABLED && nextCursor) void loadMore();
  }, [nextCursor, loadMore]);

  // Put the chosen chat on screen. Switches run one after another so a quick
  // second click never ends on the first chat.
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let live = true;
    const view = useSessionsViewStore.getState();
    view.setReadyFor(null);
    if (openId) {
      useChappiStore.getState().setScopedReleaseId(openId);
      view.setPinnedScope(true);
      queue.current = queue.current.then(async () => {
        if (!live) return;
        await showRolloutSession(openId);
        if (live) useSessionsViewStore.getState().setReadyFor(openId);
      });
    } else {
      // A rollout chat pinned the scope; the general chat takes it off.
      if (view.pinnedScope) {
        useChappiStore.getState().setScopedReleaseId(null);
        view.setPinnedScope(false);
      }
      queue.current = queue.current.then(async () => {
        if (!live) return;
        await showMain();
        await refreshMainChat();
      });
    }
    return () => {
      live = false;
    };
  }, [openId]);

  // The morning brief lands in the general chat at 8am (#1207): check again
  // when the tab comes back. A no-op while a rollout chat is on screen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshMainChat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const lastById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chat of summaries) map.set(chat.id, chat.lastMessageAt);
    return map;
  }, [summaries]);

  const rows = useMemo<ChatRow[]>(
    () =>
      orderRolloutChats(
        releases.map((entry) => {
          const sessionId = rolloutSessionIdFor(userId, entry.id);
          return {
            id: entry.id,
            release: entry,
            last: sessionId ? lastById.get(sessionId) ?? null : null,
            releaseDate: entry.releaseDate ?? null,
          };
        })
      ),
    [releases, lastById, userId]
  );
  const shown = shownRolloutChats(rows, { expanded, openId });

  // Read the top few used rollout chats ahead of a click, never on Data Saver
  // or a slow link (as the Rollouts list did).
  const toPrefetch = rows
    .filter((row) => row.last && row.id !== openId)
    .slice(0, 3)
    .map((row) => rolloutSessionIdFor(userId, row.id))
    .filter((id): id is string => Boolean(id))
    .join(',');
  useEffect(() => {
    if (!HISTORY_ENABLED || !toPrefetch || !shouldBackgroundPrefetch()) return;
    for (const id of toPrefetch.split(',')) prefetchChat(id);
  }, [toPrefetch]);

  const select = (releaseId: string | null) => {
    setRequestedId(releaseId);
    setShowActivity(false);
    try {
      window.history.replaceState(window.history.state, '', assistantHref(releaseId));
    } catch {
      // The address just stays as it was.
    }
  };

  const openTitle = openRelease ? displayReleaseTitle(openRelease.title) : null;

  return (
    <div className="home-split-height mx-auto grid w-full max-w-[1280px] grid-cols-[288px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-stroke-subtle">
      <h1 className="sr-only">Assistant</h1>
      <nav
        aria-label="Chats"
        className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-stroke-subtle bg-bg-surface p-4"
      >
        <ChatItem
          active={!openId}
          onClick={() => select(null)}
          icon={
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
          }
          title="Ask about everything"
          detail="All your artists and rollouts"
        />

        {HISTORY_ENABLED ? (
          <>
            <p className="px-2 pb-1.5 pt-3.5 text-xs font-semibold text-content-secondary">Rollout chats</p>
            {rows.length === 0 ? (
              <div className="px-2">
                <p className="text-[13px] text-content-secondary">No rollouts yet. Plan one and its chat shows here.</p>
                <button
                  type="button"
                  onClick={onNewRelease}
                  className="motion-focus motion-press mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-stroke-strong px-3 text-[13px] font-semibold text-content-primary"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Plan a rollout
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {shown.map((row) => (
                  <li key={row.id}>
                    <ChatItem
                      active={row.id === openId}
                      onClick={() => select(row.id)}
                      icon={<Cover release={row.release} size={32} />}
                      title={displayReleaseTitle(row.release.title)}
                      detail={`${row.release.artistName ? `${row.release.artistName} · ` : ''}${
                        row.last ? `Last message ${formatRelativeTime(row.last)}` : 'No messages yet'
                      }`}
                    />
                  </li>
                ))}
              </ul>
            )}
            {rows.length > shown.length || expanded ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                aria-expanded={expanded}
                className="motion-focus self-start rounded-lg px-2 py-1.5 text-[13px] text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                {expanded ? 'Show fewer' : `Show all ${rows.length}`}
              </button>
            ) : null}
          </>
        ) : null}
      </nav>

      <section aria-label="Chat" data-tour="nav-urgans" className="flex min-h-0 min-w-0 flex-col">
        <div className="flex min-h-[52px] shrink-0 items-center gap-2 border-b border-stroke-subtle px-6 py-3">
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold text-content-primary">{openTitle ?? 'Ask about everything'}</span>
            <span className="text-content-secondary">
              {' · '}
              {openRelease
                ? `${typeLabel(openRelease)}${openRelease.artistName ? ` by ${openRelease.artistName}` : ''}. This chat stays on this rollout.`
                : 'AI can see all your artists and rollouts'}
            </span>
          </p>
          {!openRelease ? (
            <button
              type="button"
              onClick={() => setShowActivity((current) => !current)}
              aria-pressed={showActivity}
              className="motion-focus motion-press ml-auto inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-brand transition-colors hover:bg-bg-hover"
            >
              {showActivity ? (
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {showActivity ? 'Back to the chat' : 'What AI did'}
            </button>
          ) : null}
        </div>

        {showActivity && !openRelease ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <UrgansActivityView />
          </div>
        ) : null}
        {/* Hidden, never unmounted, while "What AI did" shows: a reply on
            its way lives in it. A new chat remounts it, as switching tabs did. */}
        <div className={`min-h-0 flex-1 px-6 pb-4 pt-3 ${showActivity && !openRelease ? 'hidden' : ''}`}>
          <ErrorBoundary name="urgans-conversation" onError={reportBoundaryError} fallback={null}>
            {openRelease && openTitle ? (
              <ChappiConversation
                key={openRelease.id}
                onNewRelease={onNewRelease}
                headingLevel="h2"
                emptyHero={{
                  title: `What do you need for ${openTitle}?`,
                  subtitle: 'This chat stays on this rollout. Ask anything about it.',
                  prompts: [
                    `What's left before ${openTitle} drops?`,
                    `Who still owes me something on ${openTitle}?`,
                    `Draft the pitch for ${openTitle}`,
                  ],
                }}
              />
            ) : (
              <ChappiConversation
                key="main"
                onNewRelease={onNewRelease}
                headingLevel="h2"
                emptySubtitle="Ask about any artist or rollout, or open a rollout's chat on the left."
                emptyFooter={<InviteTeamBanner variant="line" />}
              />
            )}
          </ErrorBoundary>
        </div>
      </section>
    </div>
  );
}

function ChatItem({
  active,
  onClick,
  icon,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`motion-focus flex w-full min-w-0 items-center gap-2.5 rounded-[10px] p-2 text-left transition-colors ${
        active ? 'bg-bg-sidebar-active' : 'hover:bg-bg-hover'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-content-primary">{title}</span>
        <span className="block truncate text-xs text-content-secondary">{detail}</span>
      </span>
    </button>
  );
}
