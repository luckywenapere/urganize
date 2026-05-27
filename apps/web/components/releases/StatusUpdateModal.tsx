'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button, IconButton } from '@urganize/ui';

type StatusUpdateModalProps = {
  open: boolean;
  isGenerating: boolean;
  statusUpdate: string;
  onClose: () => void;
  onRegenerate: () => void;
};

export function StatusUpdateModal({
  open,
  isGenerating,
  statusUpdate,
  onClose,
  onRegenerate,
}: StatusUpdateModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(statusUpdate);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can fail on insecure origins / denied permission. The text
      // is visible and selectable in the modal, so this is a soft failure.
    }
  };

  return (
    <div className="fixed inset-0 z-[220] overflow-y-auto bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8" role="presentation">
      <button
        type="button"
        aria-label="Close status update modal"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-update-title"
        className="relative mx-auto flex min-h-full w-full max-w-xl items-center"
      >
        <div className="relative w-full border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgba(0,0,0,0.76)]">
          <div className="flex items-start justify-between gap-4 border-b border-stroke-subtle p-4 sm:p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                <Sparkles className="h-3.5 w-3.5" />
                AI status update
              </p>
              <h2 id="status-update-title" className="mt-2 font-display text-2xl font-semibold text-content-primary">
                Status update
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-content-secondary">
                A short paragraph you can send to the artist or label. Copy what you want — nothing is saved.
              </p>
            </div>
            <IconButton
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="shrink-0 border-stroke-default bg-white/[0.02]"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="p-4 sm:p-5">
            {isGenerating ? (
              <div className="flex items-center gap-3 border border-stroke-default bg-bg-elevated/50 p-5 text-sm text-content-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </div>
            ) : (
              <div className="border border-stroke-default bg-bg-elevated/50 p-4 text-sm leading-7 text-content-primary">
                {statusUpdate}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-stroke-subtle p-4 sm:flex-row sm:justify-between sm:p-5">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onRegenerate}
                disabled={isGenerating}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                Generate again
              </Button>
              <Button
                type="button"
                onClick={() => void handleCopy()}
                disabled={isGenerating || !statusUpdate}
                leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              >
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
