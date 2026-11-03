'use client';

import { useEffect } from 'react';
import { useVoiceInput, type VoiceInputHints, type VoiceInputValue } from '@/components/chappi/useVoiceInput';

/**
 * Runs useVoiceInput and reports its value to useLazyVoiceInput's owner.
 * Lives in its own chunk (URG-314 batch 6) so the recorder, the transcription
 * call and lib/urgans-voice load only where dictation is switched on. Renders
 * nothing.
 */
export function VoiceInputDriver({
  onTranscript,
  getHints,
  onChange,
}: {
  onTranscript: (text: string) => void;
  getHints?: () => VoiceInputHints;
  onChange: (value: VoiceInputValue) => void;
}) {
  const voice = useVoiceInput({ enabled: true, onTranscript, getHints });
  const { supported, state, elapsed, error, toggle, start, stop, cancel, clearError } = voice;
  useEffect(() => {
    onChange({ supported, state, elapsed, error, toggle, start, stop, cancel, clearError });
  }, [onChange, supported, state, elapsed, error, toggle, start, stop, cancel, clearError]);
  return null;
}
