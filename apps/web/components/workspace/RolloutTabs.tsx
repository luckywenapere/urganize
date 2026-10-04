'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from '@/components/icons';
import { sceneRowTarget } from '@/lib/nav-stall';
import { watchNavigationStall } from '@/lib/nav-stall-watch';
import {
  useRolloutMenuActions,
  type RolloutMenuAction,
  type RolloutMenuDialogInput,
} from './useRolloutMenuActions';

type RolloutTabsProps = {
  releaseId: string;
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
 * tab in view.
 */
export function RolloutTabs({ releaseId, share, changeArtist, archive }: RolloutTabsProps) {
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

  return (
    <nav aria-label="Rollout" data-tour="rollout-menu" className="flex items-center gap-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {places.map((action) => (
          <Tab key={action.key} action={action} />
        ))}
      </div>
      {dialogs.length > 0 ? <OverflowMenu actions={dialogs} /> : null}
    </nav>
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
