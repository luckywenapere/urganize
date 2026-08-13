'use client';

import type { ReactNode } from 'react';

type SettingRowProps = {
  /** Rendered at 16px beside the title — pass a lucide icon already carrying
   * its own lit/unlit color, the way the three notification toggles do. */
  icon: ReactNode;
  title: string;
  /** Small pill after the title (e.g. "Beta"). Row-level, not section-level:
   * one row being beta says nothing about its neighbours. */
  titleBadge?: ReactNode;
  description: string;
  /** The toggle button. Kept as a slot so each row owns its own async state
   * and copy rather than this shell trying to model every toggle. */
  action?: ReactNode;
  error?: string;
};

/**
 * One preference inside a grouped settings section (2026-08-13).
 *
 * Before this, Push notifications / After tasks / Motivation were three
 * separate `panelClass` sections, each burning a full py-9 band and its own
 * mono-uppercase kicker for a single button — three near-identical components
 * that never appeared as the one set they are. They now render as rows inside
 * NotificationsSettingsSection, and this is the shell they share.
 *
 * The layout is lifted verbatim from what those three already had in common:
 * icon + description left, button right, stacking to a column below sm. The
 * only addition is a real title per row — the section kicker used to carry it,
 * and a row needs its own name once three of them sit together.
 */
export function SettingRow({
  icon,
  title,
  titleBadge,
  description,
  action,
  error,
}: SettingRowProps) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-content-primary">
              {title}
              {titleBadge}
            </p>
            <p className="mt-1 max-w-[46ch] text-sm text-content-secondary">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0 sm:pt-0.5">{action}</div> : null}
      </div>
      {/* Bare, not the boxed feedback style the form sections use: a bordered
          block inside a compact row reads as heavier than the row it belongs
          to. */}
      {error ? <p className="mt-2 text-sm text-status-error">{error}</p> : null}
    </div>
  );
}

/** Shared by all three notification rows so their buttons can't drift apart.
 * `on` flips to the neutral treatment because turning something OFF should not
 * be the brand-colored primary action. */
export const settingRowButtonClass = (on: boolean) =>
  `shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
    on
      ? 'border border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
      : 'bg-brand text-content-inverse hover:bg-brand-hover'
  }`;
