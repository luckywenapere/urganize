// Talk to UrgAns: a live, two-way voice call that can do anything typed UrgAns
// can do (NEXT_PUBLIC_FEATURE_URGANS_REALTIME, default off).
//
// This module is CLIENT-SAFE and PURE: the rate, the caps, the minute maths, the
// call states and the one delegate tool's schema, shared by the routes and the
// sheet so the two can never disagree about what a minute costs or when a call
// must end. The server half (session minting, the voice_sessions table) is
// lib/urgans-voice-realtime-server.ts.
//
// WHY ONE DELEGATE TOOL. The voice model never sees UrgAns's 115 tools: their
// schemas would eat most of a realtime model's 32k context and duplicate every
// guard. It gets ONE tool, urgans_do, and the server hands the request to the
// same UrgAns runner a typed message reaches (same model ladder, same tool
// scope, same confirmation gate, same credits). The voice model talks; UrgAns acts.

/**
 * What one started minute of a call costs, in credits. THE one constant for the
 * voice rate (founder call, 2026-10-11): 2 credits a minute (₦30 at the
 * subscriber credit price) on gpt-realtime-2.1-mini. Estimated provider cost is
 * about 2 to 5 RODI a minute (lib/credits/pricing.ts, voiceMinuteCostRodi), so
 * 2 credits covers it at the 3x markup in a busy minute; reconcile weekly from
 * voice_sessions' token columns and change only this number.
 *
 * Actions taken during a call are charged on top, exactly as typed ones are.
 */
export const VOICE_CREDITS_PER_MINUTE = 2;

/** One call ends itself at this many minutes (abuse guard, spec). */
export const VOICE_MAX_CALL_MINUTES = 30;

/** A team's calls together stop at this many minutes in a rolling 24 hours. */
export const VOICE_TEAM_DAILY_MINUTES = 120;

/** How often the browser asks to be billed for the next minute. */
export const VOICE_TICK_SECONDS = 60;

/** A call with nobody speaking for this long ends itself. */
export const VOICE_SILENCE_END_SECONDS = 120;

/** A spoken "Should I go ahead?" that hears nothing for this long is cancelled. */
export const VOICE_CONFIRM_TIMEOUT_SECONDS = 15;

/** The longest request urgans_do accepts, and the most transcript lines a turn carries. */
export const VOICE_MAX_REQUEST_CHARS = 1_000;
export const VOICE_MAX_TRANSCRIPT_LINES = 12;

export type VoiceTransport = 'realtime' | 'cascade';

/**
 * Which transport a call uses. CASCADE is the default because it is the one
 * that was verified end to end on 2026-10-11: RodiumAi answers speech to text
 * (gpt-transcribe) and text to speech (gpt-4o-mini-tts), but none of its
 * realtime session endpoints (POST /v1/realtime/client_secrets, /sessions,
 * /calls all 404). Realtime needs URGANS_VOICE_TRANSPORT=realtime and a
 * realtime-capable upstream (OPENAI_REALTIME_API_KEY to api.openai.com).
 */
export function resolveVoiceTransport(raw: string | undefined | null): VoiceTransport {
  return String(raw ?? '').trim().toLowerCase() === 'realtime' ? 'realtime' : 'cascade';
}

/** Minutes that have STARTED after `elapsedMs`: 0s is minute 1, 60s is minute 2. */
export function startedMinutes(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 1;
  return Math.floor(elapsedMs / (VOICE_TICK_SECONDS * 1000)) + 1;
}

/** Credits for a number of billed minutes. */
export function creditsForMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.ceil(minutes) * VOICE_CREDITS_PER_MINUTE;
}

/** How many whole minutes a balance can still pay for. */
export function minutesAffordable(balance: number): number {
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  return Math.floor(balance / VOICE_CREDITS_PER_MINUTE);
}

export type VoiceRefusal = 'out_of_credits' | 'call_cap' | 'daily_cap';

export type VoiceStartDecision = { ok: true } | { ok: false; reason: VoiceRefusal };

/**
 * May a call start? It needs at least one minute of credit and room under the
 * team's daily minutes. A null balance means unreadable, which does not block
 * (every counter here fails open; the first tick re-checks).
 */
export function decideStart(input: { balance: number | null; teamMinutesToday: number }): VoiceStartDecision {
  if (input.teamMinutesToday >= VOICE_TEAM_DAILY_MINUTES) return { ok: false, reason: 'daily_cap' };
  if (input.balance !== null && input.balance < VOICE_CREDITS_PER_MINUTE) return { ok: false, reason: 'out_of_credits' };
  return { ok: true };
}

export type VoiceTickDecision =
  /** Nothing new to bill (a repeated or early tick). */
  | { kind: 'nothing'; minutesBilled: number }
  /** Bill `minutes` more minutes, bringing the call to `minutesBilled`. */
  | { kind: 'bill'; minutes: number; minutesBilled: number; credits: number }
  /** Refuse: the call must end now. Anything still owed up to the cap is billed. */
  | { kind: 'refuse'; reason: VoiceRefusal; minutes: number; minutesBilled: number; credits: number };

/**
 * The billing decision for a tick (also run before every tool turn and on end,
 * so a client that stops ticking is still billed for the time it used).
 *
 * The minute is worked out from the SERVER's start time, never from a number
 * the browser sends, so a modified client cannot under-report. Owed minutes are
 * capped at the per-call cap. The next minute is refused when the call is at its
 * cap, the team at its daily cap, or the balance cannot pay for it. On refusal
 * the just-started minute is forgiven (the call ends inside it), but earlier
 * unbilled minutes are still charged because they were used; that can take a
 * balance below zero only when a browser skipped ticks, which the credits module
 * accepts for chat turns too.
 */
export function decideTick(input: {
  elapsedMs: number;
  minutesBilled: number;
  /** Minutes the team's OTHER calls billed in the last 24 hours. */
  teamMinutesToday: number;
  balance: number | null;
}): VoiceTickDecision {
  const started = Math.min(startedMinutes(input.elapsedMs), VOICE_MAX_CALL_MINUTES + 1);
  const billed = Math.max(0, Math.floor(input.minutesBilled));
  const owedWithinCap = Math.max(0, Math.min(started, VOICE_MAX_CALL_MINUTES) - billed);

  // On a credit or daily refusal the minute that has JUST started is the one
  // being refused, so it is not charged (the call ends inside it); any earlier
  // minute that was used and never billed still is. At the call cap every minute
  // up to 30 was inside the call and is charged.
  const refuse = (reason: VoiceRefusal): VoiceTickDecision => {
    const minutes = reason === 'call_cap' ? owedWithinCap : Math.max(0, owedWithinCap - 1);
    return { kind: 'refuse', reason, minutes, minutesBilled: billed + minutes, credits: creditsForMinutes(minutes) };
  };

  if (started > VOICE_MAX_CALL_MINUTES) return refuse('call_cap');
  if (owedWithinCap === 0) return { kind: 'nothing', minutesBilled: billed };
  if (input.teamMinutesToday + billed + owedWithinCap > VOICE_TEAM_DAILY_MINUTES) return refuse('daily_cap');
  if (input.balance !== null && input.balance < creditsForMinutes(owedWithinCap)) return refuse('out_of_credits');
  return {
    kind: 'bill',
    minutes: owedWithinCap,
    minutesBilled: billed + owedWithinCap,
    credits: creditsForMinutes(owedWithinCap),
  };
}

/**
 * Whether to warn that the call is about to end: one minute of credit left, or
 * one minute before either cap. The sheet turns the meter amber and the voice
 * says so once.
 */
export function shouldWarn(input: { balance: number | null; minutesBilled: number; teamMinutesToday: number }): boolean {
  const lastCallMinute = input.minutesBilled >= VOICE_MAX_CALL_MINUTES - 1;
  const lastDailyMinute = input.teamMinutesToday + input.minutesBilled >= VOICE_TEAM_DAILY_MINUTES - 1;
  const lastCreditMinute = input.balance !== null && input.balance < VOICE_CREDITS_PER_MINUTE * 2;
  return lastCallMinute || lastDailyMinute || lastCreditMinute;
}

/** The words the sheet and the voice use when a call cannot go on. */
export const VOICE_REFUSAL_COPY: Record<VoiceRefusal, string> = {
  out_of_credits: "You're out of credits, so I'll end the call here. Your conversation is saved.",
  call_cap: "We've hit the 30 minute limit for one call. Your conversation is saved.",
  daily_cap: "Your team has used today's 120 voice minutes. You can keep typing to UrgAns.",
};

// ── Call states (designer section) ───────────────────────────────────────────

export const VOICE_CALL_STATES = [
  'primer',
  'mic_denied',
  'connecting',
  'listening',
  'user_speaking',
  'thinking',
  'speaking',
  'acting',
  'confirming',
  'reconnecting',
  'out_of_credits',
  'error',
  'ended',
] as const;
export type VoiceCallState = (typeof VOICE_CALL_STATES)[number];

/** States in which the call is live and the meter runs. */
export function isLiveState(state: VoiceCallState): boolean {
  return ['listening', 'user_speaking', 'thinking', 'speaking', 'acting', 'confirming', 'reconnecting'].includes(state);
}

/** The one-line status under the orb, for screen readers as well as the eye. */
export const VOICE_STATE_LABEL: Record<VoiceCallState, string> = {
  primer: 'Talk to UrgAns',
  mic_denied: 'Microphone is blocked',
  connecting: 'Connecting…',
  listening: 'Listening',
  user_speaking: 'Listening',
  thinking: 'Thinking…',
  speaking: 'UrgAns is speaking',
  acting: 'On it…',
  confirming: 'Waiting for your answer',
  reconnecting: 'Reconnecting…',
  out_of_credits: 'Out of credits',
  error: 'Voice hit a problem',
  ended: 'Call ended',
};

/** "2 credits/min · 1:42 · 46 left". Left is omitted when unknown. */
export function formatMeter(input: { elapsedMs: number; balance: number | null }): string {
  const total = Math.max(0, Math.floor(input.elapsedMs / 1000));
  const clock = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  const parts = [`${VOICE_CREDITS_PER_MINUTE} credits/min`, clock];
  if (input.balance !== null && Number.isFinite(input.balance)) parts.push(`${Math.max(0, Math.floor(input.balance))} left`);
  return parts.join(' · ');
}

// ── Spoken confirmation ──────────────────────────────────────────────────────

const YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|go ahead|do it|confirm(ed)?|please do|correct|that'?s right|abeg do am)\b/i;
const NO = /^(no|nope|nah|cancel|stop|don'?t|wait|hold on|never mind)\b/i;

/**
 * Reads a spoken answer to "Should I go ahead?" in the cascade transport (the
 * realtime model answers through the tool's `confirmed` argument instead).
 * Anything that is not clearly yes or no is 'unclear', and unclear is never yes.
 */
export function readSpokenAnswer(text: string): 'yes' | 'no' | 'unclear' {
  const said = text.trim().replace(/^[^a-z]+/i, '');
  if (NO.test(said)) return 'no';
  if (YES.test(said)) return 'yes';
  return 'unclear';
}

// ── The one tool the voice model gets ────────────────────────────────────────

export const URGANS_DO_TOOL_NAME = 'urgans_do';

/** The realtime session's function tool (OpenAI realtime `tools` entry shape). */
export const URGANS_DO_TOOL = {
  type: 'function',
  name: URGANS_DO_TOOL_NAME,
  description:
    "Hand the user's request to UrgAns, which can read and change their rollouts, activities, notes, shows, press kits and team. Use it for anything beyond small talk: questions about their work and every change. Pass the request in the user's own words, with any names, dates and numbers they said. When UrgAns asked the user to confirm something and they clearly said yes, call it again with confirmed true; if they said no, with cancel true.",
  parameters: {
    type: 'object',
    properties: {
      request: { type: 'string', description: "What the user wants, in their words." },
      confirmed: { type: 'boolean', description: 'True only when the user just said yes to the pending confirmation.' },
      cancel: { type: 'boolean', description: 'True when the user said no to the pending confirmation.' },
    },
    required: ['request'],
  },
} as const;

export type UrgansDoArgs = { request: string; confirmed: boolean; cancel: boolean };

/** Shape validation of the tool's arguments, as the model sent them (a JSON string or an object). */
export function parseUrgansDoArgs(raw: unknown): UrgansDoArgs | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const request = typeof record.request === 'string' ? record.request.trim().slice(0, VOICE_MAX_REQUEST_CHARS) : '';
  const confirmed = record.confirmed === true;
  const cancel = record.cancel === true && !confirmed;
  if (!request && !confirmed && !cancel) return null;
  return { request, confirmed, cancel };
}

/** One line of a call's transcript. */
export type VoiceTranscriptLine = { role: 'user' | 'assistant'; text: string };

/** Keep the transcript a turn carries short, shaped, and plain text. */
export function trimTranscript(raw: unknown): VoiceTranscriptLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: VoiceTranscriptLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string' || !text.trim()) continue;
    lines.push({ role, text: text.trim().slice(0, VOICE_MAX_REQUEST_CHARS) });
  }
  return lines.slice(-VOICE_MAX_TRANSCRIPT_LINES);
}

/**
 * Shortens UrgAns's typed-style reply into something worth saying aloud: the
 * first two sentences, lists folded into a pointer to the screen. Voice and
 * tone rule: no reading out lists.
 */
export function spokenSummary(reply: string): string {
  const text = String(reply ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`]/g, '')
    .trim();
  if (!text) return '';
  const hasList = /^\s*([-•]|\d+[.)])\s+/m.test(text);
  const prose = text
    .split(/\n+/)
    .filter((line) => !/^\s*([-•]|\d+[.)])\s+/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = prose.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [prose];
  let spoken = sentences
    .slice(0, 2)
    .map((sentence) => sentence.trim())
    .join(' ')
    .trim();
  if (spoken.length > 320) spoken = `${spoken.slice(0, 317).trimEnd()}…`;
  if (hasList) spoken = `${spoken}${spoken ? ' ' : ''}The details are on screen.`;
  return spoken;
}
