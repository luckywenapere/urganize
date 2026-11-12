/* eslint-disable @next/next/no-img-element */
'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Check, LayoutGrid, Loader2, NotebookPen, Pencil, Plus, RotateCcw, X } from '@/components/icons';
import {
  BOARD_COLUMNS,
  BOARD_PALETTE_MAX,
  BOARD_HEADLINE_MAX,
  boardPhoneOrder,
  briefCountdown,
  coverTitleFontSize,
  momentsTrack,
  normalizeHex,
  swatchInk,
  type BoardCardKey,
  type BoardPlacement,
  type BriefFeel,
  type BriefFeelPatch,
} from '@/lib/brief-board';
import {
  isNoteKey,
  layoutPhoneOrder,
  moveBoardCard,
  nudgeBoardCard,
  resolveBoardLayout,
  type BoardKey,
  type BoardLayout,
  type NudgeDirection,
} from '@/lib/brief-board-layout';
import {
  CaptionEditor,
  NoteComposer,
  readCoverPalette,
  StickyCard,
  useBriefImageUploads,
  useFileDrop,
} from './BriefBoardMedia';
import { BriefPiecesCard } from './BriefPiecesCard';
import {
  formatBriefDay,
  initialsFor,
  referenceColor,
  referenceDisplayTitle,
  type BriefPayload,
  type BriefReference,
} from '@/lib/release-brief';
import { BriefAvatar, briefCall } from './brief-shared';

/**
 * The brief as a board (#897, phase 1; mock approved 2026-10-30:
 * docs/mocks/visual-brief/mock.html). Cards on a 12-column grid: the record,
 * the idea and how it should feel on top, the look and sound next, then the
 * work. A wide board places cards by `boardPlacements`; a narrow one (a phone,
 * or a squeezed panel) stacks them in `boardPhoneOrder`. Rows size to their
 * content. The rollout's owner and team admins can arrange it (phase 1b):
 * drag a card, pull its corner, or use the arrow keys; the board saves where
 * each card sits, and a phone reads an arranged board top to bottom.
 *
 * The scene still owns loading, the idea's autosave, the ideas round and the
 * sheets. It hands the pieces it already renders (the idea field, decisions,
 * to settle, ideas, notes, new version) in as slots, so there is one copy of
 * each behaviour.
 */

type Props = {
  brief: BriefPayload;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
  /** Merge a change into the loaded brief. */
  onPatch: (update: (brief: BriefPayload) => BriefPayload) => void;
  /** Re-read quietly (history and "edited by" move after a save). */
  onRefresh: () => void;
  /** A wide board's top line, left of Note and Arrange: the brief's title and
   *  who edited it (#1230). */
  heading?: ReactNode;
  /** Under that line, above the cards: the approval round's card. */
  banner?: ReactNode;
  slots: {
    idea: ReactNode;
    decisions: ReactNode;
    settle: ReactNode | null;
    side: { label: string; body: ReactNode } | null;
    footer: ReactNode | null;
  };
};

/** A board narrower than this stacks into one column. */
const WIDE_BOARD_PX = 860;

const CARD = 'relative min-w-0 overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface p-[18px]';
// Plain sentence case on a computer (#1230); a phone keeps its small capitals.
const LABEL =
  'text-[11px] font-bold uppercase tracking-[0.09em] text-content-tertiary lg:text-[13px] lg:font-semibold lg:normal-case lg:tracking-normal lg:text-content-secondary';
const LINK_BUTTON = 'motion-focus text-[12.5px] font-semibold text-brand transition-opacity hover:opacity-80';
const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-[16px] text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none lg:text-sm';

function CardLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className={LABEL}>{children}</h3>
      {action}
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 text-[13.5px] text-content-tertiary">{children}</p>;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

async function saveFeel(releaseId: string, patch: BriefFeelPatch) {
  return briefCall<{ feel: BriefFeelPatch }>(`/api/releases/${encodeURIComponent(releaseId)}/brief`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

async function saveLayout(releaseId: string, layout: BoardLayout) {
  const cards = (Object.keys(layout) as BoardCardKey[]).map((key) => ({ key, ...layout[key]! }));
  return briefCall<{ layout: BoardLayout }>(`/api/releases/${encodeURIComponent(releaseId)}/brief/layout`, {
    method: 'PUT',
    body: JSON.stringify({ cards }),
  });
}

async function resetLayout(releaseId: string) {
  return briefCall<{ layout: null }>(`/api/releases/${encodeURIComponent(releaseId)}/brief/layout`, {
    method: 'DELETE',
  });
}

const CARD_NAMES: Record<BoardCardKey, string> = {
  cover: 'Cover',
  idea: 'Idea',
  countdown: 'Countdown',
  feels: 'Feels like',
  palette: 'Colours',
  look: 'Look',
  sound: 'Sound and links',
  decisions: 'Decided',
  settle: 'To settle',
  pieces: 'What we’re making',
  moments: 'Key moments',
  people: 'Who’s on what',
  side: 'Notes',
};

const ARROWS: Record<string, NudgeDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** Row tops and heights of the grid as drawn, so a drag maps the pointer to a row. */
function gridRows(grid: HTMLElement): { tops: number[]; heights: number[]; gap: number } {
  const style = getComputedStyle(grid);
  const gap = parseFloat(style.rowGap) || 0;
  const heights = style.gridTemplateRows.split(' ').map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value));
  const tops: number[] = [];
  let cursor = 0;
  for (const height of heights) {
    tops.push(cursor);
    cursor += height + gap;
  }
  return { tops, heights, gap };
}

/** The 1-based row whose top is nearest `px` from the grid's top; past the last row is one more. */
function rowAt(rows: { tops: number[]; heights: number[] }, px: number): number {
  let best = 0;
  rows.tops.forEach((top, index) => {
    if (Math.abs(top - px) < Math.abs(rows.tops[best] - px)) best = index;
  });
  const last = rows.tops.length - 1;
  if (last >= 0 && px > rows.tops[last] + rows.heights[last] / 2) return last + 2;
  return best + 1;
}

/** Cards slide to their new place instead of jumping (skipped when the device asks for less motion). */
function useSlide(grid: React.RefObject<HTMLDivElement | null>, signature: string) {
  const before = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, DOMRect>();
    node.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {
      const key = card.dataset.card as string;
      const rect = card.getBoundingClientRect();
      next.set(key, rect);
      const old = before.current.get(key);
      if (still || !old || card.dataset.dragging === 'true') return;
      const dx = old.left - rect.left;
      const dy = old.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: 180,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      });
    });
    before.current = next;
  }, [grid, signature]);
}

type Drag = {
  key: BoardKey;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  from: BoardPlacement;
  base: BoardLayout;
  colWidth: number;
  rows: { tops: number[]; heights: number[]; gap: number };
  /** The card's top and bottom in grid pixels when the drag began. */
  top: number;
  bottom: number;
};

// ── Cards ───────────────────────────────────────────────────────────────────

function CoverCard({ brief, wide }: { brief: BriefPayload; wide: boolean }) {
  const { board } = brief;
  const day = board.releaseDate ? formatBriefDay(board.releaseDate.slice(0, 10)) : null;
  // No art: a flat tile in the rollout's darkest colour (never a gradient
  // placeholder), so the title still carries the card.
  const flat = board.feel.palette.find((hex) => swatchInk(hex) === 'light') ?? '#1a1611';
  return (
    <section
      aria-label="Cover"
      className={`relative min-w-0 overflow-hidden rounded-2xl ${wide ? 'min-h-[360px]' : 'aspect-[4/5] max-h-[360px] w-full'}`}
      style={{ background: flat }}
    >
      {board.coverUrl ? (
        <>
          <img src={board.coverUrl} alt={`${board.title} cover art`} className="absolute inset-0 h-full w-full object-cover" />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[62%]"
            style={{ background: 'linear-gradient(to top, rgba(28,16,9,.88), rgba(28,16,9,0))' }}
          />
        </>
      ) : null}
      {wide ? (
        // A wide board's cover is a quarter of the board (#1230): the title is
        // sized so its longest word fits, and wraps only at spaces, so it never
        // breaks mid-word ("Owa / mbe / Seas / on").
        <div className="absolute inset-x-[18px] bottom-[18px] text-[#f7ecd8] [container-type:inline-size]">
          <p className="truncate text-[12px] font-bold uppercase tracking-[0.06em] opacity-85">{board.artistName || 'Rollout'}</p>
          <h2
            className="mt-1 font-display leading-[1.12] tracking-[-0.01em] [hyphens:none] [overflow-wrap:normal] [word-break:normal]"
            style={{ fontSize: coverTitleFontSize(board.title) }}
          >
            {board.title}
          </h2>
          <p className="mt-1.5 text-[13px] opacity-85">{day ? `Out ${day}` : 'No release day yet'}</p>
        </div>
      ) : (
        <div className="absolute inset-x-5 bottom-5 text-[#f7ecd8] lg:inset-x-6 lg:bottom-6">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] opacity-85">{board.artistName || 'Rollout'}</p>
          <h2
            className={`mt-1.5 break-words font-display leading-[0.92] tracking-[-0.03em] ${
              board.title.length > 14 ? 'text-[48px] lg:text-[60px]' : 'text-[64px] lg:text-[88px]'
            }`}
          >
            {board.title}
          </h2>
          <p className="mt-3 font-mono text-[12.5px] uppercase">{day ? `Out ${day}` : 'No release day yet'}</p>
        </div>
      )}
    </section>
  );
}

function CountdownCard({ brief }: { brief: BriefPayload }) {
  const { board } = brief;
  const count = briefCountdown(board.releaseDate, board.today);
  const { done, total, late } = board.progress;
  const share = total > 0 ? Math.round((done / total) * 100) : 0;
  const big = count.kind === 'none' ? '–' : count.kind === 'today' ? '0' : String(count.days);
  const unit =
    count.kind === 'none'
      ? 'Pick a release day'
      : count.kind === 'today'
        ? 'Release day'
        : count.kind === 'before'
          ? count.days === 1
            ? 'day to go'
            : 'days to go'
          : count.days === 1
            ? 'day since release'
            : 'days since release';
  return (
    <section aria-label="Release countdown" className={`${CARD} flex flex-col`}>
      <CardLabel>Release</CardLabel>
      <p className="mt-2 font-display text-[72px] leading-none tracking-[-0.04em] text-content-primary lg:text-[84px]">{big}</p>
      <p className="mt-1 text-[14px] text-content-secondary">{unit}</p>
      {total > 0 ? (
        <div className="mt-auto pt-5">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-bg-hover"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`${done} of ${total} done`}
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px] text-content-secondary">
            <span>
              {done} of {total} done
            </span>
            {late > 0 ? (
              <span className="rounded-full bg-status-error/10 px-2 py-px text-[11.5px] font-medium text-status-error">
                {late} late
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function IdeaCard({
  brief,
  ideaField,
  onPatch,
  onRefresh,
  onToast,
}: {
  brief: BriefPayload;
  ideaField: ReactNode;
  onPatch: Props['onPatch'];
  onRefresh: Props['onRefresh'];
  onToast: Props['onToast'];
}) {
  const saved = brief.board.feel.headline;
  const [headline, setHeadline] = useState(saved);
  useEffect(() => setHeadline(saved), [saved]);
  const canEdit = brief.viewer.canEdit;
  // Grow with the line (Safari has no field-sizing), and again when the card's width changes.
  const headlineRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const node = headlineRef.current;
    if (!node) return;
    const fit = () => {
      node.style.height = '0px';
      node.style.height = `${node.scrollHeight}px`;
    };
    fit();
    let lastWidth = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === lastWidth) return;
      lastWidth = node.clientWidth;
      fit();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [headline, canEdit]);

  const commit = async () => {
    const next = headline.trim();
    if (next === saved) return;
    const result = await saveFeel(brief.releaseId, { headline: next });
    if (!result.ok) {
      onToast(result.error, 'error');
      setHeadline(saved);
      return;
    }
    onPatch((current) => ({ ...current, board: { ...current.board, feel: { ...current.board.feel, headline: next } } }));
    onRefresh();
  };

  return (
    <section aria-label="The idea" className={`${CARD} flex flex-col`}>
      <CardLabel>The idea</CardLabel>
      {canEdit ? (
        <textarea
          ref={headlineRef}
          value={headline}
          rows={1}
          maxLength={BOARD_HEADLINE_MAX}
          onChange={(event) => setHeadline(event.target.value.replace(/\n/g, ' '))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              (event.target as HTMLTextAreaElement).blur();
            }
          }}
          onBlur={() => void commit()}
          placeholder="Say it in one line."
          aria-label="The idea in one line"
          className="mt-3 block w-full resize-none overflow-hidden bg-transparent font-display text-[26px] leading-[1.12] tracking-[-0.02em] text-content-primary placeholder:text-content-tertiary focus:outline-none lg:text-[30px]"
        />
      ) : saved ? (
        <p className="mt-3 font-display text-[26px] leading-[1.12] tracking-[-0.02em] text-content-primary lg:text-[30px]">{saved}</p>
      ) : null}
      <div className="mt-2 text-content-secondary [&_textarea]:text-[14.5px] [&_textarea]:text-content-secondary">{ideaField}</div>
    </section>
  );
}

/** Words typed with commas, saved as a list. */
function toWords(value: string): string[] {
  return value
    .split(/[,.\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function FeelsCard({ brief, onSave }: { brief: BriefPayload; onSave: (patch: BriefFeelPatch) => Promise<boolean> }) {
  const { feelsLike, notThis } = brief.board.feel;
  const [editing, setEditing] = useState(false);
  const [yes, setYes] = useState('');
  const [no, setNo] = useState('');
  const [saving, setSaving] = useState(false);
  const canEdit = brief.viewer.canEdit;

  const open = () => {
    setYes(feelsLike.join(', '));
    setNo(notThis.join(', '));
    setEditing(true);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await onSave({ feelsLike: toWords(yes), notThis: toWords(no) });
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <section aria-label="Feels like" className={`${CARD} flex flex-col`}>
      <CardLabel
        action={
          canEdit && !editing && (feelsLike.length || notThis.length) ? (
            <button type="button" onClick={open} aria-label="Edit feels like" className="motion-focus grid h-7 w-7 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null
        }
      >
        Feels like
      </CardLabel>
      {editing ? (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <input autoFocus value={yes} onChange={(event) => setYes(event.target.value)} placeholder="Sunlit, close, unpolished" aria-label="Feels like" className={FIELD} />
          <input value={no} onChange={(event) => setNo(event.target.value)} placeholder="Not this: glossy, club lights" aria-label="Not this" className={FIELD} />
          <p className="text-[12px] text-content-tertiary">Up to 6 words each, split with commas.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="motion-focus inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-content-inverse disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="motion-focus h-9 rounded-full px-3 text-[13px] text-content-secondary hover:text-content-primary">
              Cancel
            </button>
          </div>
        </form>
      ) : feelsLike.length || notThis.length ? (
        <>
          {feelsLike.length ? (
            <p className="mt-3 font-display text-[23px] leading-[1.18] tracking-[-0.015em] text-content-primary">
              {feelsLike.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}.`).join(' ')}
            </p>
          ) : null}
          {notThis.length ? (
            <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 text-[12.5px] text-content-tertiary">
              Not
              {notThis.map((word) => (
                <s key={word} className="text-content-secondary decoration-status-error decoration-[1.5px]">
                  {word}
                </s>
              ))}
            </p>
          ) : null}
        </>
      ) : canEdit ? (
        <button type="button" onClick={open} className="motion-focus mt-3 text-left text-[13.5px] text-content-tertiary hover:text-content-primary">
          + Three or four words for how it should feel, and what to avoid.
        </button>
      ) : (
        <EmptyLine>Not set yet.</EmptyLine>
      )}
    </section>
  );
}

function PaletteCard({
  brief,
  onSave,
  onToast,
}: {
  brief: BriefPayload;
  onSave: (patch: BriefFeelPatch) => Promise<boolean>;
  onToast: Props['onToast'];
}) {
  const { palette } = brief.board.feel;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const canEdit = brief.viewer.canEdit;
  const coverUrl = brief.board.coverUrl;

  const open = () => {
    setDraft(palette.length ? palette : ['#']);
    setEditing(true);
  };
  // The cover's colours (#897 phase 2), read in the browser and put in the
  // editor, so the team checks them before they are saved.
  const fromCover = async () => {
    if (!coverUrl || reading) return;
    setReading(true);
    const picked = await readCoverPalette(coverUrl, BOARD_PALETTE_MAX - 1);
    setReading(false);
    if (!picked) {
      onToast('Could not read the cover’s colours. Add them by hand.', 'warning');
      return;
    }
    setDraft(picked);
    setEditing(true);
  };
  const coverButton =
    canEdit && coverUrl ? (
      <button type="button" onClick={() => void fromCover()} disabled={reading} className={`${LINK_BUTTON} inline-flex items-center gap-1 disabled:opacity-60`}>
        {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        From the cover
      </button>
    ) : null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = draft.map((hex) => hex.trim()).filter((hex) => hex && hex !== '#');
    const bad = cleaned.find((hex) => !normalizeHex(hex));
    if (bad) {
      onToast(`${bad} is not a colour. Use a code like #E9A53C.`, 'error');
      return;
    }
    setSaving(true);
    const ok = await onSave({ palette: cleaned });
    setSaving(false);
    if (ok) setEditing(false);
  };
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(palette.join(' '));
      onToast('Colours copied.', 'success');
    } catch {
      onToast(palette.join(' '), 'warning');
    }
  };

  return (
    <section aria-label="Colour" className={`${CARD} flex flex-col`}>
      <CardLabel
        action={
          editing ? null : (
            <span className="flex items-center gap-3">
              {palette.length ? (
                <button type="button" onClick={() => void copyAll()} className={LINK_BUTTON}>
                  Copy all
                </button>
              ) : null}
              {canEdit && palette.length ? (
                <button type="button" onClick={open} aria-label="Edit colours" className="motion-focus grid h-7 w-7 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          )
        }
      >
        Colour
      </CardLabel>
      {editing ? (
        <form onSubmit={submit} className="mt-3 space-y-2">
          {draft.map((hex, index) => {
            const valid = normalizeHex(hex);
            return (
              <div key={index} className="flex items-center gap-2">
                <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-stroke-default" style={{ background: valid ?? 'transparent' }}>
                  <span className="sr-only">Pick colour {index + 1}</span>
                  <input
                    type="color"
                    value={valid ?? '#000000'}
                    onChange={(event) => setDraft((list) => list.map((item, i) => (i === index ? event.target.value.toUpperCase() : item)))}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
                <input
                  value={hex}
                  onChange={(event) => setDraft((list) => list.map((item, i) => (i === index ? event.target.value : item)))}
                  aria-label={`Colour ${index + 1}`}
                  className={`${FIELD} font-mono`}
                />
                <button type="button" onClick={() => setDraft((list) => list.filter((_, i) => i !== index))} aria-label={`Remove colour ${index + 1}`} className="motion-focus grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-4">
            {draft.length < BOARD_PALETTE_MAX ? (
              <button type="button" onClick={() => setDraft((list) => [...list, '#'])} className={`${LINK_BUTTON} inline-flex items-center gap-1`}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add a colour
              </button>
            ) : null}
            {coverButton}
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="motion-focus inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-content-inverse disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="motion-focus h-9 rounded-full px-3 text-[13px] text-content-secondary hover:text-content-primary">
              Cancel
            </button>
          </div>
        </form>
      ) : palette.length ? (
        <div className="mt-3 grid min-h-[96px] flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${palette.length}, minmax(0, 1fr))` }}>
          {palette.map((hex) => (
            <div
              key={hex}
              className={`flex flex-col justify-end overflow-hidden rounded-[10px] border border-stroke-default p-2 ${swatchInk(hex) === 'dark' ? 'text-[#1a1611]' : 'text-[#f5f0e6]'}`}
              style={{ background: hex }}
            >
              <span className="truncate font-mono text-[10px] opacity-85">{hex}</span>
            </div>
          ))}
        </div>
      ) : canEdit ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <button type="button" onClick={open} className="motion-focus text-left text-[13.5px] text-content-tertiary hover:text-content-primary">
            + The colours of this rollout, so every post matches.
          </button>
          {coverButton}
        </div>
      ) : (
        <EmptyLine>Not set yet.</EmptyLine>
      )}
    </section>
  );
}

function AddLinkForm({
  placeholder,
  onDone,
  onCancel,
  brief,
  onToast,
}: {
  placeholder: string;
  onDone: (reference: BriefReference) => void;
  onCancel: () => void;
  brief: BriefPayload;
  onToast: Props['onToast'];
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim() || saving) return;
    setSaving(true);
    const result = await briefCall<{ reference: BriefReference }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/references`,
      { method: 'POST', body: JSON.stringify({ url, title }) }
    );
    setSaving(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onDone(result.data.reference);
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <input autoFocus type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={placeholder} aria-label="Link" className={FIELD} />
      <input type="text" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Why it is here (optional)" aria-label="Caption" className={FIELD} />
      <div className="flex gap-2">
        <button type="submit" disabled={!url.trim() || saving} className="motion-focus inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-content-inverse disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="motion-focus h-9 rounded-full px-3 text-[13px] text-content-secondary hover:text-content-primary">
          Cancel
        </button>
      </div>
    </form>
  );
}

function useReferenceActions(brief: BriefPayload, onPatch: Props['onPatch'], onRefresh: Props['onRefresh'], onToast: Props['onToast']) {
  const mayRemove = (reference: BriefReference) =>
    brief.viewer.canEdit && (reference.createdBy === brief.viewer.id || brief.viewer.canManageShare);
  const added = (reference: BriefReference) => {
    onPatch((current) => ({ ...current, references: [...current.references, reference] }));
    onRefresh();
  };
  const remove = async (reference: BriefReference) => {
    const result = await briefCall<{ id: string }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/references/${encodeURIComponent(reference.id)}`,
      { method: 'DELETE' }
    );
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onPatch((current) => ({ ...current, references: current.references.filter((r) => r.id !== reference.id) }));
    onRefresh();
  };
  return { mayRemove, added, remove };
}

// What a team usually pins to set the look; the empty Look card offers one spot for each.
const LOOK_SPOTS = [
  { label: 'Light', hint: 'The time of day, the colour of it' },
  { label: 'Styling', hint: 'What the artist wears' },
  { label: 'Places', hint: 'Where it is shot' },
  { label: 'People', hint: 'Faces, crowd, the mood' },
];

function LookCard({ brief, wide, onPatch, onRefresh, onToast }: { brief: BriefPayload; wide: boolean } & Pick<Props, 'onPatch' | 'onRefresh' | 'onToast'>) {
  const images = brief.references.filter((reference) => reference.kind === 'image');
  const [adding, setAdding] = useState(false);
  const [captioning, setCaptioning] = useState<string | null>(null);
  const { mayRemove, added, remove } = useReferenceActions(brief, onPatch, onRefresh, onToast);
  const canEdit = brief.viewer.canEdit;
  const shown = images.slice(0, 5);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const { uploading, upload } = useBriefImageUploads(brief, added, onToast);
  const drop = useFileDrop(canEdit, (files) => void upload(files));
  const captioned = (id: string, title: string | null) =>
    onPatch((current) => ({
      ...current,
      references: current.references.map((reference) => (reference.id === id ? { ...reference, title } : reference)),
    }));
  // Controls show on hover on a computer, always on a phone (no hover there).
  const reveal = wide ? 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100' : 'opacity-100';

  const tile = (reference: BriefReference, className: string) => (
    <figure key={reference.id} className={`group relative m-0 min-h-0 overflow-hidden rounded-[10px] bg-bg-hover ${className}`}>
      <a href={reference.url} target="_blank" rel="noreferrer noopener" className="block h-full w-full">
        {reference.url ? (
          <img src={reference.url} alt={reference.title || 'Look reference'} loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </a>
      {captioning === reference.id ? (
        <CaptionEditor
          brief={brief}
          reference={reference}
          onToast={onToast}
          onClose={() => setCaptioning(null)}
          onSaved={(title) => captioned(reference.id, title)}
        />
      ) : reference.title ? (
        <figcaption className="pointer-events-none absolute inset-x-2 bottom-2">
          <span className="inline-block max-w-full truncate rounded-md bg-bg-surface/95 px-2 py-[3px] text-[12px] font-medium text-content-primary shadow-sm">
            {reference.title}
          </span>
        </figcaption>
      ) : null}
      {mayRemove(reference) && captioning !== reference.id ? (
        <span className={`absolute right-1.5 top-1.5 flex gap-1 transition ${reveal}`}>
          <button
            type="button"
            onClick={() => setCaptioning(reference.id)}
            aria-label={reference.title ? 'Edit caption' : 'Add a caption'}
            className="motion-focus grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void remove(reference)}
            aria-label="Remove image"
            className="motion-focus grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      ) : null}
    </figure>
  );

  return (
    <section
      aria-label="Look"
      {...drop.handlers}
      className={`${CARD} flex flex-col p-3.5 ${drop.over ? 'ring-2 ring-brand ring-offset-2 ring-offset-bg-sidebar' : ''}`}
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) void upload(files);
        }}
      />
      <div className="px-1">
        <CardLabel
          action={
            canEdit && !adding ? (
              <span className="flex items-center gap-3">
                {uploading ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-content-tertiary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Adding {uploading}
                  </span>
                ) : (
                  <button type="button" onClick={() => fileInput.current?.click()} className={LINK_BUTTON}>
                    + Photo
                  </button>
                )}
                <button type="button" onClick={() => setAdding(true)} className={LINK_BUTTON}>
                  + Link
                </button>
              </span>
            ) : null
          }
        >
          Look
        </CardLabel>
      </div>
      {drop.over ? (
        <p className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl bg-bg-surface/85 text-[14px] font-semibold text-brand">
          Drop photos to add them
        </p>
      ) : null}
      {adding ? (
        <div className="px-1">
          <AddLinkForm
            brief={brief}
            onToast={onToast}
            placeholder="Paste a link to an image"
            onCancel={() => setAdding(false)}
            onDone={(reference) => {
              added(reference);
              setAdding(false);
              if (reference.kind !== 'image') onToast('Added to Sound: that link is not an image.', 'warning');
            }}
          />
        </div>
      ) : null}
      {shown.length === 0 ? (
        canEdit ? (
          // Empty photo spots that say what to drop in (#897 phase 5), so a
          // new board looks ready for pictures rather than broken. Each one
          // opens the photo picker; dropping anywhere on Look works too.
          <div className={wide ? 'mt-2.5 grid min-h-[220px] flex-1 grid-cols-4 gap-2' : '-mr-3.5 mt-2.5 flex gap-2 overflow-x-auto pb-1 pr-3.5'}>
            {LOOK_SPOTS.map((spot) => (
              <button
                key={spot.label}
                type="button"
                onClick={() => fileInput.current?.click()}
                className={`motion-focus flex flex-col items-start justify-end gap-0.5 rounded-[10px] border-2 border-dashed border-stroke-strong p-3 text-left transition-colors hover:border-brand hover:bg-brand/5 ${wide ? '' : 'h-[150px] w-[130px] shrink-0'}`}
              >
                <Plus className="mb-auto h-4 w-4 text-content-tertiary" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-content-primary">{spot.label}</span>
                <span className="text-[12px] leading-snug text-content-tertiary">{spot.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-1">
            <EmptyLine>No images yet.</EmptyLine>
          </div>
        )
      ) : wide ? (
        <div
          className="mt-2.5 grid min-h-[300px] flex-1 gap-2"
          style={{
            gridTemplateColumns: shown.length >= 3 ? '1.25fr 1fr 1fr' : `repeat(${shown.length}, minmax(0, 1fr))`,
            gridTemplateRows: shown.length >= 4 ? '1fr 1fr' : '1fr',
          }}
        >
          {/* Four images: the big one, two beside it, the fourth across the
              bottom right, so the grid never shows an empty cell. */}
          {shown.map((reference, index) =>
            tile(
              reference,
              index === 0 && shown.length >= 4 ? 'row-span-2' : index === 3 && shown.length === 4 ? 'col-span-2' : ''
            )
          )}
        </div>
      ) : (
        <div className="-mr-3.5 mt-2.5 flex gap-2 overflow-x-auto pb-1 pr-3.5">
          {images.map((reference) => tile(reference, 'h-[190px] w-[150px] shrink-0'))}
        </div>
      )}
    </section>
  );
}

function SoundCard({ brief, onPatch, onRefresh, onToast }: { brief: BriefPayload } & Pick<Props, 'onPatch' | 'onRefresh' | 'onToast'>) {
  const links = brief.references.filter((reference) => reference.kind === 'link');
  const [adding, setAdding] = useState(false);
  const { mayRemove, added, remove } = useReferenceActions(brief, onPatch, onRefresh, onToast);
  const canEdit = brief.viewer.canEdit;
  return (
    <section aria-label="Sound and links" className={CARD}>
      <CardLabel
        action={
          canEdit && !adding ? (
            <button type="button" onClick={() => setAdding(true)} className={LINK_BUTTON}>
              + Add
            </button>
          ) : null
        }
      >
        Sound and links
      </CardLabel>
      {adding ? (
        <AddLinkForm
          brief={brief}
          onToast={onToast}
          placeholder="Paste a song, video or post"
          onCancel={() => setAdding(false)}
          onDone={(reference) => {
            added(reference);
            setAdding(false);
          }}
        />
      ) : null}
      {links.length === 0 ? (
        <EmptyLine>{canEdit ? 'Songs, videos and posts that show the sound and the feel.' : 'No links yet.'}</EmptyLine>
      ) : (
        <ul className="mt-1.5">
          {links.map((reference) => (
            <li key={reference.id} className="flex min-h-[52px] items-center gap-3 border-t border-stroke-default py-2 first:border-t-0">
              <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg" style={{ background: referenceColor(reference.url) }} />
              <a href={reference.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-[13.5px] font-semibold text-content-primary">{referenceDisplayTitle(reference)}</span>
                <span className="block truncate text-[12px] text-content-tertiary">{reference.source}</span>
              </a>
              {mayRemove(reference) ? (
                <button type="button" onClick={() => void remove(reference)} aria-label="Remove link" className="motion-focus grid h-7 w-7 shrink-0 place-items-center rounded-full text-content-tertiary opacity-55 transition hover:bg-bg-hover hover:opacity-100">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MOMENT_DOT: Record<string, string> = {
  done: 'border-content-primary bg-content-primary',
  late: 'border-status-error bg-status-error',
  next: 'border-stroke-strong bg-bg-surface',
  release: 'h-[22px] w-[22px] -mt-[3px] border-brand bg-brand shadow-[0_0_0_5px_rgb(var(--color-brand)/0.12)]',
};

function MomentsCard({ brief }: { brief: BriefPayload }) {
  const track = momentsTrack(brief.dates, brief.board.today);
  if (track.points.length === 0) return null;
  const filled = track.todayAt ?? 0;
  return (
    <section aria-label="Key moments" className={`${CARD} px-5 lg:px-6`}>
      <CardLabel>Key moments</CardLabel>
      <div className="-mx-5 overflow-x-auto px-5 lg:-mx-6 lg:px-6">
        <div className="relative mt-11 h-[78px] min-w-[620px]">
          <div className="absolute inset-x-0 top-[7px] h-0.5 rounded bg-stroke-strong/60">
            <div className="h-full rounded bg-content-primary" style={{ width: `${filled}%` }} />
          </div>
          {track.todayAt !== null ? (
            <div className="absolute -top-[26px] flex -translate-x-1/2 flex-col items-center" style={{ left: `${track.todayAt}%` }}>
              <span className="rounded-md bg-content-primary px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-content-inverse">
                Today
              </span>
              <span className="h-[26px] w-0.5 bg-content-primary" />
            </div>
          ) : null}
          {track.points.map((point) => (
            <div key={point.row.id} className="absolute top-0 w-[128px] -translate-x-1/2 text-center" style={{ left: `${point.at}%` }}>
              <div className={`mx-auto h-4 w-4 rounded-full border-2 ${MOMENT_DOT[point.state]}`} />
              <p
                className={`mt-2 line-clamp-2 text-[12.5px] font-semibold leading-[1.25] ${
                  point.state === 'late' ? 'text-status-error' : point.state === 'release' ? 'text-brand' : 'text-content-primary'
                } ${point.state === 'done' ? 'opacity-70' : ''}`}
              >
                {point.row.title}
              </p>
              <p className={`mt-0.5 font-mono text-[11px] ${point.state === 'late' ? 'text-status-error' : 'text-content-tertiary'}`}>
                {point.row.when ?? formatBriefDay(point.row.date)}
                {point.state === 'late' ? ' · late' : ''}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PeopleCard({ brief }: { brief: BriefPayload }) {
  return (
    <section aria-label="Who's on what" className={CARD}>
      <CardLabel>Who’s on what</CardLabel>
      {brief.people.length === 0 ? (
        <EmptyLine>Nobody has work on this rollout yet. Give tasks an owner in the plan.</EmptyLine>
      ) : (
        <ul className="mt-1.5">
          {brief.people.map((person) => (
            <li key={person.key} className="flex min-h-[56px] items-center gap-3 border-t border-stroke-default py-2 first:border-t-0">
              <BriefAvatar label={person.initials || initialsFor(person.name)} colorKey={person.key} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-content-primary">{person.name}</p>
                {person.nextTask ? <p className="truncate text-[12.5px] text-content-secondary">Next: {person.nextTask}</p> : null}
              </div>
              <span className="shrink-0 font-mono text-[12px] text-content-tertiary lg:font-sans lg:text-[12.5px]">{person.openCount} open</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SlotCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={CARD}>
      <CardLabel>{label}</CardLabel>
      <div className="mt-1">{children}</div>
    </section>
  );
}

// ── The board ───────────────────────────────────────────────────────────────

export function BriefBoard({ brief, onToast, onPatch, onRefresh, heading, banner, slots }: Props) {
  const [boardRef, width] = useWidth<HTMLDivElement>();
  const wide = width >= WIDE_BOARD_PX;

  const saveLook = async (patch: BriefFeelPatch): Promise<boolean> => {
    const result = await saveFeel(brief.releaseId, patch);
    if (!result.ok) {
      onToast(result.error, 'error');
      return false;
    }
    onPatch((current) => ({
      ...current,
      board: { ...current.board, feel: { ...current.board.feel, ...(result.data.feel as Partial<BriefFeel>) } },
    }));
    onRefresh();
    return true;
  };

  const cards: Partial<Record<BoardKey, ReactNode>> = {
    cover: <CoverCard brief={brief} wide={wide} />,
    idea: <IdeaCard brief={brief} ideaField={slots.idea} onPatch={onPatch} onRefresh={onRefresh} onToast={onToast} />,
    countdown: <CountdownCard brief={brief} />,
    feels: <FeelsCard brief={brief} onSave={saveLook} />,
    palette: <PaletteCard brief={brief} onSave={saveLook} onToast={onToast} />,
    look: <LookCard brief={brief} wide={wide} onPatch={onPatch} onRefresh={onRefresh} onToast={onToast} />,
    sound: <SoundCard brief={brief} onPatch={onPatch} onRefresh={onRefresh} onToast={onToast} />,
    decisions: <SlotCard label="Decided">{slots.decisions}</SlotCard>,
    moments: brief.dates.length ? <MomentsCard brief={brief} /> : undefined,
    people: <PeopleCard brief={brief} />,
  };
  if (slots.settle) cards.settle = <div className="min-w-0">{slots.settle}</div>;
  if (slots.side) cards.side = <SlotCard label={slots.side.label}>{slots.side.body}</SlotCard>;

  // Sticky notes (#897 phase 2) are cards too, keyed 'note:<id>'.
  const stickies = brief.board.stickies ?? [];
  const patchStickies = (update: (list: typeof stickies) => typeof stickies) =>
    onPatch((current) => ({ ...current, board: { ...current.board, stickies: update(current.board.stickies ?? []) } }));
  for (const sticky of stickies) {
    cards[sticky.key] = (
      <StickyCard
        brief={brief}
        sticky={sticky}
        onToast={onToast}
        onSaved={(text) => patchStickies((list) => list.map((item) => (item.id === sticky.id ? { ...item, text } : item)))}
        onRemoved={() => patchStickies((list) => list.filter((item) => item.id !== sticky.id))}
      />
    );
  }
  // Notes stay open after the brief is approved: the team keeps talking on the board.
  const canNote = brief.viewer.canEdit || brief.round?.state === 'approved';
  // What we're making (#897 phase 3): read from the plan; + Piece adds to it.
  cards.pieces = <BriefPiecesCard brief={brief} canAdd={canNote} onRefresh={onRefresh} onToast={onToast} />;
  const [composing, setComposing] = useState(false);

  const present = new Set((Object.keys(cards) as BoardKey[]).filter((key) => cards[key]));
  const stored = brief.board.layout;
  const resolved = resolveBoardLayout(stored, present);
  // Only a lead's own arranging counts as an arranged board; notes alone do not.
  const arranged = Boolean(stored && Object.keys(stored).some((key) => !isNoteKey(key)));
  const [preview, setPreview] = useState<BoardLayout | null>(null);
  const [arrangeOn, setArranging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draggingKey, setDraggingKey] = useState<BoardKey | null>(null);
  const drag = useRef<Drag | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The layout waiting to save, and the last one the server has, to fall back to.
  const pending = useRef<{ layout: BoardLayout; fallback: BoardLayout | null } | null>(null);
  const placements = preview ?? resolved;
  const canArrange = brief.board.canArrange && wide;
  const signature = JSON.stringify(placements);
  useSlide(gridRef, signature);
  const names = { ...CARD_NAMES, side: slots.side?.label ?? CARD_NAMES.side };
  const nameOf = (key: BoardKey) => (isNoteKey(key) ? 'note' : names[key]);
  // Photos dropped anywhere on the board go to Look.
  const addReference = (reference: BriefReference) => {
    onPatch((current) => ({ ...current, references: [...current.references, reference] }));
    onRefresh();
  };
  const boardUploads = useBriefImageUploads(brief, addReference, onToast);
  const boardDrop = useFileDrop(brief.viewer.canEdit && wide, (files) => void boardUploads.upload(files));

  // A board too narrow to arrange is never in arrange mode.
  const arranging = arrangeOn && canArrange;
  // Leaving the board with a move still waiting sends it now rather than dropping it.
  const releaseId = brief.releaseId;
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pending.current) void saveLayout(releaseId, pending.current.layout);
    },
    [releaseId]
  );

  const setStored = (layout: BoardLayout | null) =>
    onPatch((current) => ({ ...current, board: { ...current.board, layout } }));

  /** Show the new layout now; save it a moment later, so a run of arrow keys is one save. */
  const commit = (next: BoardLayout) => {
    if (JSON.stringify(next) === JSON.stringify(resolved)) return;
    // A run of moves falls back to where the board was before the run, not one step back.
    pending.current = { layout: next, fallback: pending.current ? pending.current.fallback : stored };
    setStored(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const job = pending.current;
      pending.current = null;
      saveTimer.current = null;
      if (!job) return;
      const result = await saveLayout(releaseId, job.layout);
      if (!result.ok) {
        setStored(job.fallback);
        onToast(result.error, 'error');
      }
    }, 350);
  };

  const reset = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pending.current = null;
    setBusy(true);
    const result = await resetLayout(brief.releaseId);
    setBusy(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    setStored(null);
    onToast('The board is back to how it started.', 'success');
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>, key: BoardKey, mode: Drag['mode']) => {
    const grid = gridRef.current;
    const from = placements[key];
    if (!grid || !from || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rows = gridRows(grid);
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const colWidth = (grid.getBoundingClientRect().width + gap) / BOARD_COLUMNS;
    const top = rows.tops[from.y - 1] ?? 0;
    const lastRow = Math.min(from.y + from.h - 2, rows.tops.length - 1);
    const bottom = (rows.tops[lastRow] ?? 0) + (rows.heights[lastRow] ?? 0);
    setDraggingKey(key);
    drag.current = { key, mode, startX: event.clientX, startY: event.clientY, from, base: placements, colWidth, rows, top, bottom };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const cols = Math.round(dx / current.colWidth);
    const { from } = current;
    let to: BoardPlacement;
    if (current.mode === 'move') {
      to = { ...from, x: from.x + cols, y: rowAt(current.rows, current.top + dy) };
    } else {
      const bottomRow = rowAt(current.rows, current.bottom + dy + current.rows.gap / 2) - 1;
      to = { ...from, w: from.w + cols, h: Math.max(1, bottomRow - from.y + 1) };
    }
    setPreview(moveBoardCard(current.base, current.key, to));
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDraggingKey(null);
    if (preview) commit(preview);
    setPreview(null);
  };

  const nudge = (event: ReactKeyboardEvent<HTMLElement>, key: BoardKey) => {
    const direction = ARROWS[event.key];
    if (event.key === 'Escape') {
      // Esc leaves arrange mode only; it must not also close the brief (#902).
      event.preventDefault();
      setArranging(false);
      return;
    }
    if (!direction) return;
    event.preventDefault();
    commit(nudgeBoardCard(placements, key, direction, event.shiftKey));
  };

  return (
    <div
      ref={boardRef}
      {...boardDrop.handlers}
      // A wide board is the cards on the page (#1230). The dotted panel stays
      // for the phone stack, where it frames one column.
      className={`relative ${
        wide ? 'rounded-[20px]' : 'rounded-[20px] bg-bg-sidebar p-3 sm:p-4'
      } ${boardDrop.over ? 'ring-2 ring-brand ring-offset-4 ring-offset-bg-base' : ''}`}
      style={
        wide || width === 0
          ? undefined
          : {
              backgroundImage: 'radial-gradient(rgb(var(--color-stroke) / 0.11) 1px, transparent 1.2px)',
              backgroundSize: '20px 20px',
            }
      }
    >
      {width === 0 ? (
        // Not measured yet: draw nothing for a frame rather than the phone
        // stack, so a computer never flashes the wrong layout.
        <div className="min-h-[420px]" aria-busy="true" />
      ) : wide ? (
        <>
          {canArrange || canNote || heading ? (
            <div className="mb-4 flex min-h-9 flex-wrap items-end justify-end gap-x-4 gap-y-2">
              {heading ? <div className="mr-auto min-w-0">{heading}</div> : null}
              {boardUploads.uploading ? (
                <span className={`${heading ? '' : 'mr-auto '}inline-flex items-center gap-1.5 text-[13px] text-content-secondary`}>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Adding {boardUploads.uploading} to Look
                </span>
              ) : null}
              {arranging ? (
                <>
                  <p className={`${heading ? '' : 'mr-auto '}text-[13px] text-content-secondary`}>
                    Drag a card to move it. Pull its corner to resize. Arrow keys work too.
                  </p>
                  {arranged ? (
                    <button
                      type="button"
                      onClick={() => void reset()}
                      disabled={busy}
                      className="motion-focus motion-press inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-strong px-3.5 text-[13px] font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                      Reset
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setArranging(false)}
                    className="motion-focus motion-press inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-3.5 text-[13px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Done
                  </button>
                </>
              ) : (
                <>
                  {canNote ? (
                    <button
                      type="button"
                      onClick={() => setComposing(true)}
                      className="motion-focus motion-press inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-strong bg-bg-surface px-3.5 text-[13px] font-semibold text-content-primary transition-colors hover:bg-bg-hover"
                    >
                      <NotebookPen className="h-4 w-4" aria-hidden="true" />
                      Note
                    </button>
                  ) : null}
                  {canArrange ? (
                    <button
                      type="button"
                      onClick={() => setArranging(true)}
                      className="motion-focus motion-press inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-strong bg-bg-surface px-3.5 text-[13px] font-semibold text-content-primary transition-colors hover:bg-bg-hover"
                    >
                      <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                      Arrange
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          {banner}
          {composing ? (
            <div className="mb-4 flex justify-end">
              <NoteComposer
                brief={brief}
                onToast={onToast}
                onCancel={() => setComposing(false)}
                onAdded={(sticky) => {
                  patchStickies((list) => [...list, sticky]);
                  setComposing(false);
                  onRefresh();
                }}
              />
            </div>
          ) : null}
          <div ref={gridRef} className="grid gap-4" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
            {(Object.entries(placements) as [BoardKey, BoardPlacement][]).map(([key, spot]) => {
              const style: CSSProperties = {
                gridColumn: `${spot.x} / span ${spot.w}`,
                gridRow: `${spot.y} / span ${spot.h}`,
              };
              const dragging = draggingKey === key;
              return (
                <div
                  key={key}
                  data-card={key}
                  data-dragging={dragging ? 'true' : undefined}
                  className={`relative flex min-w-0 flex-col [&>*:first-child]:flex-1 ${dragging ? 'z-20' : ''}`}
                  style={style}
                >
                  {cards[key]}
                  {arranging ? (
                    // While arranging, the card's own buttons and fields rest:
                    // this layer takes the pointer and the keys.
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Move ${nameOf(key)}. Arrow keys move it, shift and arrow keys resize it.`}
                      onPointerDown={(event) => startDrag(event, key, 'move')}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(event) => nudge(event, key)}
                      className={`absolute inset-0 cursor-grab touch-none rounded-2xl border-2 border-dashed outline-none transition-colors focus-visible:border-brand focus-visible:bg-brand/5 active:cursor-grabbing ${
                        dragging ? 'border-brand bg-brand/10 shadow-lg' : 'border-brand/40 bg-bg-surface/10 hover:bg-brand/5'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        onPointerDown={(event) => startDrag(event, key, 'resize')}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className="absolute bottom-1 right-1 h-6 w-6 cursor-nwse-resize touch-none rounded-br-xl border-b-[3px] border-r-[3px] border-brand"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Only passed on a computer; a squeezed board still shows them. */}
          {heading}
          {banner}
          {(arranged
            ? layoutPhoneOrder(resolved)
            : [
                ...boardPhoneOrder(new Set([...present].filter((key): key is BoardCardKey => !isNoteKey(key)))),
                ...stickies.map((sticky) => sticky.key),
              ]
          ).map((key) => (
            <div key={key} className="min-w-0">
              {cards[key]}
            </div>
          ))}
          {canNote ? (
            composing ? (
              <NoteComposer
                brief={brief}
                onToast={onToast}
                onCancel={() => setComposing(false)}
                onAdded={(sticky) => {
                  patchStickies((list) => [...list, sticky]);
                  setComposing(false);
                  onRefresh();
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setComposing(true)}
                className="motion-focus motion-press inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-dashed border-stroke-strong text-[14px] font-semibold text-content-secondary"
              >
                <NotebookPen className="h-4 w-4" aria-hidden="true" />
                Add a note
              </button>
            )
          ) : null}
        </div>
      )}
      {slots.footer ? <div className="mt-4">{slots.footer}</div> : null}
    </div>
  );
}
