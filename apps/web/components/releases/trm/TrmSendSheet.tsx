'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AudioWaveform, Check, Loader2, X } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { TRM_AUDIO_MAX_BYTES, TRM_TERMS_URL, formatShortDay } from '@/lib/trm/release';
import { useIsSmUp } from '../HandoffSheet';
import { MONO, PRIMARY, OUTLINE, Ring, Tick } from './TrmParts';
import type { TrmPost } from './useTrm';

// The one sheet the send happens in (URG-392 mocks 4a/4b): confirm the three
// facts that matter, add the master, agree to TRM's terms, send. Then the four
// steps, with no close button while it runs. The master goes from this browser
// straight to TRM's storage (a presigned PUT); Urganize never holds it.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isWav = (file: File) => /\.wav$/i.test(file.name) || /audio\/(x-)?wav|audio\/wave|audio\/vnd\.wave/i.test(file.type);
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export type StepKey = 'draft' | 'artwork' | 'master' | 'submit';
const STEP_LABELS: Record<StepKey, [string, string]> = {
  draft: ['Creating the draft', 'Draft created'],
  artwork: ['Uploading cover art', 'Cover art uploaded'],
  master: ['Uploading the master', 'Master uploaded'],
  submit: ['Submit to TRM', 'Submitted'],
};
const STEPS: StepKey[] = ['draft', 'artwork', 'master', 'submit'];

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (sent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The master upload failed.')));
    xhr.onerror = () => reject(new Error('The master upload failed. Check your connection.'));
    xhr.send(file);
  });
}

export function TrmShell({ label, onClose, locked, children }: { label: string; onClose: () => void; locked: boolean; children: ReactNode }) {
  const smUp = useIsSmUp();
  const close = locked ? () => undefined : onClose;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[170]">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="absolute inset-0 cursor-default bg-black/60" />
      {smUp ? (
        <div className="absolute left-1/2 top-[12vh] w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2">
          <DialogPanel label={label} onClose={close} className="relative max-h-[80vh] overflow-y-auto border border-stroke-strong bg-bg-elevated p-[30px] shadow-2xl">
            {!locked ? (
              <button type="button" onClick={onClose} aria-label="Close" className="motion-focus absolute right-5 top-5 text-content-secondary hover:text-content-primary">
                <X className="h-[18px] w-[18px]" />
              </button>
            ) : null}
            {children}
          </DialogPanel>
        </div>
      ) : (
        <DialogPanel
          label={label}
          onClose={close}
          className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain border-t border-stroke-strong bg-bg-elevated px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-3"
        >
          <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-stroke-strong" aria-hidden="true" />
          {children}
        </DialogPanel>
      )}
    </div>,
    document.body
  );
}

export function TrmSendSheet({
  title,
  artist,
  releaseDate,
  initialEmail,
  resend = false,
  post,
  onClose,
  onDone,
}: {
  title: string;
  artist: string;
  releaseDate: string | null;
  initialEmail: string | null;
  /** After a rejection: the master is already at TRM unless they add a new one. */
  resend?: boolean;
  post: TrmPost;
  onClose: () => void;
  /** Called when the sheet ends (sent, or TRM has no account for the artist). */
  onDone: () => void;
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [fileError, setFileError] = useState('');
  const [phase, setPhase] = useState<'form' | 'sending'>('form');
  const [done, setDone] = useState<StepKey[]>([]);
  const [active, setActive] = useState<StepKey | null>(null);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const started = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (phase !== 'sending') return;
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const pick = (next: File | null) => {
    setFileError('');
    if (!next) return;
    if (!isWav(next)) return setFileError('The master has to be a WAV.');
    if (next.size > TRM_AUDIO_MAX_BYTES) return setFileError('TRM takes masters up to 150 MB.');
    setFile(next);
  };

  const canSend = EMAIL.test(email.trim()) && agreed && (Boolean(file) || resend);

  const finish = (key: StepKey) => setDone((list) => (list.includes(key) ? list : [...list, key]));

  const run = async () => {
    setError('');
    setPhase('sending');
    started.current = Date.now();
    try {
      if (!done.includes('draft') || !done.includes('artwork')) {
        setActive('draft');
        const prepared = await post('prepare', { artistEmail: email.trim(), termsAccepted: true });
        if (!prepared.ok) {
          if (prepared.data.code === 'artist_not_found') {
            onDone();
            return;
          }
          throw new Error(String(prepared.data.error || 'TRM did not answer. Try again.'));
        }
        finish('draft');
        finish('artwork');
      }
      if (file && !done.includes('master')) {
        setActive('master');
        const hash = await sha256Hex(file);
        const presign = await post('presign_master', {
          fileName: file.name,
          mimeType: file.type || 'audio/wav',
          sizeBytes: file.size,
          sha256: hash,
        });
        if (!presign.ok) throw new Error(String(presign.data.error || 'TRM did not answer. Try again.'));
        await putWithProgress(String(presign.data.url), (presign.data.headers as Record<string, string>) ?? {}, file, setSent);
        const completed = await post('complete_master', { assetId: presign.data.assetId, fileName: file.name });
        if (!completed.ok) throw new Error(String(completed.data.error || 'TRM could not check the master. Try again.'));
      }
      finish('master');
      setActive('submit');
      const submitted = await post('submit');
      if (!submitted.ok) throw new Error(String(submitted.data.error || 'TRM did not answer. Try again.'));
      finish('submit');
      setActive(null);
      onDone();
    } catch (cause) {
      setActive(null);
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Try again.');
    }
  };

  const label = `Send ${title} to TRM`;

  if (phase === 'sending') {
    return (
      <TrmShell label={label} onClose={onClose} locked={!error}>
        <TrmSendingView done={done} active={active} sent={sent} total={file?.size ?? 0} elapsed={elapsed} error={error} onRetry={() => void run()} onClose={onClose} />
      </TrmShell>
    );
  }

  return (
    <TrmShell label={label} onClose={onClose} locked={false}>
      <h3 className="pr-8 font-display text-[26px] leading-tight tracking-[-0.02em] text-content-primary">{label}</h3>
      <p className={`mt-2 ${MONO}`}>{artist} · Single</p>

      <div className="mt-5 space-y-2.5">
        <div className="flex h-[46px] items-center justify-between gap-3 border border-stroke-strong px-3.5 text-[15px]">
          <span className="text-content-secondary">Release date</span>
          <span className="text-content-primary">{formatShortDay(releaseDate)}</span>
        </div>
        <div className="flex h-[46px] items-center justify-between gap-3 border border-stroke-strong px-3.5 text-[15px]">
          <span className="text-content-secondary">Stores</span>
          <span className="text-content-primary">All stores</span>
        </div>
        <label className="flex h-[46px] items-center justify-between gap-3 border border-stroke-control px-3.5 text-[15px] focus-within:border-content-secondary">
          <span className="shrink-0 text-content-secondary">Artist’s TRM email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@email.com"
            className="min-w-0 flex-1 bg-transparent text-right text-content-primary placeholder:text-content-tertiary focus:outline-none"
          />
        </label>
      </div>

      <p className="mt-2 font-mono text-[11px] text-content-secondary">Uses the artist’s TRM plan</p>

      <div className="mt-4 flex items-center gap-3.5 border border-dashed border-stroke-strong p-4 sm:p-[18px]">
        <AudioWaveform className="h-5 w-5 shrink-0 text-content-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-content-primary">
            {file ? file.name : resend ? 'Master is with TRM' : 'Add the master'}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-content-secondary">
            {file ? `${mb(file.size)} · goes straight to TRM` : resend ? 'Add a new one only if TRM asked' : 'WAV · up to 150 MB · goes straight to TRM'}
          </p>
        </div>
        <button type="button" onClick={() => fileInput.current?.click()} className="motion-focus motion-press inline-flex h-9 shrink-0 items-center border border-stroke-strong px-3.5 text-[13.5px] font-semibold text-content-primary hover:bg-bg-hover">
          {file ? 'Change' : 'Choose file'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".wav,audio/wav,audio/x-wav,audio/wave"
          className="hidden"
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
        />
      </div>
      {fileError ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {fileError}
        </p>
      ) : null}

      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-content-secondary">
        <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="peer absolute inset-0 cursor-pointer opacity-0" />
          <span aria-hidden="true" className={`flex h-[18px] w-[18px] items-center justify-center border-[1.5px] ${agreed ? 'border-brand bg-brand' : 'border-stroke-strong'} peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40`}>
            {agreed ? <Check className="h-3 w-3 text-content-inverse" strokeWidth={3} /> : null}
          </span>
        </span>
        <span>
          I agree to TRM’s{' '}
          <a href={TRM_TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-[3px] hover:text-content-primary">
            terms
          </a>
        </span>
      </label>

      <button type="button" disabled={!canSend} onClick={() => void run()} className={`mt-5 ${PRIMARY} sm:w-full`}>
        {resend ? 'Resend to TRM' : 'Send to TRM'}
      </button>
    </TrmShell>
  );
}

/** The four steps while a send runs (mock 4b). Presentational, so it can be
 *  rendered on its own. */
export function TrmSendingView({
  done,
  active,
  sent,
  total,
  elapsed,
  error,
  onRetry,
  onClose,
}: {
  done: StepKey[];
  active: StepKey | null;
  sent: number;
  total: number;
  elapsed: number;
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const minutesLeft = total > 0 && sent > 0 && sent < total ? Math.max(1, Math.round(((total - sent) / Math.max(1, sent / Math.max(1, elapsed))) / 60)) : null;
  return (
    <>
        <h3 className="pr-8 font-display text-[26px] leading-tight tracking-[-0.02em] text-content-primary">
          {error ? 'It stopped.' : 'Sending to TRM…'}
        </h3>
        <p className={`mt-2 ${MONO}`}>
          {error ? 'Nothing is lost · try again' : `Keep this page open${minutesLeft ? ` · about ${minutesLeft === 1 ? 'a minute' : `${minutesLeft} minutes`} left` : ''}`}
        </p>
        <ul className="mt-5 border border-stroke-default bg-bg-surface">
          {STEPS.map((key) => {
            const isDone = done.includes(key);
            const isActive = active === key;
            const meta =
              key === 'draft' && isDone
                ? ''
                : key === 'master' && isActive && total
                  ? `${Math.round(sent / (1024 * 1024))} of ${Math.round(total / (1024 * 1024))} MB`
                  : key === 'master' && isDone && total
                    ? mb(total)
                    : '';
            return (
              <li key={key} className="flex min-h-[58px] items-center gap-3.5 border-b border-stroke-default px-4 py-3 last:border-b-0">
                {isDone ? <Tick /> : isActive ? <Loader2 className="h-[22px] w-[22px] shrink-0 animate-spin text-brand" aria-hidden="true" /> : <Ring />}
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold ${isDone || isActive ? 'text-content-primary' : 'text-content-secondary'}`}>
                    {STEP_LABELS[key][isDone ? 1 : 0]}
                  </p>
                  {key === 'master' && isActive && total ? (
                    <div className="mt-2 h-1 w-full max-w-[260px] overflow-hidden bg-stroke-default" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={sent}>
                      <i className="block h-full bg-brand" style={{ width: `${Math.min(100, (sent / total) * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
                {meta ? <span className="shrink-0 font-mono text-[11.5px] text-content-secondary">{meta}</span> : null}
              </li>
            );
          })}
        </ul>
        {error ? (
          <>
            <p role="alert" className="mt-4 text-sm text-status-error">
              {error}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={onRetry} className={PRIMARY}>
                Try again
              </button>
              <button type="button" onClick={onClose} className={OUTLINE}>
                Close
              </button>
            </div>
          </>
        ) : (
          <button type="button" disabled className={`mt-5 ${OUTLINE} sm:w-full`}>
            Sending…
          </button>
        )}
    </>
  );
}
