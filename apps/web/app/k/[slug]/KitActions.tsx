'use client';

import { useEffect, useRef, useState } from 'react';
import { createZip, uniqueZipNames } from '@/lib/zip-store';

/**
 * The two small interactive pieces of the public press kit. Everything else on
 * that page is server markup; these are the only things a reader presses.
 *
 * Both degrade cleanly: with no scripting the copy buttons simply are not
 * there (the text is on the page to select), and the photo links beside the
 * download button still hand over each file.
 */

const ACCENT = 'var(--kit-accent)';
const CREAM = 'var(--kit-text)';
const FAINT = 'var(--kit-text-faint)';
const FILL = 'var(--kit-fill)';

/** Total size we are willing to hold in a visitor's browser memory. */
const MAX_BUNDLE_BYTES = 150 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45_000;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function onClick() {
    const ok = await copyToClipboard(text);
    setState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="kit-print-hide motion-focus inline-flex min-h-[32px] items-center rounded-md px-2 font-mono text-[11px] uppercase tracking-[0.12em] underline-offset-4 hover:underline"
      style={{ color: state === 'failed' ? CREAM : ACCENT }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press and hold to copy' : label}
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
}

type KitPhoto = { url: string; fileName: string };

async function fetchBytes(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('bad status');
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

function save(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export function DownloadKitButton({
  artistSlug,
  textFile,
  photos,
}: {
  artistSlug: string;
  textFile: string;
  photos: KitPhoto[];
}) {
  const [phase, setPhase] = useState<
    { kind: 'idle' } | { kind: 'working'; done: number; total: number } | { kind: 'error' } | { kind: 'done' }
  >({ kind: 'idle' });
  const busy = useRef(false);

  async function onClick() {
    if (busy.current) return;
    busy.current = true;
    const encoder = new TextEncoder();
    const textEntry = { name: 'press-kit.txt', data: encoder.encode(textFile) };

    try {
      if (photos.length === 0) {
        save(new Blob([textFile], { type: 'text/plain;charset=utf-8' }), `${artistSlug}-press-kit.txt`);
        setPhase({ kind: 'done' });
        return;
      }

      const names = uniqueZipNames(photos.map((photo) => photo.fileName));
      const files: { name: string; data: Uint8Array }[] = [];
      let total = 0;
      setPhase({ kind: 'working', done: 0, total: photos.length });

      for (let index = 0; index < photos.length; index += 1) {
        const data = await fetchBytes(photos[index].url);
        total += data.length;
        if (total > MAX_BUNDLE_BYTES) throw new Error('too big');
        files.push({ name: names[index], data });
        setPhase({ kind: 'working', done: index + 1, total: photos.length });
      }

      const zip = createZip([textEntry, ...files.map((file) => ({ ...file }))]);
      save(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }), `${artistSlug}-press-kit.zip`);
      setPhase({ kind: 'done' });
    } catch {
      // Whatever went wrong, the words still download, so the reader leaves
      // with something and a plain way to get each photo.
      try {
        save(new Blob([textFile], { type: 'text/plain;charset=utf-8' }), `${artistSlug}-press-kit.txt`);
      } catch {
        /* nothing more to do */
      }
      setPhase({ kind: 'error' });
    } finally {
      busy.current = false;
    }
  }

  const working = phase.kind === 'working';

  return (
    <div className="kit-print-hide">
      <button
        type="button"
        onClick={onClick}
        disabled={working}
        aria-busy={working}
        className="motion-focus inline-flex min-h-[44px] items-center rounded-full border px-5 text-sm disabled:opacity-70"
        style={{ borderColor: 'var(--kit-border)', color: CREAM }}
      >
        {working
          ? `Preparing ${phase.done} of ${phase.total}`
          : photos.length > 0
            ? 'Download the kit'
            : 'Download the text'}
      </button>
      <p className="mt-2 min-h-[1rem] text-xs" role="status" aria-live="polite" style={{ color: FAINT }}>
        {phase.kind === 'error'
          ? 'We could not bundle the photos. The text saved, and each photo has its own download link below.'
          : phase.kind === 'done'
            ? 'Saved.'
            : ''}
      </p>
    </div>
  );
}

export function EmailButton({ email, artistName }: { email: string; artistName: string }) {
  return (
    <a
      href={`mailto:${email}?subject=${encodeURIComponent(`${artistName}: press`)}`}
      className="kit-print-hide motion-focus inline-flex min-h-[44px] items-center rounded-full px-5 text-sm"
      style={{ backgroundColor: FILL, color: CREAM }}
    >
      Email the team
    </a>
  );
}
