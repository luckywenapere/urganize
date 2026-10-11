'use client';

import { useEffect, useState } from 'react';
import type { VoiceCallState } from '@/lib/urgans-voice-realtime';

/**
 * The orb at the centre of the voice sheet. Its shape says what the call is
 * doing: a soft pulse to the mic while listening, a slow spin while thinking,
 * ripples to the voice while speaking, a small chip while UrgAns acts.
 *
 * With reduced motion it is a static level bar instead: the same information
 * (who is talking and how loud), no movement beyond the bar's length.
 */
export function VoiceOrb({ state, level }: { state: VoiceCallState; level: number }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const clamped = Math.max(0, Math.min(1, level));

  if (reduced) {
    return (
      <div className="flex h-40 w-full max-w-[240px] flex-col items-center justify-center gap-3" aria-hidden="true">
        <div className="h-3 w-full overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${state === 'thinking' || state === 'acting' ? 50 : Math.round(8 + clamped * 92)}%` }}
          />
        </div>
      </div>
    );
  }

  if (state === 'acting') {
    return (
      <div className="flex h-40 items-center justify-center" aria-hidden="true">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
      </div>
    );
  }

  const listening = state === 'listening' || state === 'user_speaking' || state === 'confirming';
  const speaking = state === 'speaking';
  const scale = listening || speaking ? 1 + clamped * 0.35 : 1;

  return (
    <div className="relative flex h-40 w-40 items-center justify-center" aria-hidden="true">
      {speaking ? (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-brand/15" />
          <span className="absolute inset-4 animate-ping rounded-full bg-brand/20 [animation-delay:300ms]" />
        </>
      ) : null}
      <div
        className={`h-28 w-28 rounded-full bg-gradient-to-br from-brand to-brand/60 shadow-lg transition-transform duration-100 ${
          state === 'thinking' || state === 'connecting' || state === 'reconnecting' ? 'animate-spin [animation-duration:3s]' : ''
        }`}
        style={{ transform: `scale(${scale.toFixed(3)})` }}
      />
    </div>
  );
}
