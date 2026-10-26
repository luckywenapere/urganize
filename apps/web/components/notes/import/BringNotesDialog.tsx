'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ClipboardList, FileText, Loader2, Lock, MessageCircle, X } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { supabase } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics/client';
import { useNotesStore } from '@/stores/useNotesStore';
import { buildImportPreview, countImport, noteBodyFor, type ImportItem, type ImportPreview } from '@/lib/note-import/build';
import { IMPORT_FILE_ACCEPT, readImportFile } from '@/lib/note-import/read-file';
import type { ImportKind } from '@/lib/note-import/detect';

type Step = 'choose' | 'whatsapp' | 'paste' | 'review' | 'done';

type BringNotesDialogProps = {
  open: boolean;
  onClose: () => void;
  releases: { id: string; title: string }[];
  /** Hands the kept to-dos to the planner. Absent when the planner is off. */
  onMakePlan?: (input: { releaseId?: string; extraNotes: string }) => void;
  /** True when a rollout already has activities, so a plan would clash. */
  releaseHasActivities?: (releaseId: string) => boolean;
};

const KIND_LABEL: Record<ImportKind, string> = {
  song: 'Lyrics',
  todo: 'To do',
  money: 'Money',
  date: 'Date',
  idea: 'Idea',
};

const eyebrow = 'font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary';
const primaryButton =
  'motion-focus motion-press inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-60';
const quietButton =
  'motion-focus motion-press inline-flex h-10 w-full items-center justify-center rounded-full border border-stroke-default px-4 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60';
const tile =
  'motion-focus motion-press flex w-full items-center gap-3 rounded-xl border border-stroke-default bg-bg-surface px-3 py-3 text-left transition-colors hover:bg-bg-hover';

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

const PLAN_NOTES_MAX = 2000;

async function accessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function BringNotesDialog({ open, onClose, releases, onMakePlan, releaseHasActivities }: BringNotesDialogProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<Step>('choose');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [hiddenAuthors, setHiddenAuthors] = useState<Set<string>>(new Set());
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  /** Per-item rollout choice. Absent means "use what was detected". */
  const [releaseChoice, setReleaseChoice] = useState<Map<string, string | null>>(new Map());
  const [saved, setSaved] = useState<{ importId: string; count: number; items: ImportItem[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useNotesStore((state) => state.load);

  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // Start clean every time the dialog opens. Nothing from a previous chat lingers.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep('choose');
      setPasted('');
      setError('');
      setPreview(null);
      setHiddenAuthors(new Set());
      setUnticked(new Set());
      setReleaseChoice(new Map());
      setSaved(null);
    }
  }

  const releaseTitle = useMemo(() => new Map(releases.map((release) => [release.id, release.title])), [releases]);

  const effectiveRelease = useCallback(
    (item: ImportItem): string | null => (releaseChoice.has(item.id) ? releaseChoice.get(item.id) ?? null : item.releaseId),
    [releaseChoice]
  );

  const visibleItems = useMemo(
    () => (preview ? preview.items.filter((item) => !item.author || !hiddenAuthors.has(item.author)) : []),
    [hiddenAuthors, preview]
  );
  const keptItems = useMemo(() => visibleItems.filter((item) => !unticked.has(item.id)), [unticked, visibleItems]);
  const counts = useMemo(() => countImport(visibleItems), [visibleItems]);

  const process = useCallback(
    (text: string, from: 'paste' | 'file') => {
      const result = buildImportPreview(text, releases);
      if (result.items.length === 0) {
        setError('Nothing worth keeping turned up in that. Try a longer piece of text or another chat.');
        setIsReading(false);
        return;
      }
      setPreview(result);
      setHiddenAuthors(new Set());
      setUnticked(new Set());
      setReleaseChoice(new Map());
      setError('');
      setIsReading(false);
      setStep('review');
      trackEvent('notes_import_sorted', {
        payload: { source: result.source, from, found: result.items.length, messages: result.messageCount },
      });
    },
    [releases]
  );

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError('');
      setIsReading(true);
      trackEvent('notes_import_started', { payload: { from: 'file' } });
      const read = await readImportFile(file);
      if (!read.ok) {
        setError(read.error);
        setIsReading(false);
        return;
      }
      process(read.text, 'file');
    },
    [process]
  );

  const handleSave = useCallback(async () => {
    if (!preview || keptItems.length === 0) return;
    setIsSaving(true);
    setError('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/notes/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: preview.source,
          items: keptItems.map((item) => ({
            body: noteBodyFor(item, preview.source),
            releaseId: effectiveRelease(item),
            at: item.at,
          })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { importId?: string; count?: number; error?: string } | null;
      if (!response.ok || !payload?.importId) {
        setError(payload?.error || 'Could not save those notes. Try again.');
        return;
      }
      setSaved({ importId: payload.importId, count: payload.count ?? keptItems.length, items: keptItems });
      setStep('done');
      trackEvent('notes_import_committed', { payload: { source: preview.source, notes: payload.count ?? keptItems.length } });
      await load({ force: true });
    } catch {
      setError('Could not reach Urganize. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }, [effectiveRelease, keptItems, load, preview]);

  const handleUndo = useCallback(async () => {
    if (!saved) return;
    setIsSaving(true);
    try {
      const token = await accessToken();
      const response = await fetch(`/api/notes/import/${saved.importId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError('Could not undo that. Delete the notes one by one for now.');
        return;
      }
      trackEvent('notes_import_undone', { payload: { notes: saved.count } });
      await load({ force: true });
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [load, onClose, saved]);

  const plan = useMemo(() => {
    if (!saved || !onMakePlan) return null;
    const useful = saved.items.filter((item) => item.tags.some((tag) => tag === 'todo' || tag === 'date' || tag === 'money'));
    if (useful.length === 0) return null;
    const releaseIds = [...new Set(saved.items.map(effectiveRelease).filter((id): id is string => Boolean(id)))];
    const releaseId = releaseIds.length === 1 ? releaseIds[0] : undefined;
    if (releaseId && releaseHasActivities?.(releaseId)) return null;
    let extraNotes = '';
    for (const item of useful) {
      const line = `${item.text.replace(/\s+/g, ' ').trim()}\n`;
      if (extraNotes.length + line.length > PLAN_NOTES_MAX) break;
      extraNotes += line;
    }
    return { releaseId, extraNotes: extraNotes.trim() };
  }, [effectiveRelease, onMakePlan, releaseHasActivities, saved]);

  if (!open || !isMounted) return null;

  const toggleAuthor = (name: string) =>
    setHiddenAuthors((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const toggleItem = (id: string) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filePicker = (
    <input
      ref={fileInput}
      type="file"
      accept={IMPORT_FILE_ACCEPT}
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        void handleFile(event.target.files?.[0]);
        event.target.value = '';
      }}
    />
  );

  const errorLine = error ? (
    <p role="alert" className="mt-3 text-sm text-status-danger">
      {error}
    </p>
  ) : null;

  const header = (title: string, back?: Step) => (
    <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
      <h2 className="text-base font-semibold text-content-primary">{title}</h2>
      <div className="flex items-center gap-1">
        {back ? (
          <button
            type="button"
            onClick={() => {
              setError('');
              setStep(back);
            }}
            className="motion-focus rounded-full px-3 py-1 text-xs font-semibold text-content-secondary hover:bg-bg-hover"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="motion-focus grid h-8 w-8 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  let body: React.ReactNode;

  if (step === 'choose') {
    body = (
      <>
        {header('Bring your notes')}
        <div className="space-y-2 px-4 pb-4">
          <p className="pb-1 text-sm text-content-secondary">Drop in what you already have. We sort it.</p>
          <button type="button" className={tile} onClick={() => setStep('whatsapp')}>
            <MessageCircle className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-content-primary">A WhatsApp chat</span>
              <span className="block text-xs text-content-tertiary">Your team group or a chat with yourself</span>
            </span>
          </button>
          <button type="button" className={tile} onClick={() => setStep('paste')}>
            <ClipboardList className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <span className="text-sm font-semibold text-content-primary">Paste text</span>
          </button>
          <button type="button" className={tile} onClick={() => fileInput.current?.click()}>
            <FileText className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-content-primary">A file</span>
              <span className="block text-xs text-content-tertiary">Word, text or a WhatsApp zip</span>
            </span>
          </button>
          <p className="pt-1 text-xs text-content-tertiary">Photos and voice notes are coming next.</p>
          {isReading ? (
            <p className="flex items-center gap-2 text-sm text-content-secondary">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Reading...
            </p>
          ) : null}
          {errorLine}
        </div>
      </>
    );
  } else if (step === 'whatsapp') {
    body = (
      <>
        {header('Three taps in WhatsApp', 'choose')}
        <div className="space-y-2 px-4 pb-4">
          {[
            'Open the chat you want to bring in',
            <>Tap the three dots, then <b>More</b>, then <b>Export chat</b></>,
            <>Choose <b>Without media</b>, then pick <b>Urganize</b> or save the file</>,
          ].map((line, index) => (
            <div key={index} className="flex items-start gap-3 rounded-xl border border-stroke-default bg-bg-surface px-3 py-2.5">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-brand text-[11px] font-bold text-content-inverse">
                {index + 1}
              </span>
              <span className="text-sm text-content-primary">{line}</span>
            </div>
          ))}
          <button type="button" className={primaryButton} onClick={() => fileInput.current?.click()} disabled={isReading}>
            {isReading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Choose the exported file
          </button>
          <p className="text-xs text-content-tertiary">
            Have voice notes? Send them in a later step. For now, text only. iPhone gives a zip and that works too.
          </p>
          <p className="flex items-start gap-1.5 text-xs text-content-tertiary">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            The chat is read on your phone. Only the notes you keep are saved, and only you can see them.
          </p>
          {errorLine}
        </div>
      </>
    );
  } else if (step === 'paste') {
    body = (
      <>
        {header('Paste text', 'choose')}
        <div className="space-y-3 px-4 pb-4">
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={9}
            placeholder={'Lagos rain, we dey move\nAjegunle to the island\n\nSend the master to Tobi by 8 Nov'}
            className="w-full resize-none rounded-xl border border-stroke-control bg-bg-surface p-3 text-lg text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
            data-autofocus
          />
          <button
            type="button"
            className={primaryButton}
            disabled={!pasted.trim()}
            onClick={() => {
              trackEvent('notes_import_started', { payload: { from: 'paste' } });
              process(pasted, 'paste');
            }}
          >
            Sort it
          </button>
          {errorLine}
        </div>
      </>
    );
  } else if (step === 'review' && preview) {
    const isChat = preview.source === 'whatsapp';
    body = (
      <>
        {header(isChat ? 'Here is what was hiding in there' : 'Here is what we found', 'choose')}
        <div className="space-y-3 px-4 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {counts.songs > 0 ? <Pill>{counts.songs} {counts.songs === 1 ? 'song' : 'songs'}</Pill> : null}
            {counts.todos > 0 ? <Pill>{counts.todos} to do</Pill> : null}
            {counts.dates > 0 ? <Pill>{counts.dates} {counts.dates === 1 ? 'date' : 'dates'}</Pill> : null}
            {counts.moneyTotalNaira > 0 ? <Pill>{naira(counts.moneyTotalNaira)} mentioned</Pill> : null}
            <Pill>{counts.total} in all</Pill>
          </div>

          {isChat && preview.authors.length > 1 ? (
            <div>
              <p className={`${eyebrow} pb-1.5`}>Keep messages from</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.authors.map((author) => {
                  const on = !hiddenAuthors.has(author.name);
                  return (
                    <button
                      key={author.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAuthor(author.name)}
                      className={`motion-focus inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                        on ? 'border-brand bg-brand/15 text-content-primary' : 'border-stroke-default text-content-tertiary'
                      }`}
                    >
                      {on ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                      {author.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {preview.truncated ? (
            <p className="text-xs text-content-tertiary">That was a long one. Showing the 400 most recent. Bring the rest in a second go.</p>
          ) : null}
          {isChat && preview.mediaSkipped > 0 ? (
            <p className="text-xs text-content-tertiary">{preview.mediaSkipped} photos and voice notes were skipped.</p>
          ) : null}

          <ul className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
            {visibleItems.map((item) => {
              const on = !unticked.has(item.id);
              const releaseId = effectiveRelease(item);
              return (
                <li key={item.id} className="rounded-xl border border-stroke-default bg-bg-surface p-2.5">
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={on ? 'Keep this note' : 'Skip this note'}
                      onClick={() => toggleItem(item.id)}
                      className={`motion-focus mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                        on ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-strong'
                      }`}
                    >
                      {on ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={eyebrow}>
                        {KIND_LABEL[item.kind]}
                        {item.author ? ` · ${item.author}` : ''}
                        {item.at ? ` · ${dayFormat.format(new Date(item.at))}` : ''}
                      </p>
                      <p className={`mt-0.5 whitespace-pre-line break-words text-sm text-content-primary ${on ? '' : 'opacity-50'} line-clamp-4`}>
                        {item.text}
                      </p>
                      {item.candidateReleaseIds.length > 0 && !releaseChoice.has(item.id) ? (
                        <label className="mt-1.5 block text-xs text-content-secondary">
                          Which rollout?{' '}
                          <select
                            defaultValue=""
                            onChange={(event) =>
                              setReleaseChoice((current) => new Map(current).set(item.id, event.target.value || null))
                            }
                            className="rounded-md border border-stroke-control bg-bg-surface px-1.5 py-0.5 text-xs"
                          >
                            <option value="">None</option>
                            {item.candidateReleaseIds.map((id) => (
                              <option key={id} value={id}>
                                {releaseTitle.get(id) || 'Rollout'}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {releaseId ? (
                        <button
                          type="button"
                          onClick={() => setReleaseChoice((current) => new Map(current).set(item.id, null))}
                          title="Keep this one loose instead"
                          className="motion-focus mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] text-content-primary"
                        >
                          {releaseTitle.get(releaseId) || 'Rollout'}
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <button type="button" className={primaryButton} disabled={isSaving || keptItems.length === 0} onClick={() => void handleSave()}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Keep {keptItems.length} {keptItems.length === 1 ? 'note' : 'notes'}
          </button>
          <p className="flex items-start gap-1.5 text-xs text-content-tertiary">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Only you can see these. Nothing reaches your team unless you share it.
          </p>
          {errorLine}
        </div>
      </>
    );
  } else if (step === 'done' && saved) {
    const attached = saved.items.filter((item) => effectiveRelease(item)).length;
    body = (
      <>
        {header('Kept')}
        <div className="space-y-3 px-4 pb-4">
          <p className="text-sm text-content-primary">
            {saved.count} {saved.count === 1 ? 'note is' : 'notes are'} in your notebook
            {attached > 0 ? `, ${attached} attached to a rollout` : ''}.
          </p>
          {plan ? (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                trackEvent('notes_import_to_plan', { payload: { notes: saved.count } });
                onClose();
                onMakePlan?.(plan);
              }}
            >
              Turn it into a plan
            </button>
          ) : null}
          <button type="button" className={plan ? quietButton : primaryButton} onClick={onClose}>
            Done
          </button>
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={isSaving}
            className="motion-focus block w-full py-1 text-center text-xs font-semibold text-content-tertiary hover:text-content-primary"
          >
            Undo this import
          </button>
          {errorLine}
        </div>
      </>
    );
  } else {
    body = null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <DialogPanel
        label="Bring your notes"
        onClose={onClose}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-stroke-default bg-bg-elevated sm:max-w-md sm:rounded-2xl"
      >
        {body}
        {filePicker}
      </DialogPanel>
    </div>,
    document.body
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-stroke-default px-2.5 py-1 text-xs text-content-primary">
      {children}
    </span>
  );
}
