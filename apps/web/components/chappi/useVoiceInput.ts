'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { isBrowserOnline } from '@/lib/offline/status';
import { captureAnalyticsEvent } from '@/lib/analytics';
import {
  MAX_VOICE_CLIP_SECONDS,
  buildTranscriptionPrompt,
  parseTranscription,
  pickRecordingMimeType,
} from '@/lib/urgans-voice';

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing';

export type VoiceInputHints = { releaseTitle?: string | null; artistName?: string | null };
type Hints = VoiceInputHints;

export type VoiceInputValue = {
  /** false when this browser cannot record — the mic button is not rendered. */
  supported: boolean;
  state: VoiceState;
  /** Seconds elapsed while recording, for the "Listening… 0:07" readout. */
  elapsed: number;
  error: string | null;
  /** Tap to start, tap again to stop. Never throws. */
  toggle: () => void;
  clearError: () => void;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/**
 * Records a short clip, posts it to /api/urgans/transcribe, and hands the
 * transcript to `onTranscript` (which the composer merges into the message box —
 * it never replaces what is typed, and never sends). The mic is released on
 * stop, on error and on unmount, so the browser's recording indicator clears.
 */
export function useVoiceInput(options: {
  enabled: boolean;
  onTranscript: (text: string) => void;
  getHints?: () => Hints;
}): VoiceInputValue {
  const { enabled, onTranscript, getHints } = options;

  // Feature detection runs once. If any piece is missing, the button is hidden —
  // a control that cannot work is worse than none.
  const [supported] = useState(() => {
    if (!enabled) return false;
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    if (typeof window.MediaRecorder === 'undefined') return false;
    return pickRecordingMimeType((type) => window.MediaRecorder.isTypeSupported(type)) !== null;
  });

  const [state, setState] = useState<VoiceState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Callbacks read through refs so the recorder's onstop closure never goes
  // stale as the composer re-renders. Synced in an effect (not during render —
  // this config errors on a ref write during render), which runs after every
  // render so the refs are current by the time any recorder callback fires.
  const onTranscriptRef = useRef(onTranscript);
  const getHintsRef = useRef(getHints);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    getHintsRef.current = getHints;
  });

  const releaseMic = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => releaseMic, [releaseMic]);

  const transcribe = useCallback(async (blob: Blob, mimeType: string) => {
    setState('transcribing');
    try {
      if (!isBrowserOnline()) {
        setError('You are offline. Voice needs a connection.');
        setState('idle');
        return;
      }
      const token = await getAccessToken();
      if (!token) {
        setError('Sign in again to use voice.');
        setState('idle');
        return;
      }
      const form = new FormData();
      const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      form.append('file', blob, `voice.${extension}`);
      const hints = getHintsRef.current?.() ?? {};
      const hint = buildTranscriptionPrompt(hints);
      if (hint) form.append('hint', hint);

      const response = await fetch('/api/urgans/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = (await response.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error || 'Voice hit a problem. Try again, or type instead.');
        captureAnalyticsEvent({ name: 'urgans_voice_used', properties: { outcome: 'error', status: response.status } });
        setState('idle');
        return;
      }

      const text = parseTranscription(data);
      if (text) {
        onTranscriptRef.current(text);
        captureAnalyticsEvent({ name: 'urgans_voice_used', properties: { outcome: 'ok' } });
      } else {
        setError("Didn't catch that. Try again.");
        captureAnalyticsEvent({ name: 'urgans_voice_used', properties: { outcome: 'empty' } });
      }
    } catch {
      setError('Voice hit a problem. Try again, or type instead.');
      captureAnalyticsEvent({ name: 'urgans_voice_used', properties: { outcome: 'error' } });
    } finally {
      setState('idle');
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // onstop fires transcribe, then releaseMic
    } else {
      releaseMic();
      setState('idle');
    }
  }, [releaseMic]);

  const start = useCallback(async () => {
    setError(null);
    if (!isBrowserOnline()) {
      setError('You are offline. Voice needs a connection.');
      return;
    }
    setState('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Allow the microphone to talk to UrgAns.');
      } else if (name === 'NotFoundError') {
        setError('No microphone found.');
      } else {
        setError('Could not start recording. Try again.');
      }
      setState('idle');
      return;
    }

    const mimeType = pickRecordingMimeType((type) => window.MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      setError('Recording is not supported in this browser.');
      setState('idle');
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      releaseMic();
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        setState('idle');
        return;
      }
      void transcribe(blob, mimeType);
    };
    recorder.onerror = () => {
      releaseMic();
      setError('Recording stopped unexpectedly. Try again.');
      setState('idle');
    };

    recorder.start();
    setState('recording');
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    // Stop automatically at the ceiling so a stuck recording can't grow past the
    // size limit or the person's intent.
    autoStopRef.current = setTimeout(() => stop(), MAX_VOICE_CLIP_SECONDS * 1000);
  }, [releaseMic, stop, transcribe]);

  const toggle = useCallback(() => {
    if (state === 'recording') {
      stop();
    } else if (state === 'idle') {
      void start();
    }
    // requesting/transcribing are transient — ignore taps during them.
  }, [state, start, stop]);

  const clearError = useCallback(() => setError(null), []);

  return { supported, state, elapsed, error, toggle, clearError };
}
