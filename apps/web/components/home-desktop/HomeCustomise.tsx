'use client';

// Customise Home (#1182, mock docs/mocks/home-tighter, note 9): drag a block to
// move it, Remove to hide it, add it back from "Add to Home", Reset, Done.
// The rules are lib/home-desktop/layout.ts; nothing is saved until Done, or
// until Home is pressed in the top menu, which saves the same way (#1254).
//
// Keyboard: every block's handle is a button. With it focused, the up and down
// arrow keys move the block one place (Home and End send it to the top or the
// bottom), and the move is read out. The list is one flat grid keyed by block,
// so a block keeps focus while it moves.

import { useCallback, useEffect, useState } from 'react';
import { GripVertical, Plus } from '@/components/icons';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_BLOCK_COPY,
  LOCKED_HOME_BLOCK,
  addBlock,
  isDefaultLayout,
  layoutRows,
  moveBlock,
  readLayout,
  removeBlock,
  type HomeBlockId,
  type HomeLayout,
} from '@/lib/home-desktop/layout';
import { registerHomeEditSave } from '@/lib/home-desktop/edit-save';
import { HOME_WALLPAPER_COPY } from '@/lib/home-desktop/wallpaper';
import { HomeWallpaperChoice } from './HomeWallpaper';

const GHOST =
  'motion-focus motion-press inline-flex h-9 items-center rounded-full border border-stroke-control px-4 text-[13px] font-medium text-content-primary hover:bg-bg-hover disabled:opacity-50';

export function HomeCustomise({
  initial,
  available,
  onDone,
}: {
  initial: HomeLayout;
  /** Every block, on Home or under "Add to Home". */
  available: readonly HomeBlockId[];
  /** Called with the layout to keep. Resolves false when saving failed. */
  onDone: (layout: HomeLayout) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<HomeLayout>(initial);
  const [dragging, setDragging] = useState<HomeBlockId | null>(null);
  const [said, setSaid] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const order = draft.order.filter((id) => available.includes(id));
  const tray = draft.removed.filter((id) => available.includes(id));
  const paired = new Set(layoutRows(order).filter((row) => row.length === 2).flat());

  const move = (id: HomeBlockId, toVisibleIndex: number) => {
    const clamped = Math.max(0, Math.min(toVisibleIndex, order.length - 1));
    const target = order[clamped];
    if (!target || target === id) return;
    setDraft((current) => moveBlock(current, id, current.order.indexOf(target)));
    setSaid(`${HOME_BLOCK_COPY[id].title} moved to place ${clamped + 1} of ${order.length}.`);
  };

  const onKey = (event: React.KeyboardEvent, id: HomeBlockId) => {
    const at = order.indexOf(id);
    const to =
      event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? at - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? at + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? order.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    move(id, to);
  };

  const done = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onDone(draft);
    // On success the parent closes this mode; on failure it stays to say so.
    if (!ok) {
      setSaving(false);
      setFailed(true);
    }
  }, [draft, onDone, saving]);

  // Pressing Home in the top menu saves too (#1254), the same as Done.
  useEffect(() => registerHomeEditSave(() => void done()), [done]);

  return (
    <div data-home-customise>
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-brand/10 px-4 py-3">
        <p className="min-w-0 text-sm text-content-secondary">
          <span className="font-semibold text-content-primary">Customise Home</span> · Drag to reorder. Remove what you
          don&apos;t use. Only you see this layout.
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className={GHOST}
            disabled={isDefaultLayout(draft)}
            onClick={() => {
              setDraft(readLayout(DEFAULT_HOME_LAYOUT));
              setSaid('Home is back to how it started.');
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => void done()}
            disabled={saving}
            className="motion-focus motion-press inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? 'Saving' : 'Done'}
          </button>
        </span>
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-[13px] text-status-error">
          We could not save your layout. Check your connection and press Done again.
        </p>
      ) : null}

      <ul className="mt-4 grid grid-cols-2 gap-3" aria-label="Blocks on Home, in order">
        {order.map((id, index) => {
          const copy = HOME_BLOCK_COPY[id];
          const locked = id === LOCKED_HOME_BLOCK;
          return (
            <li
              key={id}
              draggable
              onDragStart={(event) => {
                setDragging(id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', id);
              }}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                if (dragging !== id) move(dragging, index);
              }}
              onDrop={(event) => event.preventDefault()}
              onDragEnd={() => setDragging(null)}
              className={`flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-stroke-control bg-bg-surface py-3.5 pl-2 pr-4 ${
                paired.has(id) ? 'col-span-1' : 'col-span-2'
              } ${dragging === id ? 'opacity-50' : ''}`}
            >
              <button
                type="button"
                onKeyDown={(event) => onKey(event, id)}
                aria-label={`Move ${copy.title}. Place ${index + 1} of ${order.length}. Use the arrow keys.`}
                className="motion-focus grid h-9 w-8 shrink-0 cursor-grab place-items-center rounded-md text-content-tertiary hover:bg-bg-hover hover:text-content-primary active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-content-primary">{copy.title}</span>
                <span className="block text-xs leading-4 text-content-secondary">{copy.about}</span>
              </span>
              {locked ? (
                <span className="shrink-0 text-[13px] font-medium text-content-tertiary">Always on</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDraft((current) => removeBlock(current, id));
                    setSaid(`${copy.title} removed from Home.`);
                  }}
                  aria-label={`Remove ${copy.title} from Home`}
                  className="motion-focus shrink-0 rounded-md px-1 text-[13px] font-semibold text-status-error hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {tray.length > 0 ? (
        <>
          <h2 className="mt-6 font-display text-lg font-normal leading-6 text-content-primary">Add to Home</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {tray.map((id) => {
              const copy = HOME_BLOCK_COPY[id];
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-stroke-control px-4 py-3.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-content-primary">{copy.title}</span>
                    <span className="block text-xs leading-4 text-content-secondary">{copy.about}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((current) => addBlock(current, id));
                      setSaid(`${copy.title} added to the bottom of Home.`);
                    }}
                    aria-label={`Add ${copy.title} to Home`}
                    className="motion-focus inline-flex shrink-0 items-center gap-1 rounded-md px-1 text-[13px] font-semibold text-brand hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {/* The wallpaper (#1305): the same choice as the top bar's button and
          Settings. It saves as it is picked, apart from the layout's Done. */}
      <section aria-labelledby="home-customise-wallpaper" className="mt-8 max-w-[360px]">
        <h2 id="home-customise-wallpaper" className="font-display text-lg font-normal leading-6 text-content-primary">
          {HOME_WALLPAPER_COPY.title}
        </h2>
        <p className="mt-0.5 text-[13px] leading-[18px] text-content-secondary">{HOME_WALLPAPER_COPY.about}</p>
        <HomeWallpaperChoice source="customise" className="mt-3" />
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
