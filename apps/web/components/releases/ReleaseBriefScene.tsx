'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, Loader2, Lock, X } from '@/components/icons';
import { VoicePill } from '@/components/workspace/VoicePill';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { briefToPlanNotes, ideaSourceLabel } from '@/lib/idea-round';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { UrgansLockedSheet } from '@/components/urgans-actions/UrgansLockedSheet';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedCostLine } from '@/lib/credits/copy';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { applyRunAction, discardRunAction, runBriefFromIdeas, runDraftBrief } from '@/lib/urgans-actions/client';
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
  type BriefDecision,
  type BriefPayload,
} from '@/lib/release-brief';
import { currentShareOrigin } from '@/lib/app-hosts';
import { BriefBoard } from './BriefBoard';
import { BriefAvatar, briefAccessToken, briefCall } from './brief-shared';

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
 *
 * The idea round (2026-10-27, founder approved mocks): after the round closes
 * UrgAns fills this page from the ideas. The owner or a team admin settles
 * where the ideas disagree (To settle), edits anything, then taps Approve and
 * build the plan. Approved, the page is locked (no edits) until New version,
 * and the plan is built from it alone. The ideas list takes the right column.
 */

type Props = {
  releaseId: string;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
  /** The rollout already has its plan. */
  hasPlan?: boolean;
  /** Open the planner with the approved brief as its notes. Owner only. */
  onBuildPlan?: (notes: string) => void;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; brief: BriefPayload };

type Draft = { actionId: string; idea: string };

const IDEA_SAVE_DELAY_MS = 800;

const LIST = 'overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface';
const ROW_DIVIDER = 'border-t border-stroke-default first:border-t-0';
const PRIMARY =
  'motion-focus motion-press inline-flex h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY =
  'motion-focus motion-press inline-flex h-11 w-full items-center justify-center rounded-full border border-stroke-strong px-5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60';

const call = briefCall;
const accessToken = briefAccessToken;
const Avatar = BriefAvatar;

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
    const url = `${currentShareOrigin()}/brief/${brief.share.token}`;
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
              {row.when ?? formatBriefDay(row.date)}
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

function NotesBlock({ brief, bare = false }: { brief: BriefPayload; bare?: boolean }) {
  if (brief.notes.length === 0) return null;
  return (
    <section>
      {bare ? null : <BlockLabel>Notes</BlockLabel>}
      <ul className={bare ? '' : LIST}>
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

function DecisionsBlock({
  brief,
  onAdded,
  onRemoved,
  onToast,
  bare = false,
}: {
  brief: BriefPayload;
  onAdded: (decision: BriefDecision) => void;
  onRemoved: (id: string) => void;
  onToast: Props['onToast'];
  /** Inside a board card: no label, no frame. */
  bare?: boolean;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const dismissKey = `urganize.brief.dismissed.${brief.releaseId}`;
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(dismissKey);
      setDismissed(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setDismissed([]);
    }
  }, [dismissKey]);
  const suggestions = (brief.planSeed?.decisions ?? []).filter(
    (text) => !dismissed.includes(text) && !brief.decisions.some((decision) => decision.body === text)
  );
  const dismiss = (text: string) => {
    const next = [...dismissed, text];
    setDismissed(next);
    try {
      window.localStorage.setItem(dismissKey, JSON.stringify(next));
    } catch {
      // Dismissals are a convenience; they come back next visit if storage is blocked.
    }
  };

  const postDecision = async (body: string): Promise<boolean> => {
    const result = await call<{ decision: { id: string; body: string; createdBy: string; createdAt: string } }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/decisions`,
      { method: 'POST', body: JSON.stringify({ body }) }
    );
    if (!result.ok) {
      onToast(result.error, 'error');
      return false;
    }
    onAdded({ ...result.data.decision, authorName: 'You' });
    return true;
  };

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
      {bare ? null : <BlockLabel>Decisions</BlockLabel>}
      <div className={bare ? '' : LIST}>
        {brief.decisions.map((decision) => (
          <div key={decision.id} className={`flex items-start gap-2 px-3.5 py-3 ${ROW_DIVIDER}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-content-primary">{decision.body}</p>
              <p className="mt-[3px] font-mono text-[11px] text-content-tertiary">
                {decision.source
                  ? `From ${ideaSourceLabel(decision.source)}`
                  : `${decision.authorName} · ${formatShortDay(decision.createdAt)}`}
              </p>
            </div>
            {brief.viewer.canEdit && (decision.createdBy === brief.viewer.id || brief.viewer.canManageShare) ? (
              <RemoveButton label="Delete decision" onClick={() => remove(decision)} />
            ) : null}
          </div>
        ))}
        {(brief.viewer.canEdit ? suggestions : []).map((text) => (
          <div key={text} className={`flex items-center gap-2 px-3.5 py-3 ${ROW_DIVIDER}`}>
            <p className="min-w-0 flex-1 text-sm text-content-secondary">
              {text}
              <span className="ml-2 font-mono text-[11px] text-content-tertiary">From your plan</span>
            </p>
            <button
              type="button"
              onClick={() => void postDecision(text)}
              className="motion-focus shrink-0 text-sm font-semibold text-brand"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => dismiss(text)}
              className="motion-focus shrink-0 text-sm text-content-tertiary hover:text-content-primary"
            >
              Drop
            </button>
          </div>
        ))}
        {brief.viewer.canEdit ? (
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
        ) : null}
      </div>
    </section>
  );
}

/** Where the ideas disagree (2026-10-27). The owner or an admin taps a side; it becomes a decision. */
function ToSettleBlock({
  brief,
  onSettle,
  settlingId,
}: {
  brief: BriefPayload;
  onSettle: (itemId: string, option: number) => void;
  settlingId: string | null;
}) {
  const round = brief.round;
  if (!round || round.toSettle.length === 0) return null;
  const canPick = round.canRun && round.state !== 'approved';
  return (
    <section>
      <BlockLabel>{round.state === 'approved' ? 'Still open' : `To settle · ${round.toSettle.length}`}</BlockLabel>
      <div className={LIST}>
        {round.toSettle.map((item) => (
          <div key={item.id} className={`px-3.5 py-3 ${ROW_DIVIDER}`}>
            <p className="text-sm font-semibold text-content-primary">{item.question}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.options.map((option, index) => (
                <button
                  key={`${item.id}-${index}`}
                  type="button"
                  disabled={!canPick || settlingId !== null}
                  onClick={() => onSettle(item.id, index)}
                  className="motion-focus inline-flex min-h-10 items-center gap-2 rounded-full border border-stroke-strong px-3.5 text-[13px] text-content-primary transition-colors enabled:hover:border-brand enabled:hover:bg-brand/5 disabled:cursor-default"
                >
                  {settlingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  <span>{option.text}</span>
                  {option.by.length ? (
                    <span className="font-mono text-[11px] text-content-tertiary">{option.by.join(', ')}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Everyone's ideas, with who said them and the recording (2026-10-27). */
function IdeasBlock({ brief, bare = false }: { brief: BriefPayload; bare?: boolean }) {
  const ideas = brief.ideas ?? [];
  if (!brief.round || ideas.length === 0) return null;
  return (
    <section>
      {bare ? null : <BlockLabel>Ideas</BlockLabel>}
      <ul className={bare ? '' : LIST}>
        {ideas.map((idea) => (
          <li key={idea.id} className={`flex gap-3 px-3.5 py-3 ${ROW_DIVIDER}`}>
            <Avatar label={idea.initials} colorKey={idea.authorName} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] text-content-tertiary">{idea.authorName}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-content-primary">{idea.content}</p>
              {idea.audioUrl ? <VoicePill url={idea.audioUrl} seconds={idea.audioSeconds} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IdeaBlock({
  idea,
  onChange,
  onBlur,
  textareaRef,
  readOnly = false,
  bare = false,
}: {
  idea: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** An approved brief is locked (2026-10-27). */
  readOnly?: boolean;
  /** Inside the board's idea card, which has its own label. */
  bare?: boolean;
}) {
  // Grow with the text, so the idea reads as a paragraph rather than a box.
  // Again when its width changes: the board can lay the card out again (a
  // wider or narrower panel), and a height taken at another width cut the
  // idea to one line. The ref is shared with the scene, so the textarea it
  // points at can change without `idea` changing: check on every render.
  const observed = useRef<{ node: HTMLTextAreaElement; observer: ResizeObserver } | null>(null);
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    const fit = () => {
      node.style.height = '0px';
      node.style.height = `${node.scrollHeight}px`;
    };
    fit();
    if (observed.current?.node === node) return;
    observed.current?.observer.disconnect();
    let lastWidth = node.clientWidth;
    const observer = new ResizeObserver(() => {
      // Only a width change: our own height change must not loop.
      if (node.clientWidth === lastWidth) return;
      lastWidth = node.clientWidth;
      fit();
    });
    observer.observe(node);
    observed.current = { node, observer };
  });
  useEffect(() => () => observed.current?.observer.disconnect(), []);

  return (
    <section>
      {bare ? null : <BlockLabel>Idea</BlockLabel>}
      <textarea
        ref={textareaRef}
        value={idea}
        rows={2}
        maxLength={MAX_IDEA_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        readOnly={readOnly}
        placeholder={bare ? 'The story behind it, in a few sentences.' : 'The story, the sound, the look and the feel.'}
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

export function ReleaseBriefScene({ releaseId, onToast, hasPlan = false, onBuildPlan }: Props) {
  const [roundBusy, setRoundBusy] = useState<'approve' | 'new_version' | 'write' | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
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

  const keepPlanIdea = async (text: string) => {
    if (settling) return;
    setSettling(true);
    const result = await call<{ idea: string; updatedAt: string }>(
      `/api/releases/${encodeURIComponent(releaseId)}/brief`,
      { method: 'PATCH', body: JSON.stringify({ idea: text }) }
    );
    setSettling(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    await load();
  };

  const editPlanIdea = (text: string) => {
    setIdea(text);
    pendingIdea.current = text;
    setWriting(true);
    requestAnimationFrame(() => ideaRef.current?.focus());
  };

  const discardDraft = async () => {
    if (!draft) return;
    const current = draft;
    setDraft(null);
    void discardRunAction(current.actionId, await accessToken());
  };

  // ── The idea round's review step (2026-10-27) ──
  const roundCall = (body: Record<string, unknown>) =>
    call<{ state?: string; version?: number }>(`/api/releases/${encodeURIComponent(releaseId)}/brief/round`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  const settle = async (itemId: string, option: number) => {
    if (settlingId) return;
    setSettlingId(itemId);
    const result = await roundCall({ action: 'settle', itemId, option });
    setSettlingId(null);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    await refresh();
  };

  const approve = async () => {
    if (roundBusy || state.status !== 'ready') return;
    await flushIdea();
    setRoundBusy('approve');
    const result = await roundCall({ action: 'approve' });
    setRoundBusy(null);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    const current = state.brief;
    captureAnalyticsEvent({
      name: 'brief_approved',
      properties: { version: result.data.version ?? 1, open_questions: current.round?.toSettle.length ?? 0 },
    });
    await refresh();
    if (!hasPlan && onBuildPlan) {
      onBuildPlan(
        briefToPlanNotes({ idea: savedIdea.current, decisions: current.decisions, toSettle: current.round?.toSettle ?? [] })
      );
    }
  };

  const newVersion = async () => {
    if (roundBusy) return;
    setRoundBusy('new_version');
    const result = await roundCall({ action: 'new_version' });
    setRoundBusy(null);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onToast('New version started. Your activities stay as they are.', 'success');
    await refresh();
  };

  const writeFromIdeas = async () => {
    if (roundBusy) return;
    setRoundBusy('write');
    const result = await runBriefFromIdeas({ releaseId });
    setRoundBusy(null);
    void refreshBalance();
    if (!result.ok) {
      if (result.planRequired) setLocked(result.error);
      else onToast(result.error, 'error');
      return;
    }
    await load();
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

  const round = state.brief.round ?? null;
  // Approved: locked for everyone until New version (the server refuses edits too).
  const lockedBrief = round?.state === 'approved';
  const brief = lockedBrief ? { ...state.brief, viewer: { ...state.brief.viewer, canEdit: false } } : state.brief;
  const empty = isBriefEmpty({ ...brief, idea }) && !writing;
  const showChrome = !empty && !draft;
  // The filled brief is a board; the empty and draft states stay one column.
  const board = showChrome;
  const editedAgo = formatEditedAgo(brief.updatedAt);
  const ideaCount = brief.ideas?.length ?? 0;

  // The review card under the header: approve, or what comes after approval.
  const roundCard =
    !round || !showChrome ? null : round.state === 'closed' && round.canRun ? (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-4 lg:max-w-[860px]">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-content-primary">Check it, then approve.</p>
          <p className="mt-0.5 text-[13px] text-content-secondary">
            {hasPlan ? 'Approving locks the brief.' : 'The plan is built from this page only.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void approve()}
          disabled={roundBusy !== null}
          className={`${PRIMARY} h-11 w-full gap-2 text-sm sm:w-auto`}
        >
          {roundBusy === 'approve' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {hasPlan || !onBuildPlan ? 'Approve' : 'Approve and build the plan'}
        </button>
      </div>
    ) : round.state === 'approved' && !hasPlan ? (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-stroke-default bg-bg-surface p-4 lg:max-w-[860px]">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-content-primary">Approved. The plan comes next.</p>
          <p className="mt-0.5 text-[13px] text-content-secondary">
            {onBuildPlan ? 'It is built from this brief alone.' : 'The owner builds it from this brief.'}
          </p>
        </div>
        {onBuildPlan ? (
          <button
            type="button"
            onClick={() =>
              onBuildPlan(briefToPlanNotes({ idea: brief.idea, decisions: brief.decisions, toSettle: round.toSettle }))
            }
            className={`${PRIMARY} h-11 w-full text-sm sm:w-auto`}
          >
            Build the plan
          </button>
        ) : null}
      </div>
    ) : null;

  const newVersionButton =
    lockedBrief && round?.canRun ? (
      <div className="mt-6">
        <button
          type="button"
          onClick={() => void newVersion()}
          disabled={roundBusy !== null}
          className={`${SECONDARY} sm:w-auto`}
        >
          {roundBusy === 'new_version' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'New version'}
        </button>
        <p className="mt-1.5 text-[12px] text-content-tertiary">A new version never changes activities you already have.</p>
      </div>
    ) : null;

  const shareButton = (
    <button
      type="button"
      onClick={() => setSheet('share')}
      className="motion-focus motion-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 text-[13px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
    >
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      Share
    </button>
  );

  const header = (
    <div className={board ? 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2' : ''}>
      {board ? null : (
        <div className="flex items-start justify-between gap-3">
          <p className={titleClass}>Brief</p>
        </div>
      )}
      {showChrome && lockedBrief && round ? (
        <p className={`${board ? '' : 'mt-2 '}flex flex-wrap items-center gap-1 font-mono text-[11px] text-content-tertiary`}>
          <Lock className="h-3 w-3" aria-hidden="true" />
          Approved{round.approvedByName ? ` by ${round.approvedByName}` : ''} · {formatShortDay(round.approvedAt)}
          {round.version > 1 ? ` · Version ${round.version}` : ''} ·{' '}
          <button
            type="button"
            onClick={() => setSheet('history')}
            className="motion-focus text-content-primary underline underline-offset-[3px]"
          >
            History
          </button>
        </p>
      ) : showChrome && round?.state === 'closed' && ideaCount > 0 ? (
        <p className={`${board ? '' : 'mt-2 '}font-mono text-[11px] text-content-tertiary`}>
          From {ideaCount === 1 ? '1 idea' : `${ideaCount} ideas`} · not approved ·{' '}
          <button
            type="button"
            onClick={() => setSheet('history')}
            className="motion-focus text-content-primary underline underline-offset-[3px]"
          >
            History
          </button>
        </p>
      ) : showChrome && brief.updatedByName && editedAgo ? (
        <p className={`${board ? '' : 'mt-2 '}font-mono text-[11px] text-content-tertiary`}>
          Edited by {brief.updatedByName} · {editedAgo} ·{' '}
          <button
            type="button"
            onClick={() => setSheet('history')}
            className="motion-focus text-content-primary underline underline-offset-[3px]"
          >
            History
          </button>
        </p>
      ) : board ? (
        <span />
      ) : null}
      {board ? shareButton : null}
    </div>
  );

  const ideaBlock = (
    <IdeaBlock
      idea={idea}
      onChange={changeIdea}
      onBlur={() => void flushIdea()}
      textareaRef={ideaRef}
      readOnly={lockedBrief}
      bare
    />
  );
  const bareDecisions = (
    <DecisionsBlock
      bare
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
  const toSettle = <ToSettleBlock brief={brief} onSettle={(id, option) => void settle(id, option)} settlingId={settlingId} />;
  // A closed round with ideas and no brief yet: UrgAns writes it from the ideas.
  const canWriteFromIdeas = Boolean(round && round.state === 'closed' && round.canRun && ideaCount > 0);

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
          {brief.planSeed?.idea ? (
            <div className="mt-[18px] rounded-2xl border border-stroke-default p-4">
              <p className="font-mono text-[11px] text-content-tertiary">{BRIEF_COPY.fromPlan}</p>
              <p className="mt-2 text-[15px] leading-[1.55] text-content-primary">{brief.planSeed.idea}</p>
              <div className="mt-3.5 flex gap-2">
                <button type="button" onClick={() => void keepPlanIdea(brief.planSeed!.idea)} disabled={settling} className={`${PRIMARY} h-11 flex-1 text-sm`}>
                  {settling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Keep'}
                </button>
                <button type="button" onClick={() => editPlanIdea(brief.planSeed!.idea)} className={`${SECONDARY} flex-1`}>
                  Edit
                </button>
              </div>
            </div>
          ) : null}
          {canWriteFromIdeas ? (
            <>
              <button
                type="button"
                onClick={() => void writeFromIdeas()}
                disabled={roundBusy !== null}
                className={`${PRIMARY} mt-[18px]`}
              >
                {roundBusy === 'write' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    UrgAns is writing…
                  </>
                ) : (
                  `Write it from the ${ideaCount === 1 ? 'idea' : `${ideaCount} ideas`}`
                )}
              </button>
              {isCreditsEnabled() ? (
                <p className="mt-2 text-center text-[13px] text-content-primary/55">
                  {embeddedCostLine('release.brief_from_ideas', balance)}
                </p>
              ) : null}
            </>
          ) : (
          <button
            type="button"
            onClick={startDraft}
            disabled={drafting}
            className={`${brief.planSeed?.idea ? SECONDARY : PRIMARY} mt-[18px]`}
          >
            {drafting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                UrgAns is writing…
              </>
            ) : brief.planSeed?.idea ? (
              BRIEF_COPY.polish
            ) : (
              BRIEF_COPY.draft
            )}
          </button>
          )}
          {isCreditsEnabled() && !canWriteFromIdeas ? (
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
        <IdeasBlock brief={brief} />
        <DatesBlock brief={brief} />
        <PeopleBlock brief={brief} />
      </div>
    );
  } else {
    // The board (#897): the filled brief, on a computer and a phone alike.
    const hasIdeas = (brief.ideas?.length ?? 0) > 0 && Boolean(brief.round);
    body = (
      <div className="mt-4">
        <BriefBoard
          brief={brief}
          onToast={onToast}
          onPatch={patch}
          onRefresh={() => void refresh()}
          slots={{
            idea: ideaBlock,
            decisions: bareDecisions,
            settle: round && round.toSettle.length > 0 ? toSettle : null,
            side: hasIdeas
              ? { label: 'Ideas', body: <IdeasBlock brief={brief} bare /> }
              : brief.notes.length > 0
                ? { label: 'Notes', body: <NotesBlock brief={brief} bare /> }
                : null,
            footer: newVersionButton,
          }}
        />
      </div>
    );
  }

  return (
    <div className={`pb-10 ${board ? 'lg:max-w-[1240px]' : 'lg:max-w-[860px]'}`}>
      {header}
      {roundCard}
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
