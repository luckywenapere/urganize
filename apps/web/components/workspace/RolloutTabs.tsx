'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MoreHorizontal } from '@/components/icons';
import { sceneRowTarget } from '@/lib/nav-stall';
import { watchNavigationStall } from '@/lib/nav-stall-watch';
import {
  useRolloutMenuActions,
  type RolloutMenuAction,
  type RolloutMenuDialogInput,
} from './useRolloutMenuActions';

type RolloutTabsProps = {
  releaseId: string;
  /** `row` (default): a row of tabs under the rollout's header. `side`: the
   *  same menu as a nested list, portalled into the desktop side menu under
   *  Rollouts (URG-254, founder call 2026-10-14). */
  variant?: 'row' | 'side';
  share?: RolloutMenuDialogInput | null;
  changeArtist?: RolloutMenuDialogInput | null;
  archive?: RolloutMenuDialogInput | null;
};

/**
 * A rollout's places, as one row of tabs under its header (design overhaul,
 * 2026-10-04). It replaces the vertical menu that used to sit in the right-hand
 * column: Deel's page tabs instead of a side card.
 *
 * What is in it, in what order and which one is lit come from the same builder
 * the phone's menu uses (lib/rollout-menu.ts via useRolloutMenuActions), so the
 * two cannot drift. The scene rows and the Notes link are tabs. The three
 * dialog-shaped actions (Share, Change artist, Archive) are not places, so they
 * sit behind the overflow button at the end instead of reading as tabs.
 *
 * The row scrolls sideways when it is wider than the screen, and keeps the lit
 * tab in view. When tabs hide past an edge, that edge fades and shows an arrow
 * (pitch kit polish, 2026-10-11): a live check found "Add cover art" and the
 * pitch kit sitting off-screen with nothing saying there was more.
 */
export function RolloutTabs({ releaseId, variant = 'row', share, changeArtist, archive }: RolloutTabsProps) {
  const actions = useRolloutMenuActions({
    releaseId,
    variant: 'rail',
    share,
    changeArtist,
    archive,
  });
  const places = actions.filter((action) => action.isActive !== undefined || action.href);
  const dialogs = actions.filter((action) => action.isActive === undefined && !action.href);

  if (places.length === 0 && dialogs.length === 0) return null;

  if (variant === 'side') {
    // Nested under Rollouts in the side menu: every place one per row, then
    // the three dialog actions as rows after a hairline, since a narrow
    // column has room for them and an overflow button would hide them.
    return (
      <nav aria-label="Rollout" data-tour="rollout-menu">
        <ul className="flex flex-col gap-0.5">
          {places.map((action) => (
            <li key={action.key}>
              <SideRow action={action} />
            </li>
          ))}
        </ul>
        {dialogs.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-stroke-subtle pt-1.5">
            {dialogs.map((action) => (
              <li key={action.key}>
                <SideRow action={action} />
              </li>
            ))}
          </ul>
        ) : null}
      </nav>
    );
  }

  return (
    <nav aria-label="Rollout" data-tour="rollout-menu" className="flex items-center gap-1">
      <ScrollRow>
        {places.map((action) => (
          <Tab key={action.key} action={action} />
        ))}
      </ScrollRow>
      {dialogs.length > 0 ? <OverflowMenu actions={dialogs} /> : null}
    </nav>
  );
}

/** A sideways-scrolling row that fades and offers an arrow at any edge with hidden tabs. */
function ScrollRow({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const left = row.scrollLeft > 4;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 4;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    measure();
    row.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(row);
    return () => {
      row.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, []);

  const nudge = (direction: -1 | 1) => {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({ left: direction * Math.max(160, row.clientWidth * 0.6), behavior: 'smooth' });
  };

  const arrowClass =
    'motion-focus absolute top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary shadow-sm hover:text-content-primary';

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={rowRef}
        className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {edges.left ? (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-bg-base to-transparent" />
          <button type="button" aria-label="Show earlier tabs" onClick={() => nudge(-1)} className={`${arrowClass} left-0`}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      ) : null}
      {edges.right ? (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-bg-base to-transparent" />
          <button type="button" aria-label="Show more tabs" onClick={() => nudge(1)} className={`${arrowClass} right-0`}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}

function tabClass(lit: boolean): string {
  return `motion-focus motion-press inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
    lit
      ? 'bg-bg-hover text-content-primary'
      : 'text-content-secondary hover:bg-bg-hover/60 hover:text-content-primary'
  }`;
}

function Tab({ action }: { action: RolloutMenuAction }) {
  const lit = Boolean(action.isActive);
  const Icon = action.icon;
  const content = (
    <>
      <Icon className={`h-4 w-4 shrink-0 ${lit ? 'text-brand' : 'text-content-tertiary'}`} aria-hidden="true" />
      <span className="whitespace-nowrap">{action.label}</span>
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className={tabClass(false)}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      ref={(node) => {
        if (node && lit) node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }}
      onClick={() => {
        watchNavigationStall(
          `rollout_menu:${action.key}`,
          sceneRowTarget(window.location.href, action.key, lit)
        );
        action.onClick();
      }}
      aria-pressed={lit}
      className={tabClass(lit)}
    >
      {content}
    </button>
  );
}

function sideRowClass(lit: boolean): string {
  return `motion-focus flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-[color,background-color,opacity] disabled:opacity-40 ${
    lit
      ? 'bg-bg-hover/70 font-medium text-content-primary'
      : 'text-content-secondary opacity-70 hover:bg-bg-hover/50 hover:text-content-primary hover:opacity-100'
  }`;
}

/** One row of a rollout's menu in the side menu: the same three kinds as the
 *  tabs (a scene, the Notes link, a dialog), the same stall watch. */
function SideRow({ action }: { action: RolloutMenuAction }) {
  const lit = Boolean(action.isActive);
  const Icon = action.icon;
  const content = (
    <>
      <Icon className={`h-4 w-4 shrink-0 ${lit ? 'text-brand' : 'text-content-tertiary'}`} aria-hidden="true" />
      <span className="min-w-0 truncate">{action.label}</span>
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className={sideRowClass(false)}>
        {content}
      </Link>
    );
  }

  const isPlace = action.isActive !== undefined;
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={() => {
        if (isPlace) {
          watchNavigationStall(
            `rollout_menu:${action.key}`,
            sceneRowTarget(window.location.href, action.key, lit)
          );
        }
        action.onClick();
      }}
      aria-pressed={isPlace ? lit : undefined}
      className={sideRowClass(lit)}
    >
      {content}
    </button>
  );
}

function OverflowMenu({ actions }: { actions: RolloutMenuAction[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="More for this rollout"
        className="motion-focus motion-press grid h-10 w-10 place-items-center rounded-lg text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-stroke-default bg-bg-surface p-1.5 shadow-lg">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className="motion-focus flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm text-content-primary hover:bg-bg-hover disabled:opacity-60"
              >
                <Icon className="h-4 w-4 text-content-tertiary" aria-hidden="true" />
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
