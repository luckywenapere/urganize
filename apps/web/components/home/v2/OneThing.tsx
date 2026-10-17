'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { X } from '@/components/icons';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { NEXT_MOVE_COPY, type NextMove } from '@/lib/next-moves';
import { HOME_FOUR_COPY, type OneThingItem } from '@/lib/home/home-four';
import { captureAnalyticsEvent } from '@/lib/analytics/client';

const CARD = 'relative rounded-[20px] border border-stroke-default bg-bg-surface';
const PRIMARY =
  'motion-focus motion-press mt-5 flex h-12 w-full items-center justify-center rounded-full bg-brand text-[15px] font-semibold text-content-inverse hover:bg-brand-hover';

function useGoToMove() {
  const router = useRouter();
  const pathname = usePathname();
  const { openTask } = useTaskUI();
  return (move: NextMove) => {
    if (move.target.kind === 'link') {
      router.push(move.target.href);
      return;
    }
    const href = `/dashboard?release=${encodeURIComponent(move.target.releaseId)}`;
    const here =
      pathname === '/dashboard' &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('release') === move.target.releaseId;
    if (!here) router.push(href);
    openTask(move.target.taskId);
  };
}

function Slide({
  item,
  position,
  onDismissMove,
}: {
  item: OneThingItem;
  position: number;
  onDismissMove: (move: NextMove) => void;
}) {
  const { openTask } = useTaskUI();
  const goToMove = useGoToMove();
  const track = () =>
    captureAnalyticsEvent({ name: 'home_one_thing_clicked', properties: { kind: item.kind, position } });

  if (item.kind === 'task') {
    // No "Next" chip or due line (Oyin, Oct 17, 2026): the card leads with the task.
    const { task } = item;
    const where = [task.releaseTitle, task.artistName].filter(Boolean).join(' · ');
    return (
      <div className={`${CARD} flex h-full flex-col px-5 pb-5 pt-5`}>
        <h2 className="break-words font-display text-[1.45rem] leading-[1.25] text-content-primary">{task.title}</h2>
        {where ? <p className="mt-2 text-sm leading-relaxed text-content-secondary">{where}</p> : null}
        <span className="flex-1" aria-hidden="true" />
        <button
          type="button"
          className={PRIMARY}
          onClick={() => {
            track();
            openTask(task.id);
          }}
        >
          {HOME_FOUR_COPY.openTask}
        </button>
      </div>
    );
  }

  if (item.kind === 'move') {
    const { move } = item;
    return (
      <div className={`${CARD} flex h-full flex-col px-5 pb-5 pt-5`} data-next-move={move.rule}>
        <button
          type="button"
          onClick={() => onDismissMove(move)}
          aria-label={`${NEXT_MOVE_COPY.dismiss}: ${move.title}`}
          title={NEXT_MOVE_COPY.dismiss}
          className="motion-focus absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-content-primary/55 hover:bg-bg-elevated hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <h2 className="break-words pr-8 font-display text-[1.45rem] leading-[1.25] text-content-primary">{move.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-content-secondary">{move.detail}</p>
        <span className="flex-1" aria-hidden="true" />
        <button
          type="button"
          className={PRIMARY}
          onClick={() => {
            track();
            goToMove(move);
          }}
        >
          {move.action}
        </button>
      </div>
    );
  }

  const { show } = item;
  return (
    <div className={`${CARD} flex h-full flex-col px-5 pb-5 pt-5`}>
      <span className="font-mono text-xs text-content-primary/55">{show.dateLabel}</span>
      <h2 className="mt-2 break-words font-display text-[1.45rem] leading-[1.25] text-content-primary">
        {show.artistName}
        {show.venueName ? ` at ${show.venueName}` : ''}
      </h2>
      <p className="mt-2 text-sm text-content-secondary">
        {[show.city, show.setTimeLabel].filter(Boolean).join(' · ')}
      </p>
      <span className="flex-1" aria-hidden="true" />
      <Link href={`/dashboard/shows/${show.id}`} className={PRIMARY} onClick={track}>
        {HOME_FOUR_COPY.openShow}
      </Link>
    </div>
  );
}

/**
 * The One Thing (URG-320): the single most important move, one green button,
 * and at most two more a swipe away. Replaces the Tasks, Up next, Next moves and
 * For you today blocks. With nothing to do it says so and names what is next.
 */
export function OneThing({
  items,
  nextUp,
  onDismissMove,
}: {
  items: readonly OneThingItem[];
  nextUp: string | null;
  onDismissMove: (move: NextMove) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (items.length === 0) {
    return (
      <section aria-label={HOME_FOUR_COPY.next} className={`${CARD} px-5 py-5`} data-home-block="one-thing">
        <p className="font-display text-[1.4rem] leading-[1.25] text-content-primary">{HOME_FOUR_COPY.clearTitle}</p>
        {nextUp ? <p className="mt-2 text-sm text-content-secondary">{nextUp}</p> : null}
      </section>
    );
  }

  const go = (to: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: to * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <section aria-label={HOME_FOUR_COPY.next} aria-roledescription="carousel" data-home-block="one-thing">
      <div
        ref={trackRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (next !== index) setIndex(next);
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div
            key={item.key}
            className="flex w-full shrink-0 snap-center"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            aria-hidden={i !== index || undefined}
          >
            <div className="w-full">
              <Slide item={item} position={i + 1} onDismissMove={onDismissMove} />
            </div>
          </div>
        ))}
      </div>
      {items.length > 1 ? (
        <div className="mt-3 flex justify-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${i + 1} of ${items.length}`}
              aria-current={i === index || undefined}
              className="motion-focus grid h-6 place-items-center px-0.5"
            >
              <span
                className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-content-primary' : 'w-1.5 bg-content-primary/20'}`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
