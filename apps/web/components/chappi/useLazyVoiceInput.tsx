'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { VoiceInputHints, VoiceInputValue } from '@/components/chappi/useVoiceInput';

// Dictation on demand (URG-314 batch 6, 2026-10-16). The composers on Home and
// in UrgAns used to call useVoiceInput directly, which put the recorder, the
// transcription client and lib/urgans-voice into their first load even while
// voice is switched off (it is, since the Oct 16 feature cuts). The real hook
// now runs inside VoiceInputDriver, a separate chunk that is only requested
// when `enabled` is true. With it off nothing loads and the value is exactly
// what useVoiceInput returned when disabled: not supported, idle, no error.
const VoiceInputDriver = dynamic(
  () => import('@/components/chappi/VoiceInputDriver').then((m) => m.VoiceInputDriver),
  { ssr: false }
);

const noop = () => undefined;

const IDLE: VoiceInputValue = {
  supported: false,
  state: 'idle',
  elapsed: 0,
  error: null,
  toggle: noop,
  clearError: noop,
};

/**
 * useVoiceInput, loaded on demand. Returns the voice value plus an element
 * the caller must render somewhere (it renders nothing visible); while
 * `enabled` is false that element is null and no code is fetched.
 */
export function useLazyVoiceInput(options: {
  enabled: boolean;
  onTranscript: (text: string) => void;
  getHints?: () => VoiceInputHints;
}): [VoiceInputValue, ReactNode] {
  const { enabled } = options;
  const [voice, setVoice] = useState<VoiceInputValue>(IDLE);
  // The latest callbacks, read through refs so the driver gets stable props.
  const onTranscriptRef = useRef(options.onTranscript);
  const getHintsRef = useRef(options.getHints);
  useEffect(() => {
    onTranscriptRef.current = options.onTranscript;
    getHintsRef.current = options.getHints;
  });
  const onTranscript = useCallback((text: string) => onTranscriptRef.current(text), []);
  const getHints = useCallback(() => getHintsRef.current?.() ?? {}, []);

  const driver = enabled ? (
    <VoiceInputDriver onTranscript={onTranscript} getHints={getHints} onChange={setVoice} />
  ) : null;
  return [enabled ? voice : IDLE, driver];
}
