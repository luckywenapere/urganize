'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from '@/components/icons';
import { stackChipText, stackView } from '@/lib/home/stack';

/** The frame every card in a stack shares. */
const CARD_FRAME = 'rounded-2xl border bg-bg-surface';
const CARD_TONE_DEFAULT = 'border-stroke-default';

type HomeStackProps<T> = {
  /** The group's name on the chip, e.g. "Tasks". */
  label: string;
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, context: { isTop: boolean }) => ReactNode;
  /** Show the item count on the chip. Off for a group that is always one thing. */
  showCount?: boolean;
  /** A card's border and ground, when one should stand out (a rollout coming soon). */
  cardTone?: (item: T) => string | null;
  /** Shown under the last card, only while the group is open. */
  footer?: ReactNode;
  /** For the guided tour (lib/tours.ts). */
  tourAnchor?: string;
};

/**
 * One of Home's stacked groups (2026-10-07, founder call). Folded, the first
 * item shows in full and the next ones peek out behind it as card edges, like
 * a pile of notifications on a phone. The chip on the stack's top edge names
 * the group ("Tasks · 5") and opens and closes it; tapping the peeking edges
 * opens it too. Every visit starts folded.
 *
 * The top card stays fully usable while folded: a task can be ticked or
 * opened without opening the group first. A group with nothing in it draws
 * nothing at all, and a group with one item shows the card and chip with no
 * edges and nothing to open. lib/home/stack.ts holds those rules.
 *
 * The peeking edges sit in space the stack reserves for them below the top
 * card, so they never cover whatever comes next on the page.
 */
export function HomeStack<T>({
  label,
  items,
  getKey,
  renderItem,
  showCount = true,
  cardTone,
  footer,
  tourAnchor,
}: HomeStackProps<T>) {
  const [open, setOpen] = useState(false);
  const chipId = useId();
  const listId = useId();
  const view = stackView(items.length, open);
  if (view.visible === 0) return null;

  const chip = stackChipText(label, showCount ? items.length : null);
  const shown = items.slice(0, view.visible);
  // Each peeking edge shows 8px below the card in front of it.
  const reserve = view.peeks === 2 ? 'pb-4' : view.peeks === 1 ? 'pb-2' : '';

  return (
    <section aria-labelledby={chipId} data-tour={tourAnchor} className="relative pt-3.5">
      <h2 className="absolute left-3 top-0 z-20">
        {view.toggleable ? (
          <button
            type="button"
            id={chipId}
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={listId}
            className="motion-focus relative inline-flex h-7 items-center gap-1 rounded-full border border-stroke-strong bg-bg-base px-2.5 text-[11px] font-semibold text-content-secondary transition-colors before:absolute before:-inset-2 before:content-[''] hover:text-content-primary"
          >
            {chip}
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <span
            id={chipId}
            className="inline-flex h-7 items-center rounded-full border border-stroke-strong bg-bg-base px-2.5 text-[11px] font-semibold text-content-secondary"
          >
            {chip}
          </span>
        )}
      </h2>

      <div className={`relative ${reserve}`}>
        <ul id={listId} className="space-y-3">
          {shown.map((item, index) => {
            const tone = cardTone?.(item) ?? CARD_TONE_DEFAULT;
            const isTop = index === 0;
            return (
              <li
                key={getKey(item)}
                className={`relative z-10 ${CARD_FRAME} ${tone} p-4 ${isTop ? 'pt-6' : 'animate-enter'}`}
              >
                {renderItem(item, { isTop })}
              </li>
            );
          })}
        </ul>
        {view.peeks > 0 ? (
          <>
            {/* The edges of the cards folded behind the top one. Drawn, not
                read: the chip says how many there are. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-3 top-4 ${view.peeks === 2 ? 'bottom-2' : 'bottom-0'} ${CARD_FRAME} border-stroke-default bg-bg-elevated`}
            />
            {view.peeks === 2 ? (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-6 bottom-0 top-6 ${CARD_FRAME} border-stroke-default bg-bg-elevated opacity-60`}
              />
            ) : null}
            {/* Tapping the edges opens the group. The target reaches 12px into
                the gap below so it is big enough for a thumb. Keyboard and
                screen reader users open it with the chip. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => setOpen(true)}
              className={`absolute inset-x-3 -bottom-3 z-0 cursor-pointer ${view.peeks === 2 ? 'h-7' : 'h-5'}`}
            />
          </>
        ) : null}
      </div>
      {open && footer ? <div className="mt-3 px-1">{footer}</div> : null}
    </section>
  );
}
