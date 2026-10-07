'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useHomeStore } from '@/stores/useHomeStore';
import { useHomeFocusData } from '@/components/home/useHomeFocusData';
import { FocusTaskCard } from '@/components/home/FocusTaskCard';
import { UpNextCard } from '@/components/home/UpNextCard';
import { pickFocusTask } from '@/lib/home/focus';
import { pickUpNext } from '@/lib/home/up-next';
import type { HomePayload } from '@/lib/home/types';

/**
 * Beside the chat on a desktop: the one task to do first and how the day stands,
 * so asking UrgAns something never costs the manager sight of what is on fire.
 * It reads the same Home data and the same artist filter Home does. Home data
 * is loaded here too, because the chat page can be the first page someone opens.
 * If it cannot load, nothing is drawn: the chat must never wait on this panel.
 */
export function TodayPanel() {
  const userId = useAuthStore((state) => state.user?.id);
  const home = useHomeStore((state) => state.data);
  const load = useHomeStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (!userId || !home) return null;
  return <TodayPanelBody home={home} viewerId={userId} />;
}

function TodayPanelBody({ home, viewerId }: { home: HomePayload; viewerId: string }) {
  const { releases, yourTasks, waitingTasks } = useHomeFocusData(home, viewerId);
  const focus = pickFocusTask(yourTasks);
  const waiting = waitingTasks.length + home.waiting.djLinks.length;
  const counts = [
    { key: 'late', count: yourTasks.late.length, label: 'late', tone: 'text-status-error' },
    { key: 'today', count: yourTasks.today.length, label: 'due today', tone: 'text-status-warning' },
    { key: 'waiting', count: waiting, label: 'waiting', tone: 'text-content-primary' },
  ].filter((chip) => chip.count > 0);

  return (
    <aside aria-label="Today" className="hidden w-80 shrink-0 space-y-3 overflow-y-auto lg:block">
      {focus ? <FocusTaskCard focus={focus} /> : <UpNextCard next={pickUpNext(home.nextShow, releases)} />}
      {counts.length > 0 ? (
        <ul aria-label="Today at a glance" className="flex flex-wrap gap-2">
          {counts.map((chip) => (
            <li
              key={chip.key}
              className="inline-flex items-baseline gap-2 rounded-full border border-stroke-default bg-bg-surface px-3 py-1.5"
            >
              <span className={`font-display text-lg font-semibold tabular-nums ${chip.tone}`}>{chip.count}</span>
              <span className="text-sm text-content-secondary">{chip.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
