'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/shared/ToastProvider';
import {
  NON_SONG_ITEM_COPY,
  NON_SONG_ITEM_DEFAULT_SECONDS,
  SONG_VERSION_LABEL_COPY,
  describeSetlistFit,
  formatDuration,
  formatSetTotal,
  summarizeSetlist,
  type SetlistItemType,
  type SetlistSummaryItem,
  type SongVersionLabel,
} from '@/lib/setlist';
import { SetRowEditor, type BuilderItem } from './SetRowEditor';
import { SongPicker, type CatalogSong } from './SongPicker';
import { SongCatalogSheet } from './SongCatalogSheet';

type SetlistBuilderProps = {
  setlistId: string;
  artistId: string;
  artistName: string;
  setLengthMinutes: number;
  canEdit: boolean;
  /** Told whenever the set's contents change, so the "Send the tracks" card
   *  can say how many songs still have no file. */
  onItemsChange?: (items: BuilderItem[]) => void;
};

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* non-JSON */
  }
  return fallback;
}

const NON_SONG_TYPES = Object.keys(NON_SONG_ITEM_COPY) as Exclude<SetlistItemType, 'song'>[];

/** Space between rows, in px. The drag maths reads it, so it lives in one place. */
const ROW_GAP = 8;

type DragState = { id: string; pointerId: number; startY: number };

/**
 * The set, and the number that makes it worth having.
 *
 * The running total is recomputed locally on every change from the SAME pure
 * summarizeSetlist the API uses, so it never lags a round trip while rows are
 * being moved, and cannot disagree with the server.
 *
 * REORDER IS DRAG NOW (2026-09-25), hand-rolled on pointer events so it works
 * with a mouse, a finger and a pen without a new dependency: press the handle,
 * move, let go. The handle also answers the arrow keys, and every row's editor
 * has Move up and Move down, so nothing depends on being able to drag. If the
 * set changed underneath (someone else reordered it), the save is refused and
 * the latest order is loaded rather than overwritten.
 */
export function SetlistBuilder({
  setlistId,
  artistId,
  artistName,
  setLengthMinutes,
  canEdit,
  onItemsChange,
}: SetlistBuilderProps) {
  const { pushToast } = useToast();
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const [dragOrder, setDragOrder] = useState<BuilderItem[] | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragOrderRef = useRef<BuilderItem[] | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterMove = useRef<string | null>(null);

  const loadItems = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/setlists/${setlistId}/items`, { headers });
      if (!response.ok) {
        setLoadError(await readError(response, 'Couldn’t load the set.'));
        return;
      }
      const body = await response.json();
      const next: BuilderItem[] = Array.isArray(body.items) ? body.items : [];
      setItems(next);
      setLoadError('');
    } catch {
      setLoadError('Couldn’t reach the server. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [setlistId]);

  const loadCatalog = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`/api/songs?artistId=${encodeURIComponent(artistId)}`, { headers });
      if (!response.ok) return;
      const body = await response.json();
      setCatalog(Array.isArray(body.songs) ? body.songs : []);
    } catch {
      /* The picker still takes a new title without the catalog. */
    }
  }, [artistId]);

  useEffect(() => {
    void loadItems();
    void loadCatalog();
  }, [loadItems, loadCatalog]);

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  // Keyboard reorder keeps focus on the handle of the row that moved.
  useEffect(() => {
    const id = focusAfterMove.current;
    if (!id) return;
    focusAfterMove.current = null;
    handleRefs.current.get(id)?.focus();
  }, [items]);

  const shown = dragOrder ?? items;

  // Local recompute, from the same function the server runs.
  const summary = useMemo(() => {
    const inputs: SetlistSummaryItem[] = items.map((item) => ({
      itemType: item.itemType,
      itemSeconds: item.durationSeconds,
      versionSeconds: item.version?.durationSeconds ?? null,
      songSeconds: item.song?.durationSeconds ?? null,
    }));
    return summarizeSetlist(inputs, setLengthMinutes);
  }, [items, setLengthMinutes]);

  const inSetIds = useMemo(
    () => new Set(items.map((item) => item.songId).filter((id): id is string => Boolean(id))),
    [items]
  );

  const saveOrder = async (next: BuilderItem[], previous: BuilderItem[]) => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`/api/setlists/${setlistId}/reorder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ itemIds: next.map((item) => item.id) }),
      });
      if (response.status === 409) {
        pushToast('Someone else changed this set. Here’s the latest.', 'warning');
        await loadItems();
        return;
      }
      if (!response.ok) {
        pushToast(await readError(response, 'Couldn’t save the new order.'), 'error');
        setItems(previous);
      }
    } catch {
      pushToast('Couldn’t reach the server. The order wasn’t saved.', 'error');
      setItems(previous);
    }
  };

  const titleOf = (item: BuilderItem) =>
    item.itemType === 'song'
      ? item.song?.title || 'Untitled song'
      : item.label || NON_SONG_ITEM_COPY[item.itemType as Exclude<SetlistItemType, 'song'>];

  const move = (index: number, direction: -1 | 1, keepFocus = false) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    if (keepFocus) focusAfterMove.current = next[target].id;
    setItems(next);
    setAnnouncement(`Moved ${titleOf(next[target])} to ${target + 1} of ${next.length}.`);
    void saveOrder(next, previous);
  };

  // ── Drag ────────────────────────────────────────────────────────────────
  const startDrag = (pointerEvent: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (!canEdit || busy) return;
    if (pointerEvent.pointerType === 'mouse' && pointerEvent.button !== 0) return;
    pointerEvent.preventDefault();
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    dragRef.current = { id, pointerId: pointerEvent.pointerId, startY: pointerEvent.clientY };
    dragOrderRef.current = items;
    setDragOrder(items);
    setDragId(id);
    setDragDy(0);
    setOpenId(null);
  };

  const moveDrag = (pointerEvent: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const order = dragOrderRef.current;
    if (!drag || !order || pointerEvent.pointerId !== drag.pointerId) return;
    let dy = pointerEvent.clientY - drag.startY;
    let list = order;
    let index = list.findIndex((item) => item.id === drag.id);

    // Swap past a neighbour once the pointer crosses its middle, then measure
    // from the new slot, so the row stays under the finger.
    for (let guard = 0; guard < list.length; guard += 1) {
      if (dy > 0 && index < list.length - 1) {
        const neighbour = rowRefs.current.get(list[index + 1].id);
        const step = (neighbour?.offsetHeight ?? 48) + ROW_GAP;
        if (dy > step / 2) {
          list = [...list];
          [list[index], list[index + 1]] = [list[index + 1], list[index]];
          index += 1;
          drag.startY += step;
          dy -= step;
          continue;
        }
      } else if (dy < 0 && index > 0) {
        const neighbour = rowRefs.current.get(list[index - 1].id);
        const step = (neighbour?.offsetHeight ?? 48) + ROW_GAP;
        if (-dy > step / 2) {
          list = [...list];
          [list[index], list[index - 1]] = [list[index - 1], list[index]];
          index -= 1;
          drag.startY -= step;
          dy += step;
          continue;
        }
      }
      break;
    }

    if (list !== order) {
      dragOrderRef.current = list;
      setDragOrder(list);
    }
    setDragDy(dy);
  };

  const endDrag = (pointerEvent: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || pointerEvent.pointerId !== drag.pointerId) return;
    const final = dragOrderRef.current ?? items;
    dragRef.current = null;
    dragOrderRef.current = null;
    setDragId(null);
    setDragDy(0);
    setDragOrder(null);

    const changed = !cancelled && final.some((item, index) => item.id !== items[index]?.id);
    if (!changed) return;
    const previous = items;
    setItems(final);
    const position = final.findIndex((item) => item.id === drag.id);
    if (position >= 0) {
      setAnnouncement(`Moved ${titleOf(final[position])} to ${position + 1} of ${final.length}.`);
    }
    void saveOrder(final, previous);
  };

  // ── Adding ──────────────────────────────────────────────────────────────
  const addItem = async (body: Record<string, unknown>, fallback: string): Promise<string | null> => {
    const headers = await authHeaders();
    if (!headers) return null;
    setBusy(true);
    try {
      const response = await fetch(`/api/setlists/${setlistId}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        pushToast(await readError(response, fallback), 'error');
        return null;
      }
      const created = await response.json();
      await loadItems();
      return created?.item?.id ? String(created.item.id) : null;
    } catch {
      pushToast('Couldn’t reach the server. Check your connection.', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addSong = async (songId: string) => {
    await addItem({ itemType: 'song', songId }, 'Couldn’t add that song.');
  };

  const createSong = async (title: string) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    try {
      const response = await fetch('/api/songs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ artistId, title }),
      });
      if (!response.ok) {
        pushToast(await readError(response, 'Couldn’t add the song.'), 'error');
        return;
      }
      const body = await response.json();
      void loadCatalog();
      if (body.song?.id) {
        setBusy(false);
        const itemId = await addItem({ itemType: 'song', songId: body.song.id }, 'Couldn’t add that song.');
        // A brand-new song has no file and no length yet: open it so both are
        // one tap away.
        if (itemId) setOpenId(itemId);
      }
    } catch {
      pushToast('Couldn’t reach the server. Check your connection.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addNonSong = async (type: Exclude<SetlistItemType, 'song'>) => {
    const itemId = await addItem(
      { itemType: type, durationSeconds: NON_SONG_ITEM_DEFAULT_SECONDS[type] },
      `Couldn’t add the ${NON_SONG_ITEM_COPY[type].toLowerCase()}.`
    );
    if (itemId) setOpenId(itemId);
  };

  const removeItem = async (item: BuilderItem) => {
    const headers = await authHeaders();
    if (!headers) return;
    const previous = items;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setOpenId(null);
    try {
      const response = await fetch(`/api/setlists/${setlistId}/items/${item.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok && response.status !== 404) {
        pushToast(await readError(response, 'Couldn’t remove that.'), 'error');
        setItems(previous);
        return;
      }
      setAnnouncement(`Removed ${titleOf(item)}.`);
    } catch {
      pushToast('Couldn’t reach the server. It wasn’t removed.', 'error');
      setItems(previous);
    }
  };

  // ── View ────────────────────────────────────────────────────────────────
  const fitClass =
    summary.fit === 'over'
      ? 'border-status-error/30 bg-status-error/10 text-status-error'
      : summary.fit === 'on_time' && !summary.isPartial
        ? 'border-brand/30 bg-brand/10 text-brand'
        : 'border-stroke-default bg-bg-surface text-content-secondary';

  let songNumber = 0;

  return (
    <div>
      {/* The running total. First, because it is the reason this panel exists. */}
      <div className={`rounded-xl border p-4 ${fitClass}`} aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-2xl font-semibold tabular-nums">
            {formatSetTotal(summary.totalSeconds)}
            {summary.isPartial ? <span className="text-base font-normal"> so far</span> : null}
          </p>
          <p className="text-sm">of {setLengthMinutes} min</p>
        </div>
        <p className="mt-1 text-sm">{describeSetlistFit(summary)}</p>
      </div>

      {loadError ? (
        <div role="alert" className="mt-3 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          {loadError}{' '}
          <button type="button" onClick={() => void loadItems()} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <ol className="mt-4 space-y-2">
        {isLoading ? (
          [0, 1, 2].map((key) => (
            <li key={key} className="h-14 animate-pulse rounded-lg border border-stroke-default bg-bg-surface" />
          ))
        ) : shown.length === 0 ? (
          <li className="rounded-lg border border-dashed border-stroke-default p-6 text-center text-sm text-content-secondary">
            {canEdit ? 'Nothing in the set yet. Add the first song below.' : 'Nothing in the set yet.'}
          </li>
        ) : (
          shown.map((item, index) => {
            const isSong = item.itemType === 'song';
            if (isSong) songNumber += 1;
            const isDragging = dragId === item.id;
            const isOpen = openId === item.id;
            const length = formatDuration(item.resolvedDurationSeconds);
            const versionLabel =
              item.version && item.version.label !== 'original'
                ? SONG_VERSION_LABEL_COPY[item.version.label as SongVersionLabel] ?? item.version.label
                : null;

            const rowBody = (
              <>
                <span className="w-6 shrink-0 text-center font-mono text-xs text-content-tertiary">
                  {isSong ? songNumber : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`line-clamp-2 break-words text-sm font-semibold ${
                      isSong ? 'text-content-primary' : 'text-content-secondary'
                    }`}
                  >
                    {titleOf(item)}
                    {versionLabel ? (
                      <span className="ml-1.5 font-normal text-content-tertiary">({versionLabel})</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-content-tertiary">
                    {length ? (
                      <span className="tabular-nums">{length}</span>
                    ) : (
                      <span className="font-semibold text-status-warning">Needs a length</span>
                    )}
                    {item.song?.bpm ? <span>{item.song.bpm} BPM</span> : null}
                    {item.song?.musicalKey ? <span>{item.song.musicalKey}</span> : null}
                    {isSong && !item.version ? (
                      <span className="font-semibold text-status-warning">No file</span>
                    ) : null}
                    {item.cueNote ? <span className="line-clamp-2 break-words italic">{item.cueNote}</span> : null}
                  </span>
                </span>
              </>
            );

            return (
              <li
                key={item.id}
                ref={(element) => {
                  if (element) rowRefs.current.set(item.id, element);
                  else rowRefs.current.delete(item.id);
                }}
                style={isDragging ? { transform: `translateY(${dragDy}px)` } : undefined}
                className={`rounded-lg border bg-bg-surface ${
                  isDragging
                    ? 'relative z-10 border-brand shadow-lg'
                    : isSong
                      ? 'border-stroke-default'
                      : 'border-dashed border-stroke-default'
                }`}
              >
                <div className="flex items-center gap-2 p-2">
                  {canEdit ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left hover:bg-bg-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                      aria-expanded={isOpen}
                    >
                      {rowBody}
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3 p-1">{rowBody}</div>
                  )}
                  {canEdit ? (
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) handleRefs.current.set(item.id, element);
                        else handleRefs.current.delete(item.id);
                      }}
                      aria-label={`Move ${titleOf(item)}. Use the arrow keys.`}
                      onPointerDown={(pointerEvent) => startDrag(pointerEvent, item.id)}
                      onPointerMove={moveDrag}
                      onPointerUp={(pointerEvent) => endDrag(pointerEvent)}
                      onPointerCancel={(pointerEvent) => endDrag(pointerEvent, true)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === 'ArrowUp') {
                          keyEvent.preventDefault();
                          move(index, -1, true);
                        } else if (keyEvent.key === 'ArrowDown') {
                          keyEvent.preventDefault();
                          move(index, 1, true);
                        }
                      }}
                      className={`grid h-9 w-9 shrink-0 touch-none place-items-center rounded-md text-content-tertiary hover:text-content-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                        isDragging ? 'cursor-grabbing' : 'cursor-grab'
                      }`}
                    >
                      <GripVertical className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
                {isOpen && canEdit ? (
                  <div className="px-2 pb-2">
                    <SetRowEditor
                      key={item.id}
                      item={item}
                      setlistId={setlistId}
                      isFirst={index === 0}
                      isLast={index === shown.length - 1}
                      onReload={loadItems}
                      onMove={(direction) => move(index, direction)}
                      onRemove={() => void removeItem(item)}
                      onClose={() => setOpenId(null)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ol>

      {canEdit ? (
        <div className="mt-4 space-y-3">
          <SongPicker catalog={catalog} inSetIds={inSetIds} busy={busy} onPick={addSong} onCreate={createSong} />
          <div className="flex flex-wrap items-center gap-2">
            {NON_SONG_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => void addNonSong(type)}
                disabled={busy}
                className="motion-focus rounded-full border border-stroke-default px-3 py-1 text-xs font-semibold text-content-secondary hover:border-brand hover:text-content-primary disabled:opacity-50"
              >
                + {NON_SONG_ITEM_COPY[type]}
              </button>
            ))}
            {catalog.length > 0 ? (
              <button
                type="button"
                onClick={() => setIsCatalogOpen(true)}
                className="motion-focus ml-auto text-xs font-semibold text-content-tertiary hover:text-content-primary"
              >
                {artistName ? `${artistName}’s songs` : 'All songs'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isCatalogOpen ? (
        <SongCatalogSheet
          artistName={artistName}
          songs={catalog}
          onClose={() => setIsCatalogOpen(false)}
          onChanged={() => {
            void loadCatalog();
            void loadItems();
          }}
        />
      ) : null}
    </div>
  );
}
