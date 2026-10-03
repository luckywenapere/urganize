'use client';

import Link from 'next/link';
import { sceneRowTarget } from '@/lib/nav-stall';
import { watchNavigationStall } from '@/lib/nav-stall-watch';
import { useChappiStore } from '@/stores/useChappiStore';
import type { RolloutMenuAction } from './useRolloutMenuActions';

// Same inline flag AppShell and RightRail read: the chat can only be open if it
// exists.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

/** One row's classes. Lit when its scene is the open one. `h-8` is the row
 *  height the width and height budgets were worked out against (see
 *  lib/layout-columns.ts and RightRail's slot cap), so it is not a taste
 *  number. */
function rowClass(lit: boolean): string {
  return `motion-focus flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors disabled:opacity-60 ${
    lit
      ? 'bg-brand/10 font-semibold text-content-primary'
      : 'font-medium text-content-primary hover:bg-bg-hover'
  }`;
}

function RowContent({ action, lit }: { action: RolloutMenuAction; lit: boolean }) {
  return (
    <>
      <action.icon
        className={`h-4 w-4 shrink-0 ${lit ? 'text-brand' : 'text-content-tertiary'}`}
        aria-hidden="true"
      />
      <span className="truncate">{action.label}</span>
    </>
  );
}

type RolloutMenuProps = {
  /** The rows, from useRolloutMenuActions. Passed in rather than built here so
   *  the portal can know whether there are any BEFORE it claims the column: a
   *  menu with nothing in it must not reserve a blank strip. */
  actions: RolloutMenuAction[];
  /** Named in the card's header. */
  releaseTitle: string;
};

/**
 * THE ROLLOUT MENU — the vertical card at the top of the right-hand column, with
 * the UrgAns chat directly under it (founder call, 2026-09-30, from Cursor's
 * agent window: a small menu headed "On urganize" above the chat). It replaces
 * the row of scene pills that used to sit at the top of the centre column and
 * the footer row of Content and Fan capture.
 *
 * What is in it, in what order and which row is lit are lib/rollout-menu.ts's
 * decisions, drawn here as rows; the phone's release menu draws the same rows
 * from the same builder. This component adds only the shape: a header naming
 * the rollout, and one column of rows or two.
 *
 * TWO COLUMNS WHILE THE CHAT IS OPEN, ONE WHEN IT IS NOT. With the chat open the
 * column is 320 to 720px wide and the chat needs about 22rem of its height, so a
 * single column of thirteen rows would leave the chat almost nothing to work in
 * (measured: ~273px on a 900px-high window). Two columns halve the menu's
 * height. With the chat closed the column is the narrow menu-only width and the
 * whole height is the menu's, so one column reads better and costs nothing.
 *
 * The card is padded in on the left (`pl-3`) because the chat's drag handle is a
 * 12px hit area on the column's left edge, running its full height, and would
 * otherwise sit over the icons of the first rows.
 */
export function RolloutMenu({ actions, releaseTitle }: RolloutMenuProps) {
  const chatOpen = useChappiStore((state) => CHAPPI_ENABLED && state.railOpen);

  if (actions.length === 0) return null;

  const title = releaseTitle.trim() || 'this rollout';

  return (
    <nav
      aria-label="Rollout menu"
      data-tour="rollout-menu"
      className="urg-cartouche mb-3 flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-stroke-default bg-bg-surface py-2 pl-3 pr-2"
    >
      <p
        title={`On ${title}`}
        className="truncate px-2 pb-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary"
      >
        On {title}
      </p>
      <ul className={`grid gap-0.5 ${chatOpen ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {actions.map((action) => {
          const lit = Boolean(action.isActive);
          return (
            <li key={action.key} className="min-w-0">
              {action.href ? (
                // A real link, so middle-click and "open in a new tab" work for
                // the one row that leaves the workspace. Notes filters itself to
                // this rollout on arrival.
                <Link href={action.href} className={rowClass(false)}>
                  <RowContent action={action} lit={false} />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // Only the scene toggles change the address; the dialog rows
                    // (Share, Archive, Change artist) leave `isActive` undefined
                    // and are expected to leave the URL alone.
                    if (action.isActive !== undefined) {
                      watchNavigationStall(
                        `rollout_menu:${action.key}`,
                        sceneRowTarget(window.location.href, action.key, Boolean(action.isActive))
                      );
                    }
                    action.onClick();
                  }}
                  disabled={action.disabled}
                  // Undefined on the dialog rows, which omits the attribute
                  // entirely rather than announcing them as unpressed toggles.
                  aria-pressed={action.isActive}
                  className={rowClass(lit)}
                >
                  <RowContent action={action} lit={lit} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
