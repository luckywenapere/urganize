/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Loader2, X } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { UrgansLockedSheet } from '@/components/urgans-actions/UrgansLockedSheet';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedCostLine } from '@/lib/credits/copy';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { supabase } from '@/lib/supabase/client';
import { applyRunAction, discardRunAction, runDraftBrief } from '@/lib/urgans-actions/client';
import {
  BRIEF_BLOCK_LABELS,
  BRIEF_COPY,
  MAX_DECISION_LENGTH,
  MAX_IDEA_LENGTH,
  formatBriefDay,
  formatEditedAgo,
  formatHistoryTime,
  formatShortDay,
  isBriefEmpty,
  referenceColor,
  referenceDisplayTitle,
  type BriefDecision,
  type BriefPayload,
  type BriefReference,
} from '@/lib/release-brief';

/**
 * The release brief scene (URG-281): one page per rollout for the whole team.
 * Built to the approved mocks (2026-10-16): serif "Brief", a share button, the
 * "Edited by · time · History" line, then the blocks, each under a small grey
 * label. Two columns on a computer (Idea, References, Decisions | Dates, Who's
 * on what, Notes), one on a phone. A block with nothing in it does not render.
 *
 * Fetches for itself and is never cached (lib/scene-cache.ts): the Idea is
 * edited in place under an autosave, and a cached copy painted over a live
 * edit would lose it.
 */

type Props = {
  releaseId: string;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; brief: BriefPayload };

type Draft = { actionId: string; idea: string };

const IDEA_SAVE_DELAY_MS = 800;
const AVATAR_COLORS = ['#7fd99a', '#e7c27d', '#9ab8f0', '#f0a39a', '#c5a3f0', '#8fd3d1'];

const LIST = 'overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface';
const ROW_DIVIDER = 'border-t border-stroke-default first:border-t-0';
const PRIMARY =
  'motion-focus motion-press inline-flex h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY =
  'motion-focus motion-press inline-flex h-11 w-full items-center justify-center rounded-full border border-stroke-strong px-5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60';
const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2.5 text-[16px] text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none lg:text-sm';

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

async function accessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function call<T>(url: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Your session expired. Sign in again.' };
  try {
    const response = await fetch(url, { ...init, headers });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) return { ok: false, error: payload.error || 'Something went wrong. Try again.' };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection.' };
  }
}

function avatarColor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatar({ label, colorKey, urgans = false }: { label: string; colorKey: string; urgans?: boolean }) {
  if (urgans) {
    return (
      <span
        aria-hidden="true"
        className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border border-brand/40 bg-bg-surface font-display text-[13px] text-brand"
      >
        u
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[9.5px] font-bold text-[#0c0c0d]"
      style={{ background: avatarColor(colorKey) }}
    >
      {label}
    </span>
  );
}

/** A block's small grey label, with an optional action on the right. */
function BlockLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-[26px] flex items-baseline justify-between">
      <h3 className="text-[12px] font-semibold text-content-secondary">{children}</h3>
      {action}
    </div>
  );
}

// ── Sheets ──────────────────────────────────────────────────────────────────

/** A bottom sheet on a phone, a centred dialog on a computer. */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => lockBodyScroll(), []);
  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 lg:items-center lg:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <DialogPanel
        label={label}
        onClose={onClose}
        className="w-full max-w-md rounded-t-3xl border-t border-stroke-strong bg-bg-surface px-4 pb-[34px] pt-2.5 lg:rounded-3xl lg:border lg:px-6 lg:pb-6 lg:pt-5"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-stroke-strong lg:hidden" aria-hidden="true" />
        {children}
      </DialogPanel>
    </div>,
    document.body
  );
}

function HistorySheet({ brief, onClose }: { brief: BriefPayload; onClose: () => void }) {
  const now = new Date();
  return (
    <Sheet label="History" onClose={onClose}>
      <h2 className="mb-2 font-display text-[20px] text-content-primary">History</h2>
      {brief.revisions.length === 0 ? (
        <p className="py-4 text-sm text-content-secondary">No changes yet.</p>
      ) : (
        <ul className="max-h-[60vh] overflow-y-auto">
          {brief.revisions.map((revision) => (
            <li key={revision.id} className={`flex min-h-[52px] items-center gap-3 text-sm ${ROW_DIVIDER}`}>
              <Avatar label={revision.initials} colorKey={revision.actorName} urgans={revision.isUrgans} />
              <span className="min-w-0 flex-1 text-content-primary">
                {revision.actorName}{' '}
                <span className="text-content-secondary">edited {BRIEF_BLOCK_LABELS[revision.block]}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-content-tertiary">
                {formatHistoryTime(revision.createdAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function ShareSheet({
  brief,
  onClose,
  onChange,
  onToast,
}: {
  brief: BriefPayload;
  onClose: () => void;
  onChange: (share: BriefPayload['share']) => void;
  onToast: Props['onToast'];
}) {
  const [saving, setSaving] = useState(false);
  const canToggle = brief.viewer.canManageShare;
  const enabled = brief.share.enabled;

  const toggle = async () => {
    if (!canToggle || saving) return;
    setSaving(true);
    const result = await call<{ share: BriefPayload['share'] }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/share`,
      { method: 'PATCH', body: JSON.stringify({ enabled: !enabled }) }
    );
    setSaving(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onChange(result.data.share);
  };

  const copy = async () => {
    if (!brief.share.token) return;
    const url = `${window.location.origin}/brief/${brief.share.token}`;
    try {
      await navigator.clipboard.writeText(url);
      onToast('Link copied.', 'success');
    } catch {
      onToast(url, 'warning');
    }
  };

  return (
    <Sheet label={BRIEF_COPY.shareTitle} onClose={onClose}>
      <h2 className="font-display text-[20px] text-content-primary">{BRIEF_COPY.shareTitle}</h2>
      <p className="mt-1 text-sm text-content-secondary">{BRIEF_COPY.shareLine}</p>
      <div className="mt-[18px] flex min-h-12 items-center justify-between">
        <span id="brief-view-link" className="text-[15px] text-content-primary">
          {BRIEF_COPY.viewLink}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="brief-view-link"
          disabled={!canToggle || saving}
          onClick={toggle}
          className={`motion-focus relative h-[26px] w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
            enabled ? 'bg-brand' : 'bg-stroke-strong'
          } ${!canToggle ? 'opacity-55' : ''}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-[3px] h-5 w-5 rounded-full transition-[left] ${
              enabled ? 'left-[21px] bg-[#0c0c0d]' : 'left-[3px] bg-content-secondary'
            }`}
          />
        </button>
      </div>
      <p className="text-[13px] text-content-tertiary">
        {canToggle ? BRIEF_COPY.viewLinkLine : 'Only the rollout’s owner or a team admin can turn this on.'}
      </p>
      {enabled && brief.share.token ? (
        <button type="button" onClick={copy} className={`${PRIMARY} mt-[18px]`}>
          {BRIEF_COPY.copyLink}
        </button>
      ) : null}
    </Sheet>
  );
}

// ── Blocks ──────────────────────────────────────────────────────────────────

function DatesBlock({ brief }: { brief: BriefPayload }) {
  if (brief.dates.length === 0) return null;
  return (
    <section>
      <BlockLabel>Dates</BlockLabel>
      <ul className={LIST}>
        {brief.dates.map((row) => (
          <li key={row.id} className={`flex min-h-11 items-center justify-between gap-3 px-3.5 text-sm ${ROW_DIVIDER}`}>
            <span className={`min-w-0 truncate text-content-primary ${row.done ? 'line-through opacity-55' : ''}`}>
              {row.title}
            </span>
            <span className={`shrink-0 font-mono text-[12px] ${row.isRelease ? 'text-brand' : 'text-content-secondary'}`}>
              {formatBriefDay(row.date)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PeopleBlock({ brief }: { brief: BriefPayload }) {
  if (brief.people.length === 0) return null;
  return (
    <section>
      <BlockLabel>Who’s on what</BlockLabel>
      <ul className={LIST}>
        {brief.people.map((person) => (
          <li key={person.key} className={`flex min-h-11 items-center gap-3 px-3.5 text-sm ${ROW_DIVIDER}`}>
            <Avatar label={person.initials} colorKey={person.key} />
            <span className="w-14 shrink-0 truncate text-content-primary">{person.name}</span>
            <span className="min-w-0 flex-1 truncate text-content-secondary">{person.nextTask}</span>
            <span className="shrink-0 font-mono text-[12px] text-content-tertiary">{person.openCount}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotesBlock({ brief }: { brief: BriefPayload }) {
  if (brief.notes.length === 0) return null;
  return (
    <section>
      <BlockLabel>Notes</BlockLabel>
      <ul className={LIST}>
        {brief.notes.map((note) => (
          <li key={note.id} className={`px-3.5 py-3 ${ROW_DIVIDER}`}>
            <p className="whitespace-pre-line text-sm text-content-primary">{note.body}</p>
            <p className="mt-[3px] font-mono text-[11px] text-content-tertiary">
              From Notes · {formatShortDay(note.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="motion-focus grid h-7 w-7 shrink-0 place-items-center rounded-full text-content-tertiary opacity-55 transition hover:bg-bg-hover hover:opacity-100"
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function ReferencesBlock({
  brief,
  onAdded,
  onRemoved,
  onToast,
}: {
  brief: BriefPayload;
  onAdded: (reference: BriefReference) => void;
  onRemoved: (id: string) => void;
  onToast: Props['onToast'];
}) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const images = brief.references.filter((reference) => reference.kind === 'image');
  const links = brief.references.filter((reference) => reference.kind === 'link');
  const mayRemove = (reference: BriefReference) =>
    reference.createdBy === brief.viewer.id || brief.viewer.canManageShare;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim() || saving) return;
    setSaving(true);
    const result = await call<{ reference: BriefReference }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/references`,
      { method: 'POST', body: JSON.stringify({ url, title }) }
    );
    setSaving(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onAdded(result.data.reference);
    setUrl('');
    setTitle('');
    setAdding(false);
  };

  const remove = async (reference: BriefReference) => {
    const result = await call<{ id: string }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/references/${encodeURIComponent(reference.id)}`,
      { method: 'DELETE' }
    );
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onRemoved(reference.id);
  };

  if (brief.references.length === 0 && !adding && !brief.viewer.canEdit) return null;

  return (
    <section>
      <BlockLabel
        action={
          brief.viewer.canEdit && !adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="motion-focus text-[12px] font-medium text-content-secondary transition-colors hover:text-content-primary"
            >
              + Add
            </button>
          ) : null
        }
      >
        References
      </BlockLabel>

      {adding ? (
        <form onSubmit={submit} className="mb-2 space-y-2 rounded-2xl border border-stroke-default bg-bg-surface p-3.5">
          <input
            autoFocus
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste a link or an image link"
            aria-label="Link"
            className={FIELD}
          />
          <input
            type="text"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Caption (optional)"
            aria-label="Caption"
            className={FIELD}
          />
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={!url.trim() || saving} className={`${PRIMARY} h-10 text-sm`}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setUrl('');
                setTitle('');
              }}
              className={`${SECONDARY} h-10`}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {images.length > 0 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {images.map((reference) => (
            <div key={reference.id} className="group relative shrink-0">
              <a href={reference.url} target="_blank" rel="noreferrer noopener" title={reference.title ?? undefined}>
                <img
                  src={reference.url}
                  alt={reference.title || 'Reference image'}
                  className="h-24 w-24 rounded-xl border border-stroke-default bg-bg-surface object-cover"
                  loading="lazy"
                />
              </a>
              {mayRemove(reference) ? (
                <span className="absolute right-1 top-1 rounded-full bg-black/60 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                  <RemoveButton label="Remove image" onClick={() => remove(reference)} />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {links.length > 0 ? (
        <ul className={`${LIST} ${images.length > 0 ? 'mt-2' : ''}`}>
          {links.map((reference) => (
            <li key={reference.id} className={`flex min-h-12 items-center gap-3 px-3.5 text-sm ${ROW_DIVIDER}`}>
              <span
                aria-hidden="true"
                className="h-5 w-5 shrink-0 rounded-md"
                style={{ background: referenceColor(reference.url) }}
              />
              <a
                href={reference.url}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate text-content-primary hover:underline"
              >
                {referenceDisplayTitle(reference)}
              </a>
              <span className="shrink-0 font-mono text-[11px] text-content-tertiary">{reference.source}</span>
              {mayRemove(reference) ? <RemoveButton label="Remove link" onClick={() => remove(reference)} /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {brief.references.length === 0 && !adding ? (
        <p className="text-sm text-content-tertiary">Links and images that show the look and sound.</p>
      ) : null}
    </section>
  );
}

function DecisionsBlock({
  brief,
  onAdded,
  onRemoved,
  onToast,
}: {
  brief: BriefPayload;
  onAdded: (decision: BriefDecision) => void;
  onRemoved: (id: string) => void;
  onToast: Props['onToast'];
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = value.trim();
    if (!body || saving) return;
    setSaving(true);
    const result = await call<{ decision: { id: string; body: string; createdBy: string; createdAt: string } }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/decisions`,
      { method: 'POST', body: JSON.stringify({ body }) }
    );
    setSaving(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onAdded({ ...result.data.decision, authorName: 'You' });
    setValue('');
  };

  const remove = async (decision: BriefDecision) => {
    const result = await call<{ id: string }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/decisions/${encodeURIComponent(decision.id)}`,
      { method: 'DELETE' }
    );
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onRemoved(decision.id);
  };

  return (
    <section>
      <BlockLabel>Decisions</BlockLabel>
      <div className={LIST}>
        {brief.decisions.map((decision) => (
          <div key={decision.id} className={`flex items-start gap-2 px-3.5 py-3 ${ROW_DIVIDER}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-content-primary">{decision.body}</p>
              <p className="mt-[3px] font-mono text-[11px] text-content-tertiary">
                {decision.authorName} · {formatShortDay(decision.createdAt)}
              </p>
            </div>
            {decision.createdBy === brief.viewer.id || brief.viewer.canManageShare ? (
              <RemoveButton label="Delete decision" onClick={() => remove(decision)} />
            ) : null}
          </div>
        ))}
        <form onSubmit={add} className={`flex min-h-11 items-center gap-2 px-3.5 ${ROW_DIVIDER}`}>
          <input
            type="text"
            value={value}
            maxLength={MAX_DECISION_LENGTH}
            onChange={(event) => setValue(event.target.value)}
            placeholder={BRIEF_COPY.addDecision}
            aria-label={BRIEF_COPY.addDecision}
            enterKeyHint="done"
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-content-primary placeholder:text-content-tertiary focus:outline-none lg:text-sm"
          />
          {value.trim() ? (
            <button type="submit" disabled={saving} className="shrink-0 text-sm font-semibold text-brand">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Add'}
            </button>
          ) : null}
        </form>
      </div>
    </section>
  );
}

function IdeaBlock({
  idea,
  onChange,
  onBlur,
  textareaRef,
}: {
  idea: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  // Grow with the text, so the idea reads as a paragraph rather than a box.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${node.scrollHeight}px`;
  }, [idea, textareaRef]);

  return (
    <section>
      <BlockLabel>Idea</BlockLabel>
      <textarea
        ref={textareaRef}
        value={idea}
        rows={2}
        maxLength={MAX_IDEA_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder="The story, the sound, the look and the feel."
        aria-label="Idea"
        className="block w-full resize-none overflow-hidden bg-transparent text-[16px] leading-[1.55] text-content-primary placeholder:text-content-tertiary focus:outline-none"
      />
    </section>
  );
}

// ── States ──────────────────────────────────────────────────────────────────

function Skeleton() {
  const bar = (className: string) => <div className={`animate-pulse rounded-lg bg-bg-elevated ${className}`} />;
  return (
    <div aria-busy="true" aria-label="Loading the brief">
      {bar('mt-2 h-3 w-2/5')}
      {bar('mt-2.5 h-[30px] w-[55%]')}
      {bar('mt-2.5 h-3 w-1/2')}
      {bar('mt-7 h-[70px] w-full')}
      {bar('mt-7 h-24 w-full')}
      {bar('mt-7 h-44 w-full')}
    </div>
  );
}

// ── The scene ───────────────────────────────────────────────────────────────

export function ReleaseBriefScene({ releaseId, onToast }: Props) {
  const isDesktop = useIsDesktopViewport();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [idea, setIdea] = useState('');
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const { balance, refresh: refreshBalance } = useCreditBalance();
  const [settling, setSettling] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'history' | 'share' | null>(null);
  const ideaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIdea = useRef('');
  const pendingIdea = useRef<string | null>(null);

  const fetchBrief = useCallback(async () => {
    const result = await call<{ brief: BriefPayload }>(`/api/releases/${encodeURIComponent(releaseId)}/brief`, {
      method: 'GET',
    });
    if (!result.ok) {
      setState({ status: 'error' });
      return;
    }
    savedIdea.current = result.data.brief.idea;
    setIdea(result.data.brief.idea);
    setState({ status: 'ready', brief: result.data.brief });
  }, [releaseId]);

  /** Show the skeleton again, then load (Try again, and after Keep). */
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    await fetchBrief();
  }, [fetchBrief]);

  /** Re-read quietly (no skeleton) after a write that changes derived parts. */
  const refresh = useCallback(async () => {
    const result = await call<{ brief: BriefPayload }>(`/api/releases/${encodeURIComponent(releaseId)}/brief`, {
      method: 'GET',
    });
    if (!result.ok) return;
    setState({ status: 'ready', brief: result.data.brief });
  }, [releaseId]);

  useEffect(() => {
    void fetchBrief();
  }, [fetchBrief]);

  const flushIdea = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const next = pendingIdea.current;
    if (next === null || next === savedIdea.current) return;
    pendingIdea.current = null;
    const result = await call<{ idea: string; updatedAt: string }>(
      `/api/releases/${encodeURIComponent(releaseId)}/brief`,
      { method: 'PATCH', body: JSON.stringify({ idea: next }) }
    );
    if (!result.ok) {
      onToast(result.error, 'error');
      pendingIdea.current = next;
      return;
    }
    savedIdea.current = next;
    void refresh();
  }, [onToast, refresh, releaseId]);

  // Save whatever is pending when the scene closes.
  useEffect(
    () => () => {
      void flushIdea();
    },
    [flushIdea]
  );

  const changeIdea = (value: string) => {
    setIdea(value);
    pendingIdea.current = value;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushIdea(), IDEA_SAVE_DELAY_MS);
  };

  const writeYourself = () => {
    setWriting(true);
    requestAnimationFrame(() => ideaRef.current?.focus());
  };

  const startDraft = async () => {
    if (drafting) return;
    setDrafting(true);
    const result = await runDraftBrief({ releaseId });
    setDrafting(false);
    // The run has settled, so the balance has moved (a failed run costs nothing).
    void refreshBalance();
    if (!result.ok) {
      if (result.planRequired) setLocked(result.error);
      else onToast(result.error, 'error');
      return;
    }
    setDraft({ actionId: result.actionId, idea: result.idea });
  };

  const keepDraft = async () => {
    if (!draft || settling) return;
    setSettling(true);
    const result = await applyRunAction(draft.actionId, await accessToken());
    setSettling(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    setDraft(null);
    await load();
  };

  const discardDraft = async () => {
    if (!draft) return;
    const current = draft;
    setDraft(null);
    void discardRunAction(current.actionId, await accessToken());
  };

  const patch = (update: (brief: BriefPayload) => BriefPayload) => {
    setState((prev) => (prev.status === 'ready' ? { status: 'ready', brief: update(prev.brief) } : prev));
  };

  const titleClass = 'font-display text-[30px] leading-tight text-content-primary lg:text-[36px]';

  if (state.status === 'loading') {
    return (
      <div className="pb-10">
        <Skeleton />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="pb-10">
        <p className={titleClass}>Brief</p>
        <div className={`${LIST} mt-7 max-w-xl p-[18px]`}>
          <p className="text-[15px] text-content-primary">{BRIEF_COPY.loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="motion-focus mt-3 text-sm font-semibold text-brand"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const brief = state.brief;
  const empty = isBriefEmpty({ ...brief, idea }) && !writing;
  const showChrome = !empty && !draft;
  const editedAgo = formatEditedAgo(brief.updatedAt);

  const header = (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className={titleClass}>Brief</p>
        {showChrome ? (
          <button
            type="button"
            onClick={() => setSheet('share')}
            aria-label={BRIEF_COPY.shareTitle}
            className="motion-focus motion-press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stroke-strong text-content-primary transition-colors hover:bg-bg-hover lg:h-10 lg:w-10"
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {showChrome && brief.updatedByName && editedAgo ? (
        <p className="mt-2 font-mono text-[11px] text-content-tertiary">
          Edited by {brief.updatedByName} · {editedAgo} ·{' '}
          <button
            type="button"
            onClick={() => setSheet('history')}
            className="motion-focus text-content-primary underline underline-offset-[3px]"
          >
            History
          </button>
        </p>
      ) : null}
    </div>
  );

  const references = (
    <ReferencesBlock
      brief={brief}
      onToast={onToast}
      onAdded={(reference) => {
        patch((current) => ({ ...current, references: [...current.references, reference] }));
        void refresh();
      }}
      onRemoved={(id) => {
        patch((current) => ({ ...current, references: current.references.filter((r) => r.id !== id) }));
        void refresh();
      }}
    />
  );
  const decisions = (
    <DecisionsBlock
      brief={brief}
      onToast={onToast}
      onAdded={(decision) => {
        patch((current) => ({ ...current, decisions: [decision, ...current.decisions] }));
        void refresh();
      }}
      onRemoved={(id) => {
        patch((current) => ({ ...current, decisions: current.decisions.filter((d) => d.id !== id) }));
        void refresh();
      }}
    />
  );
  const ideaBlock = (
    <IdeaBlock idea={idea} onChange={changeIdea} onBlur={() => void flushIdea()} textareaRef={ideaRef} />
  );

  let body: ReactNode;
  if (draft) {
    body = (
      <div className={isDesktop ? 'max-w-[560px]' : ''}>
        <div className="mt-6 rounded-2xl border border-brand/30 bg-brand/5 p-4">
          <p className="text-[13px] font-semibold text-content-primary">{BRIEF_COPY.drafted}</p>
          <p className="mt-2.5 text-[15px] leading-[1.55] text-content-primary">{draft.idea}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={keepDraft} disabled={settling} className={`${PRIMARY} h-11 flex-1 text-sm`}>
              {settling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Keep'}
            </button>
            <button type="button" onClick={discardDraft} disabled={settling} className={`${SECONDARY} flex-1`}>
              Discard
            </button>
          </div>
        </div>
        <DatesBlock brief={brief} />
        <PeopleBlock brief={brief} />
      </div>
    );
  } else if (empty) {
    body = (
      <div className={isDesktop ? 'max-w-[560px]' : ''}>
        <div className={`${LIST} mt-7 p-[22px]`}>
          <p className="font-display text-[22px] leading-snug text-content-primary">{BRIEF_COPY.emptyTitle}</p>
          <p className="mt-1.5 text-sm text-content-secondary">{BRIEF_COPY.emptyLine}</p>
          <button type="button" onClick={startDraft} disabled={drafting} className={`${PRIMARY} mt-[18px]`}>
            {drafting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                UrgAns is writing…
              </>
            ) : (
              BRIEF_COPY.draft
            )}
          </button>
          {isCreditsEnabled() ? (
            <p className="mt-2 text-center text-[13px] text-content-primary/55">{embeddedCostLine('release.draft_brief', balance)}</p>
          ) : null}
          <button
            type="button"
            onClick={writeYourself}
            className="motion-focus mt-3.5 block w-full text-center text-sm text-content-tertiary transition-colors hover:text-content-primary"
          >
            {BRIEF_COPY.writeYourself}
          </button>
        </div>
        <DatesBlock brief={brief} />
        <PeopleBlock brief={brief} />
      </div>
    );
  } else if (isDesktop) {
    body = (
      <div className="flex gap-7">
        <div className="min-w-0 flex-[1.4]">
          {ideaBlock}
          {references}
          {decisions}
        </div>
        <div className="min-w-0 flex-1">
          <DatesBlock brief={brief} />
          <PeopleBlock brief={brief} />
          <NotesBlock brief={brief} />
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {ideaBlock}
        {references}
        <DatesBlock brief={brief} />
        <PeopleBlock brief={brief} />
        {decisions}
        <NotesBlock brief={brief} />
      </>
    );
  }

  return (
    <div className="pb-10 lg:max-w-[860px]">
      {header}
      {body}
      {sheet === 'history' ? <HistorySheet brief={brief} onClose={() => setSheet(null)} /> : null}
      {sheet === 'share' ? (
        <ShareSheet
          brief={brief}
          onToast={onToast}
          onClose={() => setSheet(null)}
          onChange={(share) => patch((current) => ({ ...current, share }))}
        />
      ) : null}
      <UrgansLockedSheet
        open={locked !== null}
        message={locked ?? ''}
        actionType="release.draft_brief"
        onClose={() => setLocked(null)}
      />
    </div>
  );
}
