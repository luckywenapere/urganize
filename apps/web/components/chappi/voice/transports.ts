'use client';

// The two ways a voice call's audio moves (lib/urgans-voice-realtime.ts,
// resolveVoiceTransport). Plain classes, not hooks: the call hook
// (useRealtimeVoice.ts) owns state and billing and drives one of these.
//
//   RealtimeTransport  WebRTC straight to the realtime model with a short-lived
//                      client secret the server minted. Barge-in, sub-second
//                      replies, captions from the model's own transcription.
//   CascadeTransport   Turn-based over plain HTTP, all on Vercel: the browser
//                      hears a pause, posts the clip to /voice/hear, the hook
//                      runs the turn, /voice/speak returns the reply as audio.
//
// Both report through the same callbacks, so the sheet never knows which runs.

import { pickRecordingMimeType, VOICE_MIME_CANDIDATES } from '@/lib/urgans-voice';
import { URGANS_DO_TOOL_NAME, parseUrgansDoArgs, type UrgansDoArgs } from '@/lib/urgans-voice-realtime';

export type TransportPhase = 'listening' | 'user_speaking' | 'thinking' | 'speaking' | 'acting' | 'reconnecting';

export type ToolOutcome = { spoken: string; needsConfirmation: boolean; ended?: boolean };

export type TransportCallbacks = {
  onPhase: (phase: TransportPhase) => void;
  /** A caption. `final` lines are written to the transcript. */
  onCaption: (role: 'user' | 'assistant', text: string, final: boolean) => void;
  /** 0..1, the louder of the two sides, for the orb. */
  onLevel: (level: number) => void;
  /** The voice model (realtime) or the hook's turn logic (cascade) wants UrgAns to act. */
  onTool: (args: UrgansDoArgs) => Promise<ToolOutcome>;
  /** Cascade only: a finished user utterance. The hook decides what it is (a request, a yes, a goodbye). */
  onUtterance?: (text: string) => Promise<void>;
  onUsage?: (usage: { audioIn: number; audioOut: number; text: number }) => void;
  onFailure: (stage: 'connect' | 'turn', detail?: string) => void;
};

export interface VoiceTransport {
  start(): Promise<void>;
  stop(): void;
  setMuted(muted: boolean): void;
  /** Speak a line the hook decided on (a refusal, a confirmation prompt, a goodbye). */
  say(text: string): Promise<void>;
}

/** Microphone, with the echo and noise handling a laptop speaker needs. Throws the browser's error. */
export async function openMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

/** Reads a stream's loudness, 0..1, about 30 times a second. Returns a stop function. */
function meter(stream: MediaStream, onLevel: (level: number) => void): () => void {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return () => {};
  const context = new AudioCtx();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let frame = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const centred = (value - 128) / 128;
      sum += centred * centred;
    }
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return () => {
    window.cancelAnimationFrame(frame);
    void context.close().catch(() => {});
  };
}

// ── Realtime over WebRTC ─────────────────────────────────────────────────────

export type RealtimeSecret = { clientSecret: string; callsUrl: string };

export class RealtimeTransport implements VoiceTransport {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private audio: HTMLAudioElement | null = null;
  private stopMeters: Array<() => void> = [];
  private assistantDraft = '';
  private stopped = false;
  private reconnected = false;

  constructor(
    private readonly mic: MediaStream,
    private secret: RealtimeSecret,
    private readonly callbacks: TransportCallbacks,
    /** Mints a fresh client secret for the one reconnect. */
    private readonly renewSecret: () => Promise<RealtimeSecret | null>
  ) {}

  async start(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.audio = this.audio ?? Object.assign(document.createElement('audio'), { autoplay: true });
    pc.ontrack = (event) => {
      if (this.audio) this.audio.srcObject = event.streams[0];
      this.stopMeters.push(meter(event.streams[0], (level) => this.callbacks.onLevel(level)));
    };
    for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic);
    this.stopMeters.push(meter(this.mic, (level) => this.callbacks.onLevel(level)));

    const channel = pc.createDataChannel('oai-events');
    this.channel = channel;
    channel.onmessage = (event) => this.handle(event.data);
    channel.onopen = () => {
      // The instructions tell the model to open with the greeting.
      this.send({ type: 'response.create' });
      this.callbacks.onPhase('listening');
    };
    pc.onconnectionstatechange = () => {
      if (this.stopped) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') void this.reconnectOnce();
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const response = await fetch(this.secret.callsUrl, {
      method: 'POST',
      body: offer.sdp,
      headers: { Authorization: `Bearer ${this.secret.clientSecret}`, 'Content-Type': 'application/sdp' },
    });
    if (!response.ok) throw new Error(`connect ${response.status}`);
    await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
  }

  /** Reconnect ONCE, with a fresh secret; a second drop ends the call. */
  private async reconnectOnce(): Promise<void> {
    if (this.reconnected) {
      this.callbacks.onFailure('connect', 'dropped');
      return;
    }
    this.reconnected = true;
    this.callbacks.onPhase('reconnecting');
    this.teardownPeer();
    const fresh = await this.renewSecret().catch(() => null);
    if (!fresh || this.stopped) {
      this.callbacks.onFailure('connect', 'renew');
      return;
    }
    this.secret = fresh;
    try {
      await this.connect();
    } catch {
      this.callbacks.onFailure('connect', 'reconnect');
    }
  }

  private send(event: Record<string, unknown>) {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event));
  }

  private handle(raw: unknown) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(String(raw));
    } catch {
      return;
    }
    const type = String(event.type ?? '');
    switch (type) {
      case 'input_audio_buffer.speech_started':
        // Barge-in: the server cancels its own reply (interrupt_response); the
        // sheet shows the person talking and drops the half-said line.
        this.assistantDraft = '';
        this.callbacks.onPhase('user_speaking');
        break;
      case 'input_audio_buffer.speech_stopped':
        this.callbacks.onPhase('thinking');
        break;
      case 'conversation.item.input_audio_transcription.delta':
        if (typeof event.delta === 'string') this.callbacks.onCaption('user', event.delta, false);
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof event.transcript === 'string' && event.transcript.trim()) this.callbacks.onCaption('user', event.transcript.trim(), true);
        break;
      case 'response.output_audio_transcript.delta':
        if (typeof event.delta === 'string') {
          this.assistantDraft += event.delta;
          this.callbacks.onCaption('assistant', this.assistantDraft, false);
        }
        break;
      case 'response.output_audio_transcript.done':
        if (typeof event.transcript === 'string' && event.transcript.trim()) this.callbacks.onCaption('assistant', event.transcript.trim(), true);
        this.assistantDraft = '';
        break;
      case 'output_audio_buffer.started':
        this.callbacks.onPhase('speaking');
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        this.callbacks.onPhase('listening');
        break;
      case 'response.function_call_arguments.done':
        void this.runTool(event);
        break;
      case 'response.done': {
        const usage = (event.response as { usage?: Record<string, unknown> } | undefined)?.usage;
        if (usage && this.callbacks.onUsage) {
          const input = (usage.input_token_details ?? {}) as Record<string, number>;
          const output = (usage.output_token_details ?? {}) as Record<string, number>;
          this.callbacks.onUsage({
            audioIn: Number(input.audio_tokens) || 0,
            audioOut: Number(output.audio_tokens) || 0,
            text: (Number(input.text_tokens) || 0) + (Number(output.text_tokens) || 0),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private async runTool(event: Record<string, unknown>) {
    const callId = String(event.call_id ?? '');
    if (event.name !== URGANS_DO_TOOL_NAME || !callId) return;
    const args = parseUrgansDoArgs(event.arguments);
    let output: ToolOutcome;
    if (!args) {
      output = { spoken: 'I did not catch the request. Ask again?', needsConfirmation: false };
    } else {
      this.callbacks.onPhase('acting');
      try {
        output = await this.callbacks.onTool(args);
      } catch {
        output = { spoken: 'Something went wrong. You can try again, or type instead.', needsConfirmation: false };
      }
    }
    if (this.stopped) return;
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
    });
    if (!output.ended) this.send({ type: 'response.create' });
  }

  async say(text: string): Promise<void> {
    this.send({
      type: 'response.create',
      response: { instructions: `Say exactly this, then stop: "${text.replace(/"/g, "'")}"` },
    });
  }

  setMuted(muted: boolean): void {
    for (const track of this.mic.getAudioTracks()) track.enabled = !muted;
  }

  private teardownPeer() {
    for (const stop of this.stopMeters) stop();
    this.stopMeters = [];
    try {
      this.channel?.close();
    } catch {
      // Already closed.
    }
    try {
      this.pc?.close();
    } catch {
      // Already closed.
    }
    this.channel = null;
    this.pc = null;
  }

  stop(): void {
    this.stopped = true;
    this.teardownPeer();
    if (this.audio) {
      this.audio.srcObject = null;
      this.audio = null;
    }
  }
}

// ── Cascade over HTTP ────────────────────────────────────────────────────────

/** Loudness that counts as speech, and how long a pause ends a turn. */
const SPEECH_LEVEL = 0.12;
const SPEECH_LEVEL_WHILE_SPEAKING = 0.3;
const START_AFTER_MS = 150;
const END_AFTER_SILENCE_MS = 900;
const MAX_TURN_MS = 30_000;

export class CascadeTransport implements VoiceTransport {
  private stopMeter: (() => void) | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private loudSince = 0;
  private quietSince = 0;
  private turnStartedAt = 0;
  private busy = false;
  private muted = false;
  private stopped = false;
  private player: HTMLAudioElement | null = null;
  private speaking = false;
  private readonly mimeType: string | null;

  constructor(
    private readonly mic: MediaStream,
    private readonly callbacks: TransportCallbacks,
    /** Posts a clip to /voice/hear; returns the words, or '' for nothing heard. */
    private readonly hear: (clip: Blob, mimeType: string) => Promise<string>,
    /** Posts text to /voice/speak; returns playable audio, or null. */
    private readonly speak: (text: string) => Promise<Blob | null>
  ) {
    this.mimeType = pickRecordingMimeType((type) => window.MediaRecorder?.isTypeSupported?.(type) ?? false) ?? VOICE_MIME_CANDIDATES[0];
  }

  async start(): Promise<void> {
    this.stopMeter = meter(this.mic, (level) => this.onLevel(level));
    this.callbacks.onPhase('listening');
  }

  private onLevel(level: number) {
    this.callbacks.onLevel(level);
    if (this.stopped || this.muted || this.busy) return;
    const now = Date.now();
    const threshold = this.speaking ? SPEECH_LEVEL_WHILE_SPEAKING : SPEECH_LEVEL;
    const loud = level >= threshold;

    if (!this.recorder) {
      if (loud) {
        this.loudSince = this.loudSince || now;
        if (now - this.loudSince >= START_AFTER_MS) this.beginTurn(now);
      } else {
        this.loudSince = 0;
      }
      return;
    }

    if (loud) this.quietSince = 0;
    else this.quietSince = this.quietSince || now;
    if ((this.quietSince && now - this.quietSince >= END_AFTER_SILENCE_MS) || now - this.turnStartedAt >= MAX_TURN_MS) {
      this.finishTurn();
    }
  }

  private beginTurn(now: number) {
    // Barge-in: the person started talking over UrgAns, so UrgAns stops.
    if (this.speaking) this.stopPlayback();
    this.chunks = [];
    this.turnStartedAt = now;
    this.quietSince = 0;
    try {
      this.recorder = new MediaRecorder(this.mic, this.mimeType ? { mimeType: this.mimeType } : undefined);
    } catch {
      this.recorder = new MediaRecorder(this.mic);
    }
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start();
    this.callbacks.onPhase('user_speaking');
  }

  private finishTurn() {
    const recorder = this.recorder;
    if (!recorder) return;
    this.recorder = null;
    this.loudSince = 0;
    this.busy = true;
    recorder.onstop = () => void this.processTurn(recorder.mimeType || this.mimeType || 'audio/webm');
    try {
      recorder.stop();
    } catch {
      this.busy = false;
    }
  }

  private async processTurn(mimeType: string) {
    const clip = new Blob(this.chunks, { type: mimeType });
    this.chunks = [];
    if (this.stopped) return;
    if (clip.size < 2_000) {
      // Too short to be words (a cough, a door).
      this.busy = false;
      this.callbacks.onPhase('listening');
      return;
    }
    this.callbacks.onPhase('thinking');
    try {
      const text = (await this.hear(clip, mimeType)).trim();
      if (text && this.callbacks.onUtterance && !this.stopped) {
        this.callbacks.onCaption('user', text, true);
        await this.callbacks.onUtterance(text);
      }
    } catch {
      this.callbacks.onFailure('turn');
    } finally {
      this.busy = false;
      if (!this.stopped && !this.speaking) this.callbacks.onPhase('listening');
    }
  }

  async say(text: string): Promise<void> {
    if (!text.trim() || this.stopped) return;
    const audio = await this.speak(text).catch(() => null);
    if (!audio || this.stopped) return;
    this.stopPlayback();
    const url = URL.createObjectURL(audio);
    const player = new Audio(url);
    this.player = player;
    this.speaking = true;
    this.callbacks.onPhase('speaking');
    await new Promise<void>((resolve) => {
      const done = () => {
        URL.revokeObjectURL(url);
        if (this.player === player) {
          this.player = null;
          this.speaking = false;
          if (!this.stopped && !this.busy) this.callbacks.onPhase('listening');
        }
        resolve();
      };
      player.onended = done;
      player.onerror = done;
      player.onpause = done;
      void player.play().catch(done);
    });
  }

  private stopPlayback() {
    if (this.player) {
      this.player.pause();
      this.player = null;
    }
    this.speaking = false;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const track of this.mic.getAudioTracks()) track.enabled = !muted;
  }

  stop(): void {
    this.stopped = true;
    this.stopPlayback();
    this.stopMeter?.();
    this.stopMeter = null;
    try {
      this.recorder?.stop();
    } catch {
      // Not recording.
    }
    this.recorder = null;
  }
}
