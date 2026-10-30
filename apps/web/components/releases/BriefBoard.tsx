/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Loader2, Pencil, Plus, X } from '@/components/icons';
import {
  BOARD_PALETTE_MAX,
  BOARD_HEADLINE_MAX,
  boardPhoneOrder,
  boardPlacements,
  briefCountdown,
  momentsTrack,
  normalizeHex,
  swatchInk,
  type BoardCardKey,
  type BriefFeel,
  type BriefFeelPatch,
} from '@/lib/brief-board';
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
 * content in this phase; leads drag and resize in phase 1b.
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
const LABEL = 'text-[11px] font-bold uppercase tracking-[0.09em] text-content-tertiary';
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
      className={`relative min-w-0 overflow-hidden rounded-2xl ${wide ? 'min-h-[420px]' : 'aspect-[4/5] max-h-[360px] w-full'}`}
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
  const canEdit = brief.viewer.canEdit;

  const open = () => {
    setDraft(palette.length ? palette : ['#']);
    setEditing(true);
  };
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
          {draft.length < BOARD_PALETTE_MAX ? (
            <button type="button" onClick={() => setDraft((list) => [...list, '#'])} className={`${LINK_BUTTON} inline-flex items-center gap-1`}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add a colour
            </button>
          ) : null}
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
        <button type="button" onClick={open} className="motion-focus mt-3 text-left text-[13.5px] text-content-tertiary hover:text-content-primary">
          + The colours of this rollout, so every post matches.
        </button>
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

function LookCard({ brief, wide, onPatch, onRefresh, onToast }: { brief: BriefPayload; wide: boolean } & Pick<Props, 'onPatch' | 'onRefresh' | 'onToast'>) {
  const images = brief.references.filter((reference) => reference.kind === 'image');
  const [adding, setAdding] = useState(false);
  const { mayRemove, added, remove } = useReferenceActions(brief, onPatch, onRefresh, onToast);
  const canEdit = brief.viewer.canEdit;
  const shown = images.slice(0, 5);

  const tile = (reference: BriefReference, className: string) => (
    <figure key={reference.id} className={`group relative m-0 min-h-0 overflow-hidden rounded-[10px] bg-bg-hover ${className}`}>
      <a href={reference.url} target="_blank" rel="noreferrer noopener" className="block h-full w-full">
        <img src={reference.url} alt={reference.title || 'Look reference'} loading="lazy" className="h-full w-full object-cover" />
      </a>
      {reference.title ? (
        <figcaption className="pointer-events-none absolute inset-x-2 bottom-2">
          <span className="inline-block max-w-full truncate rounded-md bg-bg-surface/95 px-2 py-[3px] text-[12px] font-medium text-content-primary shadow-sm">
            {reference.title}
          </span>
        </figcaption>
      ) : null}
      {mayRemove(reference) ? (
        <button
          type="button"
          onClick={() => void remove(reference)}
          aria-label="Remove image"
          className="motion-focus absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </figure>
  );

  return (
    <section aria-label="Look" className={`${CARD} flex flex-col p-3.5`}>
      <div className="px-1">
        <CardLabel
          action={
            canEdit && !adding ? (
              <button type="button" onClick={() => setAdding(true)} className={LINK_BUTTON}>
                + Add
              </button>
            ) : null
          }
        >
          Look
        </CardLabel>
      </div>
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
        <div className="px-1">
          <EmptyLine>{canEdit ? 'Links to images that show the look: light, styling, places, people.' : 'No images yet.'}</EmptyLine>
        </div>
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
              <span className="shrink-0 font-mono text-[12px] text-content-tertiary">{person.openCount} open</span>
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

export function BriefBoard({ brief, onToast, onPatch, onRefresh, slots }: Props) {
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

  const cards: Partial<Record<BoardCardKey, ReactNode>> = {
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

  const present = new Set(Object.entries(cards).filter(([, node]) => node).map(([key]) => key as BoardCardKey));
  const placements = boardPlacements(present);

  return (
    <div
      ref={boardRef}
      className="rounded-[20px] bg-bg-sidebar p-3 sm:p-4"
      style={{
        backgroundImage: 'radial-gradient(rgb(var(--color-stroke) / 0.11) 1px, transparent 1.2px)',
        backgroundSize: '20px 20px',
      }}
    >
      {width === 0 ? (
        // Not measured yet: draw nothing for a frame rather than the phone
        // stack, so a computer never flashes the wrong layout.
        <div className="min-h-[420px]" aria-busy="true" />
      ) : wide ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
          {Object.entries(placements).map(([key, spot]) => {
            const style: CSSProperties = {
              gridColumn: `${spot.x} / span ${spot.w}`,
              gridRow: `${spot.y} / span ${spot.h}`,
            };
            return (
              <div key={key} className="flex min-w-0 flex-col [&>*]:flex-1" style={style}>
                {cards[key as BoardCardKey]}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {boardPhoneOrder(present).map((key) => (
            <div key={key} className="min-w-0">
              {cards[key]}
            </div>
          ))}
        </div>
      )}
      {slots.footer ? <div className="mt-4">{slots.footer}</div> : null}
    </div>
  );
}
