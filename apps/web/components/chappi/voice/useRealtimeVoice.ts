'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { useChappiStore } from '@/stores/useChappiStore';
import type { ChappiClientAction } from '@/lib/chappi/types';
import {
  VOICE_CONFIRM_TIMEOUT_SECONDS,
  VOICE_REFUSAL_COPY,
  VOICE_SILENCE_END_SECONDS,
  isLiveState,
  readSpokenAnswer,
  type UrgansDoArgs,
  type VoiceCallState,
  type VoiceRefusal,
  type VoiceTransport as TransportKind,
  type VoiceTranscriptLine,
} from '@/lib/urgans-voice-realtime';
import {
  CascadeTransport,
  RealtimeTransport,
  openMicrophone,
  type ToolOutcome,
  type TransportPhase,
  type VoiceTransport,
} from './transports';

// The voice call, start to summary. Owns everything the sheet shows (state,
// captions, meter, the confirmation card, the summary) and everything the
// server needs (the heartbeat that bills each minute, the end call), and drives
// one of the two transports. Every finished line of the call is written into
// the UrgAns conversation store as it lands, so the thread behind the sheet
// fills up and the call is in the chat history afterwards.

export type VoiceReleaseScope = { id: string; title: string; daysToRelease?: number | null } | null;

export type VoiceSummary = { minutes: number; credits: number; actions: number };

type SessionPayload = {
  sessionId: string;
  transport: TransportKind;
  greeting: string;
  transcriptionHint: string;
  tickSeconds: number;
  balance: number | null;
  startedAt: string;
  realtime?: { clientSecret: string; callsUrl: string };
};

const GOODBYE = /^(bye|goodbye|bye bye|that'?s all|thanks,? bye|end (the )?call|hang up)\b/i;

async function token(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(body),
  });
}

let lineCounter = 0;
const lineId = () => `voice-${Date.now().toString(36)}-${(lineCounter += 1)}`;

export function useRealtimeVoice(options: {
  releaseScope: VoiceReleaseScope;
  firstName?: string | null;
  onClientActions?: (actions: ChappiClientAction[]) => void;
}) {
  const [state, setState] = useState<VoiceCallState>('primer');
  const [captions, setCaptions] = useState<Array<VoiceTranscriptLine & { final: boolean }>>([]);
  const [transcript, setTranscript] = useState<VoiceTranscriptLine[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [balance, setBalance] = useState<number | null>(null);
  const [warn, setWarn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [pending, setPending] = useState<{ title: string; detail: string | null } | null>(null);
  const [actions, setActions] = useState(0);
  const [summary, setSummary] = useState<VoiceSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const transportRef = useRef<VoiceTransport | null>(null);
  const sessionRef = useRef<SessionPayload | null>(null);
  const transcriptRef = useRef<VoiceTranscriptLine[]>([]);
  const usageRef = useRef({ audioIn: 0, audioOut: 0, text: 0 });
  const lastActivityRef = useRef(0);
  const confirmTimerRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const endingRef = useRef(false);
  const actionsRef = useRef(0);
  const stateRef = useRef<VoiceCallState>('primer');
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const runToolRef = useRef<((args: UrgansDoArgs) => Promise<ToolOutcome>) | null>(null);

  const setCallState = useCallback((next: VoiceCallState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const appendLine = useCallback((line: VoiceTranscriptLine) => {
    transcriptRef.current = [...transcriptRef.current, line];
    setTranscript(transcriptRef.current);
    useChappiStore.getState().appendMessage({ id: lineId(), role: line.role, content: line.text });
  }, []);

  const clearConfirmTimer = () => {
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
  };

  // ── ending ────────────────────────────────────────────────────────────────

  const end = useCallback(
    async (reason: string = 'user', refusal?: VoiceRefusal) => {
      if (endingRef.current) return;
      endingRef.current = true;
      clearConfirmTimer();
      const session = sessionRef.current;
      const transport = transportRef.current;
      if (refusal && transport) {
        // The spoken heads-up before a forced end.
        await transport.say(VOICE_REFUSAL_COPY[refusal]).catch(() => {});
      }
      transport?.stop();
      transportRef.current = null;
      setCallState(refusal === 'out_of_credits' ? 'out_of_credits' : 'ended');
      if (refusal) setNotice(VOICE_REFUSAL_COPY[refusal]);
      if (!session) return;
      try {
        const response = await post('/api/urgans/voice/end', { sessionId: session.sessionId, reason, usage: usageRef.current });
        const data = (await response.json().catch(() => null)) as VoiceSummary | null;
        const result = data && typeof data.minutes === 'number' ? { minutes: data.minutes, credits: data.credits, actions: data.actions } : null;
        setSummary(result ?? { minutes: 0, credits: 0, actions: actionsRef.current });
        captureAnalyticsEvent({
          name: 'urgans_voice_call_ended',
          properties: { transport: session.transport, reason, minutes: result?.minutes ?? 0, actions: result?.actions ?? actionsRef.current },
        });
      } catch {
        setSummary({ minutes: 0, credits: 0, actions: actionsRef.current });
      }
    },
    [setCallState]
  );

  // ── one UrgAns turn (the delegate tool) ──────────────────────────────────

  const runTool = useCallback(
    async (args: UrgansDoArgs): Promise<ToolOutcome> => {
      const session = sessionRef.current;
      if (!session) return { spoken: '', needsConfirmation: false, ended: true };
      lastActivityRef.current = Date.now();
      if (!args.confirmed && !args.cancel) setCallState('acting');
      clearConfirmTimer();
      const response = await post('/api/urgans/voice/tool', {
        sessionId: session.sessionId,
        request: args.request,
        confirmed: args.confirmed,
        cancel: args.cancel,
        transcript: transcriptRef.current,
        releaseScope: optionsRef.current.releaseScope,
      });
      const data = (await response.json().catch(() => null)) as {
        reply?: string;
        spoken?: string;
        pendingConfirmation?: { title: string; detail: string | null } | null;
        clientActions?: ChappiClientAction[];
        acted?: boolean;
        balance?: number | null;
        ended?: boolean;
        reason?: VoiceRefusal;
        outOfCredits?: boolean;
      } | null;

      if (data?.ended && data.reason) {
        void end(data.reason, data.reason);
        return { spoken: data.spoken ?? VOICE_REFUSAL_COPY[data.reason], needsConfirmation: false, ended: true };
      }
      if (!response.ok && !data?.spoken) {
        captureAnalyticsEvent({ name: 'urgans_voice_call_failed', properties: { stage: 'turn', status: response.status } });
        return { spoken: 'Something went wrong. You can try again, or type instead.', needsConfirmation: false };
      }
      if (typeof data?.balance === 'number') setBalance(data.balance);
      if (data?.reply) appendLine({ role: 'assistant', text: data.reply });
      if (data?.acted) {
        actionsRef.current += 1;
        setActions(actionsRef.current);
      }
      const refreshes = (data?.clientActions ?? []).filter((action) => action.type === 'refresh');
      if (refreshes.length > 0) optionsRef.current.onClientActions?.(refreshes);

      const confirmation = data?.pendingConfirmation ?? null;
      setPending(confirmation);
      pendingRef.current = Boolean(confirmation);
      if (confirmation) {
        setCallState('confirming');
        // Silence for 15 seconds is a no.
        confirmTimerRef.current = window.setTimeout(() => {
          void runToolRef.current?.({ request: '', confirmed: false, cancel: true });
          setPending(null);
          pendingRef.current = false;
        }, VOICE_CONFIRM_TIMEOUT_SECONDS * 1000);
      }
      return { spoken: data?.spoken ?? '', needsConfirmation: Boolean(confirmation) };
    },
    [appendLine, end, setCallState]
  );

  useEffect(() => {
    runToolRef.current = runTool;
  }, [runTool]);

  // Cascade: a finished utterance is a yes/no, a goodbye, or a request.
  const onUtterance = useCallback(
    async (text: string) => {
      const transport = transportRef.current;
      if (!transport) return;
      lastActivityRef.current = Date.now();
      appendLine({ role: 'user', text });
      if (pendingRef.current) {
        const answer = readSpokenAnswer(text);
        if (answer === 'unclear') {
          await transport.say('Sorry, was that a yes or a no?');
          return;
        }
        const outcome = await runTool({ request: text, confirmed: answer === 'yes', cancel: answer === 'no' });
        setPending(null);
        pendingRef.current = false;
        if (outcome.spoken) await transport.say(outcome.spoken);
        return;
      }
      if (GOODBYE.test(text.trim())) {
        await transport.say('Bye for now. Your conversation is saved.');
        void end('goodbye');
        return;
      }
      await transport.say('On it.');
      const outcome = await runTool({ request: text, confirmed: false, cancel: false });
      if (outcome.spoken && !outcome.ended) await transport.say(outcome.spoken);
    },
    [appendLine, end, runTool]
  );

  // ── starting ──────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (stateRef.current !== 'primer' && stateRef.current !== 'ended' && stateRef.current !== 'error' && stateRef.current !== 'mic_denied') return;
    endingRef.current = false;
    setSummary(null);
    setNotice(null);
    setCaptions([]);
    setPending(null);
    pendingRef.current = false;
    actionsRef.current = 0;
    setActions(0);
    transcriptRef.current = [];
    setTranscript([]);
    usageRef.current = { audioIn: 0, audioOut: 0, text: 0 };
    setCallState('connecting');

    let mic: MediaStream;
    try {
      mic = await openMicrophone();
    } catch {
      captureAnalyticsEvent({ name: 'urgans_voice_call_failed', properties: { stage: 'mic' } });
      setCallState('mic_denied');
      return;
    }

    const response = await post('/api/urgans/voice/session', {
      releaseScope: optionsRef.current.releaseScope,
      firstName: optionsRef.current.firstName ?? null,
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as (SessionPayload & { error?: string; reason?: VoiceRefusal }) | null;
    if (!response?.ok || !data?.sessionId) {
      for (const track of mic.getTracks()) track.stop();
      captureAnalyticsEvent({ name: 'urgans_voice_call_failed', properties: { stage: 'session', status: response?.status } });
      setNotice(data?.error ?? 'Voice could not start. You can type instead.');
      setCallState(data?.reason === 'out_of_credits' ? 'out_of_credits' : 'error');
      return;
    }
    sessionRef.current = data;
    setBalance(data.balance ?? null);
    setStartedAt(Date.parse(data.startedAt) || Date.now());
    lastActivityRef.current = Date.now();

    const callbacks = {
      onPhase: (phase: TransportPhase) => {
        if (endingRef.current) return;
        if (pendingRef.current && (phase === 'listening' || phase === 'thinking')) {
          setCallState('confirming');
          return;
        }
        if (phase === 'user_speaking' || phase === 'speaking') lastActivityRef.current = Date.now();
        setCallState(phase);
      },
      onCaption: (role: 'user' | 'assistant', text: string, final: boolean) => {
        setCaptions((current) => {
          const others = current.filter((line) => line.final || line.role !== role);
          return [...others, { role, text, final }].slice(-2);
        });
        // Realtime finals go to the transcript here; cascade user lines are
        // written by onUtterance, and cascade replies by runTool.
        if (final && data.transport === 'realtime') appendLine({ role, text });
      },
      onLevel: setLevel,
      onTool: runTool,
      onUtterance,
      onUsage: (usage: { audioIn: number; audioOut: number; text: number }) => {
        usageRef.current = {
          audioIn: usageRef.current.audioIn + usage.audioIn,
          audioOut: usageRef.current.audioOut + usage.audioOut,
          text: usageRef.current.text + usage.text,
        };
      },
      onFailure: (stage: 'connect' | 'turn') => {
        captureAnalyticsEvent({ name: 'urgans_voice_call_failed', properties: { stage } });
        if (stage === 'connect') {
          setNotice('The call dropped. Your conversation is saved; you can type instead.');
          void end('disconnected');
        }
      },
    };

    let transport: VoiceTransport;
    if (data.transport === 'realtime' && data.realtime) {
      transport = new RealtimeTransport(mic, data.realtime, callbacks, async () => {
        const renewed = await post('/api/urgans/voice/session', { resumeSessionId: data.sessionId, releaseScope: optionsRef.current.releaseScope });
        const json = (await renewed.json().catch(() => null)) as { realtime?: { clientSecret: string; callsUrl: string } } | null;
        return renewed.ok && json?.realtime ? json.realtime : null;
      });
    } else {
      transport = new CascadeTransport(
        mic,
        callbacks,
        async (clip, mimeType) => {
          const form = new FormData();
          const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
          form.append('sessionId', data.sessionId);
          form.append('file', new File([clip], `turn.${extension}`, { type: mimeType.split(';')[0] }));
          if (data.transcriptionHint) form.append('hint', data.transcriptionHint);
          const heard = await fetch('/api/urgans/voice/hear', {
            method: 'POST',
            headers: { Authorization: `Bearer ${await token()}` },
            body: form,
          });
          const json = (await heard.json().catch(() => null)) as { text?: string; ended?: boolean; reason?: VoiceRefusal } | null;
          if (json?.ended && json.reason) {
            void end(json.reason, json.reason);
            return '';
          }
          return heard.ok ? json?.text ?? '' : '';
        },
        async (text) => {
          const spoken = await post('/api/urgans/voice/speak', { sessionId: data.sessionId, text });
          return spoken.ok ? spoken.blob() : null;
        }
      );
    }
    transportRef.current = transport;
    try {
      await transport.start();
    } catch {
      captureAnalyticsEvent({ name: 'urgans_voice_call_failed', properties: { stage: 'connect' } });
      setNotice('Voice could not connect. You can type instead.');
      void end('error');
      setCallState('error');
      return;
    }
    captureAnalyticsEvent({ name: 'urgans_voice_call_started', properties: { transport: data.transport } });
    if (data.transport === 'cascade') {
      appendLine({ role: 'assistant', text: data.greeting });
      void transport.say(data.greeting);
    }
  }, [appendLine, end, onUtterance, runTool, setCallState]);

  // ── the heartbeat, the clock and the silence rule ───────────────────────

  const live = isLiveState(state);
  useEffect(() => {
    if (!live) return;
    const clock = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() - lastActivityRef.current > VOICE_SILENCE_END_SECONDS * 1000 && stateRef.current !== 'acting') {
        void end('silence');
      }
    }, 1000);
    const session = sessionRef.current;
    const tick = window.setInterval(
      async () => {
        if (!session) return;
        const response = await post('/api/urgans/voice/tick', { sessionId: session.sessionId }).catch(() => null);
        const json = (await response?.json().catch(() => null)) as {
          balance?: number | null;
          warn?: boolean;
          ended?: boolean;
          reason?: VoiceRefusal;
        } | null;
        if (json?.ended && json.reason) {
          void end(json.reason, json.reason);
          return;
        }
        if (typeof json?.balance === 'number') setBalance(json.balance);
        if (json?.warn && !warn) {
          setWarn(true);
          void transportRef.current?.say('Heads up: about a minute left on this call.');
        }
      },
      (session?.tickSeconds ?? 60) * 1000
    );
    return () => {
      window.clearInterval(clock);
      window.clearInterval(tick);
    };
  }, [live, end, warn]);

  // Hang up on unmount (navigating away, closing the tab inside the app).
  useEffect(
    () => () => {
      if (transportRef.current) void end('disconnected');
    },
    [end]
  );

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      transportRef.current?.setMuted(!current);
      return !current;
    });
  }, []);

  const confirm = useCallback(async () => {
    const outcome = await runTool({ request: 'yes', confirmed: true, cancel: false });
    setPending(null);
    pendingRef.current = false;
    if (outcome.spoken) await transportRef.current?.say(outcome.spoken);
  }, [runTool]);

  const cancel = useCallback(async () => {
    const outcome = await runTool({ request: 'no', confirmed: false, cancel: true });
    setPending(null);
    pendingRef.current = false;
    if (outcome.spoken) await transportRef.current?.say(outcome.spoken);
  }, [runTool]);

  return {
    state,
    captions,
    transcript,
    elapsedMs: startedAt ? Math.max(0, now - startedAt) : 0,
    balance,
    warn,
    muted,
    level,
    pending,
    actions,
    summary,
    notice,
    start,
    end,
    toggleMute,
    confirm,
    cancel,
  };
}
