'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus } from '@/components/icons';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { RolloutCreateFlow } from '@/components/releases/RolloutCreateFlow';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import { rolloutSessionIdFor } from '@/lib/rollout-session';
import { formatRelativeTime } from '@/lib/relative-time';
import { useAuthStore } from '@/lib/auth-store';
import { displayReleaseTitle } from '@/types/releases';
import type { ExecutionRelease } from '@/lib/execution-types';
import { useChappiStore } from '@/stores/useChappiStore';
import { showRolloutSession, useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSessionsViewStore } from '@/stores/useSessionsViewStore';

const HISTORY_ENABLED = isChappiHistoryEnabled();

const typeLabel = (release: ExecutionRelease) =>
  release.releaseType === 'ep' ? 'EP' : release.releaseType === 'album' ? 'Album' : 'Single';

function Cover({ release, size }: { release: ExecutionRelease; size: number }) {
  const url = release.coverThumbUrl || release.coverArtUrl || null;
  const box = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={box} className="shrink-0 rounded-lg object-cover" />;
  }
  return (
    <span aria-hidden="true" style={box} className="grid shrink-0 place-items-center rounded-lg bg-bg-hover font-display text-sm text-content-secondary">
      {displayReleaseTitle(release.title).slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * The Sessions tab (Nov 2, 2026, founder call; mock docs/mocks/sessions): one
 * session per rollout. The list is the rollouts themselves, with no "new
 * session" button, because a session only comes with a rollout. Opening one
 * shows that rollout's own chat full page, scoped to it. Home and the Assistant
 * tab keep talking to Main.
 *
 * There is one conversation store, so the chat is drawn only while this tab is
 * the one on screen: whichever tab arrives loads its own chat (the Assistant
 * loads Main, this tab loads the open rollout's session).
 */
export function SessionsPane({ active }: { active: boolean }) {
  const releaseId = useSessionsViewStore((state) => state.releaseId);
  const openSession = useSessionsViewStore((state) => state.open);
  const setPinnedScope = useSessionsViewStore((state) => state.setPinnedScope);
  const setReadyFor = useSessionsViewStore((state) => state.setReadyFor);
  const nextCursor = useChappiHistoryStore((state) => state.nextCursor);
  const loadMore = useChappiHistoryStore((state) => state.loadMore);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const summaries = useChappiHistoryStore((state) => state.summaries);
  const loadList = useChappiHistoryStore((state) => state.loadList);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  useEffect(() => {
    if (active && HISTORY_ENABLED) void loadList();
  }, [active, loadList]);

  // Every saved chat is needed to tell which rollouts have a session, so the
  // older pages load too (Codex review on #1022).
  useEffect(() => {
    if (active && HISTORY_ENABLED && nextCursor) void loadMore();
  }, [active, nextCursor, loadMore]);

  const release = releaseId ? releases.find((entry) => entry.id === releaseId) ?? null : null;

  // Arriving on a session: put its chat on screen and pin the rollout.
  useEffect(() => {
    if (!active || !releaseId) {
      setReadyFor(null);
      return;
    }
    let live = true;
    setReadyFor(null);
    void showRolloutSession(releaseId).then(() => {
      if (live) setReadyFor(releaseId);
    });
    useChappiStore.getState().setScopedReleaseId(releaseId);
    setPinnedScope(true);
    return () => {
      live = false;
    };
  }, [active, releaseId, setPinnedScope, setReadyFor]);

  const lastById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chat of summaries) map.set(chat.id, chat.lastMessageAt);
    return map;
  }, [summaries]);

  const rows = useMemo(() => {
    const withLast = releases.map((entry) => {
      const id = rolloutSessionIdFor(userId, entry.id);
      return { release: entry, last: id ? lastById.get(id) ?? null : null };
    });
    // Sessions you have used come first, newest chat on top; then the rest by
    // release date.
    return withLast.sort((a, b) => {
      if (a.last && b.last) return b.last.localeCompare(a.last);
      if (a.last) return -1;
      if (b.last) return 1;
      return String(a.release.releaseDate ?? '9999').localeCompare(String(b.release.releaseDate ?? '9999'));
    });
  }, [releases, lastById, userId]);

  if (releaseId) {
    const title = release ? displayReleaseTitle(release.title) : 'Session';
    return (
      <div className="swipe-urgans flex h-full min-h-0 flex-col px-5">
        <div className="flex shrink-0 items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => openSession(null)}
            aria-label="Back to Sessions"
            className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl text-content-primary">{title}</h2>
            {release ? <p className="text-xs text-content-tertiary">{typeLabel(release)} · {release.artistName}</p> : null}
          </div>
        </div>
        <div className="swipe-urgans-body min-h-0 flex-1 pt-3">
          {active ? (
            <ErrorBoundary name="swipe-sessions-conversation" onError={reportBoundaryError}>
              <ChappiConversation
                onNewRelease={() => setCreateOpen(true)}
                headingLevel="h2"
                emptyHero={{
                  title: `What do you need for ${title}?`,
                  subtitle: 'This session stays on this rollout. Ask anything about it.',
                  prompts: [`What's left before ${title} drops?`, `Who still owes me something on ${title}?`, `Draft the pitch for ${title}`],
                }}
                externalComposer
              />
            </ErrorBoundary>
          ) : null}
        </div>
        <RolloutCreateFlow open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    );
  }

  return (
    <div className="swipe-page mx-auto w-full max-w-[40rem] px-5">
      <p className="mb-1 mt-3 text-sm text-content-secondary">One session for each rollout.</p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-content-secondary">No rollouts yet. Plan one and its session shows here.</p>
      ) : (
        <ul>
          {rows.map(({ release: entry, last }) => (
            <li key={entry.id} className="border-b border-content-primary/[0.07] last:border-b-0">
              <button
                type="button"
                onClick={() => openSession(entry.id)}
                className="motion-focus flex min-h-[72px] w-full items-center gap-3.5 px-1.5 py-2 text-left"
              >
                <Cover release={entry} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold text-content-primary">
                    {displayReleaseTitle(entry.title)}
                  </span>
                  <span className="block truncate text-[13px] text-content-tertiary">
                    {typeLabel(entry)} · {last ? `Last message ${formatRelativeTime(last)}` : 'No messages yet'}
                  </span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-content-primary/35" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="motion-focus motion-press mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-stroke-strong px-4 text-sm font-semibold text-content-primary"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Plan a new rollout
      </button>
      <RolloutCreateFlow open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
