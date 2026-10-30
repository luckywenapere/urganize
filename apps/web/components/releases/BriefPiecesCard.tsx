'use client';

import { useState } from 'react';
import { Check, Loader2, Plus } from '@/components/icons';
import { formatBriefDay, type BriefPayload } from '@/lib/release-brief';
import { useTaskStore } from '@/stores/useTaskStore';
import { BriefAvatar, briefCall } from './brief-shared';

/**
 * What we're making (#897 phase 3): the pieces of the rollout, read from the
 * plan. Each row is a real activity, so its owner, date and status are the
 * plan's; + Piece adds an activity to the plan and puts it here.
 */

type Toast = (message: string, tone: 'success' | 'error' | 'warning') => void;

const DOT: Record<string, string> = {
  done: 'bg-brand',
  late: 'bg-status-error',
  open: 'border-2 border-stroke-strong bg-transparent',
};

const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-[16px] text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none lg:text-sm';

function AddPieceForm({
  brief,
  onDone,
  onCancel,
  onToast,
}: {
  brief: BriefPayload;
  onDone: () => void;
  onCancel: () => void;
  onToast: Toast;
}) {
  const createTask = useTaskStore((state) => state.createTask);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [spec, setSpec] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    // A real activity in the plan, through the same door as New activity, so
    // its owner, reminders and notifications work like any other.
    const task = await createTask({
      title: title.trim(),
      releaseId: brief.releaseId,
      dueDate: due || null,
      description: spec.trim() || null,
    });
    if (!task) {
      setSaving(false);
      onToast('Could not add the piece. Try again.', 'error');
      return;
    }
    const shown = await briefCall<{ show: boolean }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/pieces/${encodeURIComponent(task.id)}`,
      { method: 'PATCH', body: JSON.stringify({ show: true }) }
    );
    setSaving(false);
    if (!shown.ok) {
      onToast('Added to the plan, but not to the brief. Turn on Show on the brief in the activity.', 'warning');
    } else {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((item) => (item.id === task.id ? { ...item, onBrief: true } : item)),
      }));
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <input autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="What it is: Visualiser, Lyric cards…" aria-label="Piece" className={FIELD} />
      <input type="date" value={due} onChange={(event) => setDue(event.target.value)} aria-label="Due" className={FIELD} />
      <input value={spec} maxLength={200} onChange={(event) => setSpec(event.target.value)} placeholder="In one line: 30 seconds, vertical, golden hour" aria-label="Spec" className={`${FIELD} sm:col-span-2`} />
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={!title.trim() || saving} className="motion-focus inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-content-inverse disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Add to the plan'}
        </button>
        <button type="button" onClick={onCancel} className="motion-focus h-9 rounded-full px-3 text-[13px] text-content-secondary hover:text-content-primary">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function BriefPiecesCard({
  brief,
  canAdd,
  onRefresh,
  onToast,
}: {
  brief: BriefPayload;
  canAdd: boolean;
  onRefresh: () => void;
  onToast: Toast;
}) {
  const [adding, setAdding] = useState(false);
  const [ticking, setTicking] = useState<string | null>(null);
  // Mark your own piece done (or open again). Status only, so a guest may too.
  const tick = async (taskId: string, done: boolean) => {
    setTicking(taskId);
    const status = done ? 'done' : 'todo';
    const result = await briefCall<{ task: unknown }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setTicking(null);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    useTaskStore.setState((state) => ({
      tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, status } : task)),
    }));
    onRefresh();
  };
  // A brief cached before this card existed has no pieces yet.
  const { items, done, total, late } = brief.board.pieces ?? { items: [], done: 0, total: 0, late: 0 };

  return (
    <section aria-label="What we’re making" className="relative min-w-0 overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.09em] text-content-tertiary">What we’re making</h3>
          {total > 0 ? (
            <p className="font-mono text-[11.5px] text-content-tertiary">
              {done} of {total} done
              {late > 0 ? <span className="text-status-error"> · {late} late</span> : null}
            </p>
          ) : null}
        </div>
        {canAdd && !adding ? (
          <button type="button" onClick={() => setAdding(true)} className="motion-focus inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:opacity-80">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Piece
          </button>
        ) : null}
      </div>

      {adding ? (
        <AddPieceForm
          brief={brief}
          onToast={onToast}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            onRefresh();
          }}
        />
      ) : null}

      {items.length === 0 && !adding ? (
        <p className="mt-2.5 text-[13.5px] text-content-tertiary">
          {canAdd
            ? 'What this rollout makes: cover art, a visualiser, teasers. Each piece is an activity in the plan.'
            : 'No pieces yet.'}
        </p>
      ) : (
        <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
          {items.map((piece) => (
            <li key={piece.id} className="flex min-w-0 items-center gap-3 border-b border-stroke-subtle py-2.5 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
              {piece.assigneeId && piece.assigneeId === brief.viewer.id ? (
                // Your own piece: tick it here. A guest can change only this (Oyin, 31 Oct 2026, #897).
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={piece.state === 'done'}
                  aria-label={`Mark ${piece.title} ${piece.state === 'done' ? 'not done' : 'done'}`}
                  disabled={ticking === piece.id}
                  onClick={() => void tick(piece.id, piece.state !== 'done')}
                  className={`motion-focus grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] disabled:opacity-60 ${
                    piece.state === 'done' ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-strong hover:border-brand'
                  }`}
                >
                  {piece.state === 'done' ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                </button>
              ) : (
                <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[piece.state]}`} />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[14px] font-medium ${piece.state === 'done' ? 'text-content-tertiary line-through' : 'text-content-primary'}`}>
                  {piece.title}
                </span>
                {piece.spec ? <span className="block truncate text-[12.5px] text-content-tertiary">{piece.spec}</span> : null}
              </span>
              {piece.assigneeInitials ? (
                <span title={piece.assigneeName ?? undefined}>
                  <BriefAvatar label={piece.assigneeInitials} colorKey={piece.assigneeId ?? piece.id} size={24} />
                </span>
              ) : null}
              <span className={`w-[76px] shrink-0 text-right font-mono text-[11.5px] ${piece.state === 'late' ? 'text-status-error' : 'text-content-tertiary'}`}>
                {piece.state === 'done' ? 'Done' : piece.dueDate ? formatBriefDay(piece.dueDate) : 'No date'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
