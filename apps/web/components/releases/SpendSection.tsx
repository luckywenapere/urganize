'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Download, Pencil, Plus, Trash2 } from '@/components/icons';
import { formatNaira, koboToPlainNaira } from '@/lib/money';
import { presenceDay } from '@/lib/presence';
import type { SpendFormValues } from '@/lib/release-spend-client';
import {
  SPEND_CATEGORIES,
  SPEND_CATEGORY_LABELS,
  SPEND_COPY,
  buildSpendCsv,
  paybackQuestion,
  spendCsvFileName,
  type Payback,
  type SpendLine,
} from '@/lib/release-spend';
import { shareOrDownloadTextFile } from '@/lib/share-file';
import { useSpend } from './useSpend';

type SpendSectionProps = {
  releaseId: string;
  releaseTitle: string;
  /** The rollout's activities, for the Task picker and the spreadsheet's Task column. */
  tasks: ReadonlyArray<{ id: string; title: string }>;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
  /**
   * Arrive with the add form open (Home's "Add spend" button, `?field=add`,
   * 2026-10-11). Read once on mount; the panel keys this section by release
   * and by the request, so a second arrival opens it again.
   */
  startAdding?: boolean;
};

const PRIMARY_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center gap-2 rounded-lg border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center gap-2 rounded-lg border border-stroke-control px-4 text-sm font-semibold text-content-secondary transition-colors hover:border-content-secondary hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-60';
const SMALL_BUTTON =
  'motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-lg border border-stroke-control px-2.5 text-xs font-semibold text-content-secondary transition-colors hover:border-content-secondary hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-60';
const FIELD =
  'mt-1 w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary hover:border-content-secondary focus:border-brand';
const LABEL = 'block text-xs font-semibold text-content-secondary';
const CARD = 'rounded-xl border border-stroke-default bg-bg-surface p-4';

const todayInLagos = (): string => presenceDay(new Date());

/** "12 Oct 2026" from "2026-10-12", without a timezone shifting the day. */
function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, date))
  );
}

function emptyValues(): SpendFormValues {
  return { category: SPEND_CATEGORIES[0], amountNaira: '', paidTo: '', spentOn: todayInLagos(), taskId: '', note: '' };
}

function valuesFromLine(line: SpendLine): SpendFormValues {
  return {
    category: line.category,
    amountNaira: koboToPlainNaira(line.amountKobo),
    paidTo: line.paidTo ?? '',
    spentOn: line.spentOn,
    taskId: line.taskId ?? '',
    note: line.note ?? '',
  };
}

/**
 * What the team paid for on a rollout, and what it paid back.
 *
 * WHO SEES THIS IS DECIDED BY THE SERVER, once, in the database
 * (can_view_release_spend): the rollout's owner and team managers. A team member
 * without access reaches this panel only through a typed URL and is told so; the
 * menu row is not shown to them in the first place. Nothing here is cached or
 * kept on the device, because it is money.
 *
 * Amounts are typed as naira and converted to whole kobo by the server, once, so
 * a wrong conversion here cannot reach the database. A line Urganize added
 * itself (today the daily UrgAns credits) is shown with a tag and has no Edit or
 * Delete, matching a server that refuses both.
 */
export function SpendSection({ releaseId, releaseTitle, tasks, onToast, startAdding = false }: SpendSectionProps) {
  const { state, total, reload, add, change, remove, answerPayback } = useSpend(releaseId);
  const [form, setForm] = useState<{ mode: 'add' } | { mode: 'edit'; line: SpendLine } | null>(
    startAdding ? { mode: 'add' } : null
  );
  const [announcement, setAnnouncement] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const taskTitleById = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);

  const tell = (message: string) => {
    setAnnouncement(message);
    onToast?.(message, 'success');
  };

  if (state.status === 'loading') {
    return (
      <div className="mt-8 space-y-4" aria-busy="true">
        <div className="h-28 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
        <div className="h-48 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mt-8 rounded-xl border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm text-content-primary" role="alert">
          {SPEND_COPY.loadError}
        </p>
        <p className="mt-1 text-xs text-content-secondary">{state.error}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="motion-focus mt-3 text-xs font-semibold text-brand hover:underline"
        >
          {SPEND_COPY.tryAgain}
        </button>
      </div>
    );
  }

  if (!state.canView) {
    return (
      <div className={`mt-8 ${CARD}`}>
        <p className="text-sm text-content-secondary">{SPEND_COPY.noAccess}</p>
      </div>
    );
  }

  const { lines, payback } = state;

  const handleExport = async () => {
    if (isExporting || lines.length === 0) return;
    setIsExporting(true);
    try {
      const outcome = await shareOrDownloadTextFile({
        contents: buildSpendCsv({ lines, payback, taskTitles: taskTitleById }),
        fileName: spendCsvFileName(releaseTitle, todayInLagos()),
        mimeType: 'text/csv;charset=utf-8',
        title: SPEND_COPY.title,
      });
      if (outcome === 'unsupported') onToast?.(SPEND_COPY.csvUnsupported, 'warning');
      else if (outcome === 'downloaded') tell(SPEND_COPY.csvDownloaded);
      else if (outcome === 'shared') tell(SPEND_COPY.csvShared);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : SPEND_COPY.loadError, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async (line: SpendLine) => {
    if (typeof window !== 'undefined' && !window.confirm(SPEND_COPY.deleteConfirm)) return;
    const result = await remove(line.id);
    if (result.ok) tell(SPEND_COPY.deletedToast);
    else onToast?.(result.error, 'error');
  };

  return (
    <div className="mt-8 space-y-6">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <section className={CARD} aria-label={SPEND_COPY.totalLabel}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          {SPEND_COPY.totalLabel}
        </p>
        <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-content-primary">
          {formatNaira(total)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setForm({ mode: 'add' })}
            disabled={form?.mode === 'add'}
            className={PRIMARY_BUTTON}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {SPEND_COPY.addButton}
          </button>
          {lines.length > 0 ? (
            <button type="button" onClick={() => void handleExport()} disabled={isExporting} className={SECONDARY_BUTTON}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {SPEND_COPY.exportButton}
            </button>
          ) : null}
        </div>
      </section>

      <PaybackBlock
        key={payback ? `${payback.askedAt}:${payback.answeredAt ?? 'open'}` : 'none'}
        releaseTitle={releaseTitle}
        payback={payback}
        onSave={async (input) => {
          const result = await answerPayback(input);
          if (result.ok) tell(SPEND_COPY.paybackSavedToast);
          return result.ok ? null : result.error;
        }}
      />

      {form ? (
        <SpendForm
          key={form.mode === 'edit' ? form.line.id : 'new'}
          title={form.mode === 'edit' ? SPEND_COPY.editButton : SPEND_COPY.addButton}
          initial={form.mode === 'edit' ? valuesFromLine(form.line) : emptyValues()}
          tasks={tasks}
          onCancel={() => setForm(null)}
          onSave={async (values) => {
            const result = form.mode === 'edit' ? await change(form.line.id, values) : await add(values);
            if (!result.ok) return result.error;
            tell(form.mode === 'edit' ? SPEND_COPY.savedToast : SPEND_COPY.addedToast);
            setForm(null);
            return null;
          }}
        />
      ) : null}

      {lines.length === 0 ? (
        <p className="text-sm text-content-secondary">{SPEND_COPY.empty}</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line.id} className={`${CARD} flex flex-wrap items-start justify-between gap-x-4 gap-y-2`}>
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-content-primary">
                    {SPEND_CATEGORY_LABELS[line.category]}
                  </span>
                  {line.isAutomatic ? (
                    <span className="rounded-full border border-stroke-control px-2 py-0.5 text-[11px] font-semibold text-content-secondary">
                      {SPEND_COPY.automaticTag}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-content-secondary">
                  {formatDay(line.spentOn)}
                  {line.paidTo ? ` · ${line.paidTo}` : ''}
                  {line.taskId && taskTitleById.get(line.taskId) ? ` · ${taskTitleById.get(line.taskId)}` : ''}
                </p>
                {line.note ? <p className="mt-1 text-xs text-content-tertiary">{line.note}</p> : null}
              </div>
              <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
                <p className="text-sm font-semibold tabular-nums text-content-primary sm:mr-1">{formatNaira(line.amountKobo)}</p>
                {!line.isAutomatic ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ mode: 'edit', line })}
                      className={SMALL_BUTTON}
                      aria-label={`${SPEND_COPY.editButton} ${SPEND_CATEGORY_LABELS[line.category]} ${formatNaira(line.amountKobo)}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      {SPEND_COPY.editButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(line)}
                      className={SMALL_BUTTON}
                      aria-label={`${SPEND_COPY.deleteButton} ${SPEND_CATEGORY_LABELS[line.category]} ${formatNaira(line.amountKobo)}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {SPEND_COPY.deleteButton}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type SpendFormProps = {
  title: string;
  initial: SpendFormValues;
  tasks: ReadonlyArray<{ id: string; title: string }>;
  onCancel: () => void;
  /** Answers an error to show, or null when it saved. */
  onSave: (values: SpendFormValues) => Promise<string | null>;
};

function SpendForm({ title, initial, tasks, onCancel, onSave }: SpendFormProps) {
  const [values, setValues] = useState<SpendFormValues>(initial);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const ids = { category: useId(), amount: useId(), paidTo: useId(), date: useId(), task: useId(), note: useId() };
  const firstField = useRef<HTMLSelectElement>(null);

  // A form that opens should take the cursor: tapping Add spend and then having
  // to find the form is the slow path.
  useEffect(() => {
    firstField.current?.focus();
  }, []);

  const set = (key: keyof SpendFormValues, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    const message = await onSave(values);
    setIsSaving(false);
    if (message) setError(message);
  };

  return (
    <form onSubmit={submit} className={CARD} aria-label={title}>
      <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.category} className={LABEL}>
            {SPEND_COPY.labels.category}
          </label>
          <select
            id={ids.category}
            ref={firstField}
            value={values.category}
            onChange={(event) => set('category', event.target.value)}
            className={FIELD}
          >
            {SPEND_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {SPEND_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.amount} className={LABEL}>
            {SPEND_COPY.labels.amount}
          </label>
          <input
            id={ids.amount}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={values.amountNaira}
            onChange={(event) => set('amountNaira', event.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={ids.paidTo} className={LABEL}>
            {SPEND_COPY.labels.paidTo}
          </label>
          <input
            id={ids.paidTo}
            type="text"
            autoComplete="off"
            maxLength={200}
            value={values.paidTo}
            onChange={(event) => set('paidTo', event.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={ids.date} className={LABEL}>
            {SPEND_COPY.labels.date}
          </label>
          <input
            id={ids.date}
            type="date"
            value={values.spentOn}
            onChange={(event) => set('spentOn', event.target.value)}
            className={FIELD}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={ids.task} className={LABEL}>
            {SPEND_COPY.labels.task}
          </label>
          <select
            id={ids.task}
            value={values.taskId}
            onChange={(event) => set('taskId', event.target.value)}
            className={FIELD}
          >
            <option value="">{SPEND_COPY.noTask}</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={ids.note} className={LABEL}>
            {SPEND_COPY.labels.note}
          </label>
          <textarea
            id={ids.note}
            rows={2}
            maxLength={1000}
            value={values.note}
            onChange={(event) => set('note', event.target.value)}
            className={FIELD}
          />
        </div>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON}>
          {SPEND_COPY.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving} className={SECONDARY_BUTTON}>
          {SPEND_COPY.cancelButton}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

type PaybackBlockProps = {
  releaseTitle: string;
  payback: Payback | null;
  /** Answers an error to show, or null when it saved. */
  onSave: (input: { amountNaira: string; note: string }) => Promise<string | null>;
};

/**
 * What the rollout paid back. Three states: answered (a line under the total,
 * with a way to change it), asked and not yet answered (the question and its
 * form, which is where the notification lands), and never asked (a quiet way to
 * add it early). The parent keys this on the payback's own state so the form
 * resets when the answer arrives.
 */
function PaybackBlock({ releaseTitle, payback, onSave }: PaybackBlockProps) {
  const answered = payback !== null && payback.amountKobo !== null;
  const asked = payback !== null && !answered;
  const [open, setOpen] = useState(asked);
  const [amount, setAmount] = useState(answered && payback.amountKobo !== null ? koboToPlainNaira(payback.amountKobo) : '');
  const [note, setNote] = useState(payback?.note ?? '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const amountId = useId();
  const noteId = useId();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    const message = await onSave({ amountNaira: amount, note });
    setIsSaving(false);
    if (message) setError(message);
    else setOpen(false);
  };

  if (!open) {
    if (answered && payback && payback.amountKobo !== null) {
      return (
        <section className={CARD} aria-label={SPEND_COPY.paybackAnswered}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {SPEND_COPY.paybackAnswered}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-content-primary">
            {formatNaira(payback.amountKobo)}
          </p>
          {payback.note ? <p className="mt-1 text-xs text-content-secondary">{payback.note}</p> : null}
          <button type="button" onClick={() => setOpen(true)} className={`${SMALL_BUTTON} mt-3`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {SPEND_COPY.paybackEdit}
          </button>
        </section>
      );
    }
    return (
      <button type="button" onClick={() => setOpen(true)} className="motion-focus text-xs font-semibold text-brand hover:underline">
        {SPEND_COPY.paybackAdd}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className={CARD} aria-label={paybackQuestion(releaseTitle)}>
      <h3 className="text-sm font-semibold text-content-primary">{paybackQuestion(releaseTitle)}</h3>
      <div className="mt-3 grid gap-3">
        <div>
          <label htmlFor={amountId} className={LABEL}>
            {SPEND_COPY.paybackLabels.amount}
          </label>
          <input
            id={amountId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={noteId} className={LABEL}>
            {SPEND_COPY.paybackLabels.note}
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={FIELD}
          />
        </div>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-status-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON}>
          {SPEND_COPY.paybackSave}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={isSaving} className={SECONDARY_BUTTON}>
          {SPEND_COPY.cancelButton}
        </button>
      </div>
    </form>
  );
}
