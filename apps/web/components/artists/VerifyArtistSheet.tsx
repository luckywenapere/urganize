'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { PROVIDER_LABEL, VERIFICATION_PROVIDERS, type VerificationProvider } from '@/lib/artist-verification';
import { checkScreenshotFile, sendVerificationScreenshot } from '@/lib/artist-verification-client';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';

const DIALOG_Z = 'z-[220]';

const primaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:opacity-50';

// "After tapping Verify" (issue #1390, founder approved the mock): three short
// lines and a place to add the screenshot. The artist or the manager can send it.
export function VerifyArtistSheet({
  artistId,
  artistName,
  onClose,
}: {
  artistId: string;
  artistName: string;
  onClose: () => void;
}) {
  const loadRoster = useArtistRosterStore((state) => state.load);
  const [provider, setProvider] = useState<VerificationProvider>('spotify');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => lockBodyScroll(), []);

  const choose = (next: File | null) => {
    setError('');
    if (!next) return setFile(null);
    const problem = checkScreenshotFile(next);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile(next);
  };

  const send = async () => {
    if (!file || sending) return;
    setSending(true);
    setError('');
    try {
      await sendVerificationScreenshot(artistId, file, provider);
      setSent(true);
      void loadRoster({ force: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the screenshot. Try again.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div
      className={`fixed inset-x-0 top-0 ${DIALOG_Z} flex h-[100dvh] items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <DialogPanel
        label={`Verify ${artistName}`}
        onClose={onClose}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-stroke-default bg-bg-elevated p-6 pb-8 shadow-xl sm:rounded-2xl sm:p-8"
      >
        {sent ? (
          <>
            <h2 className="font-display text-2xl text-content-primary">We got it</h2>
            <p className="mt-3 text-sm leading-6 text-content-secondary">
              We are checking the screenshot for {artistName}. You will get an email when we have looked.
            </p>
            <div className="mt-6">
              <button type="button" onClick={onClose} className={primaryButton}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl text-content-primary">Verify {artistName}</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-content-secondary">
              <li>Open Spotify for Artists or Apple Music for Artists.</li>
              <li>Take a screenshot that shows {artistName} at the top.</li>
              <li>Send it here. We reply by email.</li>
            </ol>

            <div role="radiogroup" aria-label="Where the screenshot is from" className="mt-5 flex flex-wrap gap-2">
              {VERIFICATION_PROVIDERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={provider === id}
                  onClick={() => setProvider(id)}
                  className={`motion-press min-h-10 rounded-full border px-4 text-sm font-medium transition-colors ${
                    provider === id
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-stroke-default text-content-secondary hover:border-stroke-strong'
                  }`}
                >
                  {PROVIDER_LABEL[id]}
                </button>
              ))}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => choose(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-5 flex min-h-24 w-full items-center justify-center rounded-2xl border border-dashed border-stroke-strong px-4 text-center text-sm text-content-secondary transition-colors hover:border-brand"
            >
              {file ? file.name : 'Add the screenshot'}
            </button>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-status-error">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex items-center gap-3">
              <button type="button" onClick={() => void send()} disabled={!file || sending} className={primaryButton}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {sending ? 'Sending' : 'Send'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-medium text-content-secondary hover:text-content-primary"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </DialogPanel>
    </div>,
    document.body
  );
}
