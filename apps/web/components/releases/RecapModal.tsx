'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, Share2, Sparkles, X } from 'lucide-react';
import { Button, IconButton } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { isNativePlatform } from '@/lib/platform';
import { shareOrDownloadImage } from '@/lib/share-file';
import type { ReleaseRecap } from '@/types/recap';

// The release recap card: a shareable poster for a finished release.
//
// Modal shell copied from StatusUpdateModal (the sibling generate-and-show
// surface): same z tier, same scrim, no portal and no Escape handler, since the
// app's modal tier owns that convention.
//
// Four steps rather than one screen, because the optional input has to come
// BEFORE the render: it is baked into the PNG.

const HIGHLIGHT_MAX_CHARS = 140;

type Step = 'loading' | 'form' | 'generating' | 'preview';
type PreviewSize = 'story' | 'square';

// Mounted only while open (see WorkspaceView), so every open starts from these
// initial values. That matters here in a way it does not for the sibling
// modals: the preview holds short-lived signed URLs, and reopening hours later
// must not show a link that has since expired.
type RecapModalProps = {
  releaseId: string;
  releaseTitle: string;
  onClose: () => void;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function fileNameFor(title: string, size: PreviewSize): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'release';
  return `${slug}-recap-${size}.png`;
}

export function RecapModal({ releaseId, releaseTitle, onClose, onToast }: RecapModalProps) {
  const [step, setStep] = useState<Step>('loading');
  const [recap, setRecap] = useState<ReleaseRecap | null>(null);
  const [highlightInput, setHighlightInput] = useState('');
  const [previewSize, setPreviewSize] = useState<PreviewSize>('story');
  const [isSharing, setIsSharing] = useState(false);

  // No setStep('loading') here: the component mounts fresh per open, so that is
  // already the state, and setting it synchronously from the effect below would
  // be a cascading render for no gain.
  const loadExisting = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/releases/${releaseId}/recap`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('load failed');

      const payload = (await response.json()) as { recap: ReleaseRecap | null };
      const existing = payload.recap;

      if (existing?.storyImageUrl) {
        setRecap(existing);
        setHighlightInput(existing.highlight ?? '');
        setStep('preview');
        return;
      }
      setStep('form');
    } catch {
      // A failed lookup is not fatal: the user can still generate a fresh card.
      setStep('form');
    }
  }, [releaseId]);

  // One read per open, for a fresh signed URL every time.
  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const generate = async () => {
    setStep('generating');
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/releases/${releaseId}/recap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          highlight: highlightInput.trim() === '' ? null : highlightInput.trim(),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        recap?: ReleaseRecap;
        error?: string;
      };

      if (!response.ok || !payload.recap) {
        throw new Error(payload.error || 'Could not build the recap. Try again.');
      }

      setRecap(payload.recap);
      setPreviewSize('story');
      setStep('preview');
    } catch (error) {
      setStep('form');
      onToast?.(
        error instanceof Error ? error.message : 'Could not build the recap. Try again.',
        'error'
      );
    }
  };

  const handleShare = async () => {
    const url = previewSize === 'story' ? recap?.storyImageUrl : recap?.squareImageUrl;
    if (!url) return;

    setIsSharing(true);
    try {
      const outcome = await shareOrDownloadImage({
        url,
        fileName: fileNameFor(releaseTitle, previewSize),
        title: `${releaseTitle} recap`,
      });
      if (outcome === 'downloaded') onToast?.('Recap saved.', 'success');
      if (outcome === 'opened') onToast?.('Opened your recap. Press and hold to save it.', 'success');
    } catch {
      onToast?.('Could not save the recap. Try again.', 'error');
    } finally {
      setIsSharing(false);
    }
  };

  const previewUrl = previewSize === 'story' ? recap?.storyImageUrl : recap?.squareImageUrl;
  const native = isNativePlatform();

  return (
    <div
      className="fixed inset-0 z-[220] overflow-y-auto bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8"
      role="presentation"
    >
      <button type="button" aria-label="Close recap modal" className="fixed inset-0" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-recap-title"
        className="relative mx-auto flex min-h-full w-full max-w-xl items-center"
      >
        <div className="relative w-full border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))]">
          <div className="flex items-start justify-between gap-4 border-b border-stroke-subtle p-4 sm:p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                <Sparkles className="h-3.5 w-3.5" />
                Release recap
              </p>
              <h2
                id="release-recap-title"
                className="mt-2 font-display text-2xl font-semibold text-content-primary"
              >
                {releaseTitle}
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-content-secondary">
                A card you can post anywhere, built from the work your team just finished.
              </p>
            </div>
            <IconButton
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="shrink-0 border-stroke-default bg-[rgb(var(--color-stroke)/0.02)]"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="p-4 sm:p-5">
            {step === 'loading' ? (
              <div className="flex items-center gap-3 border border-stroke-default bg-bg-elevated/50 p-5 text-sm text-content-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : null}

            {step === 'form' ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm leading-6 text-content-secondary">
                  One optional extra. Leave it blank if you like, the card works without it.
                </p>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                    One highlight
                  </span>
                  <input
                    type="text"
                    value={highlightInput}
                    maxLength={HIGHLIGHT_MAX_CHARS}
                    onChange={(event) => setHighlightInput(event.target.value)}
                    placeholder="Sold out the release show"
                    className="h-11 border border-stroke-default bg-bg-elevated/50 px-3 text-sm text-content-primary outline-none transition-colors placeholder:text-content-tertiary focus:border-brand"
                  />
                  <span className="text-xs text-content-tertiary">
                    {highlightInput.length}/{HIGHLIGHT_MAX_CHARS}
                  </span>
                </label>
              </div>
            ) : null}

            {step === 'generating' ? (
              <div className="flex items-center gap-3 border border-stroke-default bg-bg-elevated/50 p-5 text-sm text-content-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building your recap. This takes a few seconds.
              </div>
            ) : null}

            {step === 'preview' ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2" role="group" aria-label="Card size">
                  {(['story', 'square'] as PreviewSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setPreviewSize(size)}
                      aria-pressed={previewSize === size}
                      className={`motion-focus motion-press inline-flex h-8 items-center px-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                        previewSize === size
                          ? 'border border-brand bg-brand/10 text-content-primary'
                          : 'border border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                      }`}
                    >
                      {size === 'story' ? 'Story' : 'Square'}
                    </button>
                  ))}
                </div>

                {previewUrl ? (
                  // Plain img, not next/image: these are short-lived signed URLs
                  // and the optimizer would cache past their expiry.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt={`${releaseTitle} recap card, ${previewSize} size`}
                    className="mx-auto max-h-[58vh] w-auto border border-stroke-default"
                  />
                ) : (
                  <div className="border border-stroke-default bg-bg-elevated/50 p-5 text-sm text-content-secondary">
                    That card is not available. Generate it again.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-stroke-subtle p-4 sm:flex-row sm:justify-between sm:p-5">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>

            <div className="flex gap-2">
              {step === 'preview' ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep('form')}
                    leftIcon={<RefreshCw className="h-4 w-4" />}
                  >
                    Regenerate
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleShare()}
                    disabled={!previewUrl || isSharing}
                    leftIcon={
                      native ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />
                    }
                  >
                    {native ? 'Share' : 'Download'}
                  </Button>
                </>
              ) : null}

              {step === 'form' || step === 'generating' ? (
                <Button
                  type="button"
                  onClick={() => void generate()}
                  disabled={step === 'generating'}
                  leftIcon={<Sparkles className="h-4 w-4" />}
                >
                  {step === 'generating' ? 'Building…' : 'Generate recap'}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
