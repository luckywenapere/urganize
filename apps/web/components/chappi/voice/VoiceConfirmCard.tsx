'use client';

import { AlertTriangle } from '@/components/icons';
import { Button } from '@urganize/ui';

/**
 * The confirmation, on screen, for anything the typed flow would ask about
 * (delete, invite, publish, a date change that moves tasks). UrgAns asks the
 * same question aloud; a spoken yes or a tap here both work, and fifteen seconds
 * of silence is a no. Nothing has run while this shows. Large tap targets: the
 * call is often on a phone in a hand.
 */
export function VoiceConfirmCard({
  title,
  detail,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label="Confirm this action" className="w-full max-w-md border border-status-warning/40 bg-bg-elevated p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold leading-snug text-content-primary">{title}</p>
          {detail ? <p className="mt-1.5 text-sm leading-6 text-content-secondary">{detail}</p> : null}
          <p className="mt-2 text-xs text-content-tertiary">Say yes or no, or tap.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} className="h-12">
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={onConfirm} disabled={busy} isLoading={busy} className="h-12">
          Confirm
        </Button>
      </div>
    </div>
  );
}
