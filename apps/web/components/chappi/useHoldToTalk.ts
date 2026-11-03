'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { VoiceInputValue } from '@/components/chappi/useVoiceInput';
import { HOLD_DELAY_MS, slidToCancel } from '@/lib/hold-to-talk';

/**
 * Hold the mic to talk, let go to send, slide left to cancel (2026-11-02,
 * founder approved docs/mocks/hold-to-talk). Phone only: on a computer, or
 * with `enabled` false, the mic is the old tap to start, tap to stop.
 *
 * A short tap still toggles dictation (the words land in the box). A hold
 * starts recording; letting go stops it and `shouldSend()` answers true for
 * the transcript that follows, so the caller sends it instead of only filling
 * the box. A release before the browser has started recording (the mic
 * permission prompt, a slow start) is remembered and applied once it has.
 */
export function useHoldToTalk(voice: VoiceInputValue, enabled: boolean) {
  const [holding, setHolding] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const timerRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const startXRef = useRef(0);
  const cancelRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pendingRef = useRef<'send' | 'cancel' | null>(null);
  const sendNextRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const finish = useCallback(
    (how: 'send' | 'cancel') => {
      holdingRef.current = false;
      setHolding(false);
      setCancelArmed(false);
      if (voice.state === 'recording') {
        if (how === 'send') {
          sendNextRef.current = true;
          voice.stop();
        } else {
          voice.cancel();
        }
      } else {
        // Still asking for the mic: apply it once recording starts.
        pendingRef.current = how;
      }
    },
    [voice]
  );

  useEffect(() => {
    if (voice.state === 'recording' && pendingRef.current) {
      const how = pendingRef.current;
      pendingRef.current = null;
      if (how === 'send') {
        sendNextRef.current = true;
        voice.stop();
      } else {
        voice.cancel();
      }
    }
    if (voice.state === 'idle' && pendingRef.current) pendingRef.current = null;
  }, [voice]);

  useEffect(() => clearTimer, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!enabled || voice.state !== 'idle' || event.button !== 0) return;
    startXRef.current = event.clientX;
    cancelRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      holdingRef.current = true;
      suppressClickRef.current = true;
      setHolding(true);
      navigator.vibrate?.(10);
      voice.start();
    }, HOLD_DELAY_MS);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety: without it a slide off the button still ends on pointerup elsewhere.
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!holdingRef.current) return;
    const armed = slidToCancel(startXRef.current, event.clientX);
    if (armed !== cancelRef.current) {
      cancelRef.current = armed;
      setCancelArmed(armed);
    }
  };

  const onPointerUp = () => {
    clearTimer();
    if (holdingRef.current) finish(cancelRef.current ? 'cancel' : 'send');
  };

  const onPointerCancel = () => {
    clearTimer();
    if (holdingRef.current) finish('cancel');
  };

  /** The mic's click: a tap toggles, the click that ends a hold is ignored. */
  const onClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    voice.toggle();
  };

  /** Read once by the transcript handler: was this clip a hold to send? */
  const shouldSend = useCallback(() => {
    const send = sendNextRef.current;
    sendNextRef.current = false;
    return send;
  }, []);

  return {
    holding,
    cancelArmed,
    shouldSend,
    buttonProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClick,
      // A long press must not open the phone's own menu or select text.
      onContextMenu: (event: { preventDefault: () => void }) => {
        if (enabled) event.preventDefault();
      },
      style: enabled
        ? ({ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as const)
        : undefined,
    },
  };
}
