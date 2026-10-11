'use client';

import { AudioWaveform } from '@/components/icons';
import { isChappiEnabled, isUrgansRealtimeEnabled } from '@/lib/chappi/config';

/** Read once: the flag is inlined at build time. */
export const TALK_ENABLED = isChappiEnabled() && isUrgansRealtimeEnabled();

/**
 * "Talk to UrgAns": opens a live voice call. A waveform, so it never reads as
 * the mic beside it, which is dictation (record, then type). Hidden entirely
 * when the flag is off or the browser cannot do a call.
 */
export function TalkButton({ onClick, disabled, size = 'md' }: { onClick: () => void; disabled?: boolean; size?: 'md' | 'lg' }) {
  if (!TALK_ENABLED) return null;
  if (typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia) return null;
  const box = size === 'lg' ? 'h-10 w-10' : 'h-9 w-9';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Talk to UrgAns"
      title="Talk to UrgAns"
      className={`motion-press grid ${box} shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-elevated hover:text-content-primary disabled:opacity-40`}
    >
      <AudioWaveform className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
