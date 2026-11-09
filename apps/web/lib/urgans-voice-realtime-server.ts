import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_LIVE_TRANSCRIBE_MODEL,
  DEFAULT_REALTIME_MODEL,
  DEFAULT_TRANSCRIBE_MODEL,
  DEFAULT_TTS_MODEL,
  realtimeModelForUpstream,
} from '@/lib/ai/audio-models';
import { voiceMinuteCostRodi } from '@/lib/credits/pricing';
import { settleVoiceMinutes, type CreditSnapshot } from '@/lib/credits/credits-server';
import {
  URGANS_DO_TOOL,
  VOICE_TICK_SECONDS,
  decideTick,
  resolveVoiceTransport,
  type VoiceTickDecision,
  type VoiceTransport,
} from '@/lib/urgans-voice-realtime';
import type { ChappiPendingConfirmation } from '@/lib/chappi/types';

// The server half of Talk to UrgAns (the client-safe rules are
// lib/urgans-voice-realtime.ts). Three jobs:
//
//   1. Configuration: which transport, which upstream and key, which models.
//      Read at call time, never at module scope.
//   2. The upstream: mint a short-lived realtime client secret (the browser
//      then speaks WebRTC to the model directly; Vercel cannot hold a socket),
//      or, for the cascade transport, speech to text and text to speech.
//   3. The voice_sessions table: the server's own record of a call, which is
//      what every minute is billed from.

const DEFAULT_GATEWAY_BASE = 'https://api.rodiumai.io/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';
export const VOICE_SESSIONS_TABLE = 'voice_sessions';

/** The default voice. One warm, clear voice; the 3-voice listening test picks the final one (env URGANS_VOICE_NAME). */
const DEFAULT_VOICE = 'marin';

type EnvLike = Record<string, string | undefined>;

export type VoiceConfig = {
  transport: VoiceTransport;
  /** The realtime upstream. Null when realtime is not configured. */
  realtime: { baseURL: string; apiKey: string; model: string; upstreamIsOpenAi: boolean } | null;
  /** The gateway the cascade transport (and dictation) speaks to. Null without a key. */
  gateway: { baseURL: string; apiKey: string } | null;
  realtimeModel: string;
  captionsModel: string;
  transcribeModel: string;
  ttsModel: string;
  voice: string;
};

const clean = (value: string | undefined): string => String(value ?? '').trim();
const trimSlash = (value: string): string => value.replace(/\/+$/, '');

/**
 * The voice configuration. The realtime upstream is, in order:
 *   - URGANS_VOICE_REALTIME_BASE with OPENAI_REALTIME_API_KEY (or CHAPPI_API_KEY), when set;
 *   - api.openai.com with OPENAI_REALTIME_API_KEY, when that key is set;
 *   - otherwise none: RodiumAi had no realtime session endpoint on 2026-10-11.
 * A realtime transport with no realtime upstream falls back to cascade, so a
 * flag flipped before the key is set still gives a working call.
 */
export function getVoiceConfig(env: EnvLike = process.env): VoiceConfig {
  const gatewayKey = clean(env.CHAPPI_API_KEY);
  const gatewayBase = trimSlash(clean(env.CHAPPI_API_BASE) || DEFAULT_GATEWAY_BASE);
  const realtimeKey = clean(env.OPENAI_REALTIME_API_KEY);
  const realtimeBaseRaw = trimSlash(clean(env.URGANS_VOICE_REALTIME_BASE));

  const realtimeModel = clean(env.URGANS_VOICE_REALTIME_MODEL) || DEFAULT_REALTIME_MODEL;
  let realtime: VoiceConfig['realtime'] = null;
  if (realtimeBaseRaw && (realtimeKey || gatewayKey)) {
    const upstreamIsOpenAi = /(^|\.)openai\.com$/i.test(safeHost(realtimeBaseRaw));
    realtime = {
      baseURL: realtimeBaseRaw,
      apiKey: realtimeKey || gatewayKey,
      model: realtimeModelForUpstream(realtimeModel, upstreamIsOpenAi),
      upstreamIsOpenAi,
    };
  } else if (realtimeKey) {
    realtime = { baseURL: OPENAI_BASE, apiKey: realtimeKey, model: realtimeModelForUpstream(realtimeModel, true), upstreamIsOpenAi: true };
  }

  const wanted = resolveVoiceTransport(env.URGANS_VOICE_TRANSPORT);
  return {
    transport: wanted === 'realtime' && realtime ? 'realtime' : 'cascade',
    realtime,
    gateway: gatewayKey ? { baseURL: gatewayBase, apiKey: gatewayKey } : null,
    realtimeModel,
    captionsModel: clean(env.URGANS_VOICE_TRANSCRIBE_MODEL) || DEFAULT_LIVE_TRANSCRIBE_MODEL,
    transcribeModel: clean(env.URGANS_TRANSCRIBE_MODEL) || DEFAULT_TRANSCRIBE_MODEL,
    ttsModel: clean(env.URGANS_VOICE_TTS_MODEL) || DEFAULT_TTS_MODEL,
    voice: clean(env.URGANS_VOICE_NAME) || DEFAULT_VOICE,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** The model a call's minutes are attributed to (what voice_sessions.model records). */
export function voiceModelFor(config: VoiceConfig): string {
  return config.transport === 'realtime' ? config.realtimeModel : `${config.transcribeModel}+${config.ttsModel}`;
}

// ── Instructions ─────────────────────────────────────────────────────────────

export type VoiceContext = {
  firstName?: string | null;
  release?: { id: string; title: string; daysToRelease?: number | null } | null;
};

/** The release-aware greeting: "You're on 'Calm Down', 23 days to release. What do you need?" */
export function buildGreeting(context: VoiceContext): string {
  const name = context.firstName ? `Hi ${context.firstName}. ` : 'Hi. ';
  const release = context.release;
  if (!release) return `${name}What do you need?`;
  const days = release.daysToRelease;
  const when =
    typeof days === 'number' && Number.isFinite(days)
      ? days > 1
        ? `, ${days} days to release`
        : days === 1
          ? ', one day to release'
          : days === 0
            ? ', release day'
            : ''
      : '';
  return `${name}You're on "${release.title}"${when}. What do you need?`;
}

/** The realtime model's instructions. Short on purpose: the realtime context is 32k. */
export function buildVoiceInstructions(context: VoiceContext): string {
  return [
    'You are the AI voice of Urganize, an app that helps artists, managers and record labels plan new music and keep track of every task.',
    'Speak in short, warm, clear sentences. Never read out lists; say how many there are and that they are on screen.',
    `Start the call by saying exactly: "${buildGreeting(context)}"`,
    'For anything about the user\'s rollouts, activities, notes, shows, press kits or team, and for every change, call urgans_do with their request in their own words. Never invent facts about their work.',
    'While urgans_do runs, say one short line such as "On it." and wait.',
    'When urgans_do says a confirmation is needed, read its question aloud and wait for a clear yes or no. On a clear yes call urgans_do with confirmed true; on no, with cancel true. Anything unclear is not a yes: ask again.',
    'If the user says goodbye, say a short goodbye.',
    'Names may be Nigerian, Pidgin or artist names; spell them as the tool results do.',
  ].join('\n');
}

// ── Realtime: mint a client secret ───────────────────────────────────────────

export type RealtimeSecret = { value: string; expiresAt: number | null; callsUrl: string; model: string };

export class VoiceUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'VoiceUpstreamError';
    this.status = status;
  }
}

/**
 * Mint a short-lived client secret for one realtime session (OpenAI's
 * POST /v1/realtime/client_secrets, GA shape). The secret is good for about a
 * minute, only to open the call; the browser then POSTs its SDP offer to
 * `callsUrl` with it. The session is configured HERE, server side, so the
 * browser cannot give the model other tools or instructions.
 */
export async function mintRealtimeSecret(
  config: VoiceConfig,
  input: { instructions: string; transcriptionHint?: string; safetyIdentifier?: string },
  fetchImpl: typeof fetch = fetch
): Promise<RealtimeSecret> {
  const realtime = config.realtime;
  if (!realtime) throw new VoiceUpstreamError('Realtime voice is not configured.', 503);

  const body = {
    expires_after: { anchor: 'created_at', seconds: 60 },
    session: {
      type: 'realtime',
      model: realtime.model,
      instructions: input.instructions,
      tools: [URGANS_DO_TOOL],
      tool_choice: 'auto',
      audio: {
        input: {
          transcription: {
            model: realtimeModelForUpstream(config.captionsModel, realtime.upstreamIsOpenAi),
            ...(input.transcriptionHint ? { prompt: input.transcriptionHint } : {}),
          },
          turn_detection: { type: 'server_vad', silence_duration_ms: 600, create_response: true, interrupt_response: true },
        },
        output: { voice: config.voice },
      },
    },
  };

  const response = await fetchImpl(`${realtime.baseURL}/realtime/client_secrets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${realtime.apiKey}`,
      'Content-Type': 'application/json',
      ...(input.safetyIdentifier ? { 'OpenAI-Safety-Identifier': input.safetyIdentifier } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.error(`[urgans-voice] client secret upstream answered ${response.status}.`);
    throw new VoiceUpstreamError('Voice could not connect.', response.status === 429 ? 503 : 502);
  }
  const payload = (await response.json().catch(() => null)) as {
    value?: unknown;
    expires_at?: unknown;
    client_secret?: { value?: unknown; expires_at?: unknown };
  } | null;
  const value = typeof payload?.value === 'string' ? payload.value : payload?.client_secret?.value;
  const expires = payload?.expires_at ?? payload?.client_secret?.expires_at;
  if (typeof value !== 'string' || !value) throw new VoiceUpstreamError('Voice could not connect.', 502);
  return {
    value,
    expiresAt: typeof expires === 'number' ? expires : null,
    callsUrl: `${realtime.baseURL}/realtime/calls`,
    model: realtime.model,
  };
}

// ── Cascade: speech to text and text to speech through the gateway ───────────

/** Text to speech (POST /audio/speech). Verified on RodiumAi 2026-10-11 with gpt-4o-mini-tts. */
export async function synthesizeSpeech(
  config: VoiceConfig,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  if (!config.gateway) throw new VoiceUpstreamError('Voice is not configured.', 503);
  return fetchImpl(`${config.gateway.baseURL}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.gateway.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ttsModel,
      input: text,
      voice: config.voice,
      instructions: 'Warm, clear and brisk, like a calm music manager. Short pauses between sentences.',
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(20_000),
  });
}

/** Speech to text for one cascade turn (POST /audio/transcriptions). */
export async function transcribeTurn(
  config: VoiceConfig,
  file: File,
  hint: string,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  if (!config.gateway) throw new VoiceUpstreamError('Voice is not configured.', 503);
  const form = new FormData();
  form.append('file', file, file.name || 'audio');
  form.append('model', config.transcribeModel);
  form.append('response_format', 'json');
  if (hint) form.append('prompt', hint);
  return fetchImpl(`${config.gateway.baseURL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.gateway.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
}

// ── voice_sessions ───────────────────────────────────────────────────────────

export type VoiceSessionRow = {
  id: string;
  workspace_id: string;
  owner_user_id: string | null;
  user_id: string;
  release_id: string | null;
  transport: VoiceTransport;
  model: string;
  status: 'active' | 'ended';
  started_at: string;
  ended_at: string | null;
  minutes_billed: number;
  credits_charged: number;
  actions_count: number;
  pending_action: ChappiPendingConfirmation | null;
};

const SESSION_COLUMNS =
  'id,workspace_id,owner_user_id,user_id,release_id,transport,model,status,started_at,ended_at,minutes_billed,credits_charged,actions_count,pending_action';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isVoiceSessionId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export async function createVoiceSession(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    userId: string;
    releaseId: string | null;
    transport: VoiceTransport;
    model: string;
  }
): Promise<VoiceSessionRow | null> {
  const { data, error } = await client
    .from(VOICE_SESSIONS_TABLE)
    .insert({
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      user_id: input.userId,
      release_id: input.releaseId && UUID.test(input.releaseId) ? input.releaseId : null,
      transport: input.transport,
      model: input.model,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error || !data) {
    console.error('[urgans-voice] could not create a voice session:', error?.message);
    return null;
  }
  return data as unknown as VoiceSessionRow;
}

/**
 * A call, only if it belongs to this user. Someone else's call id reads as
 * missing, never as forbidden, so ids cannot be probed.
 */
export async function loadVoiceSession(
  client: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<VoiceSessionRow | null> {
  if (!isVoiceSessionId(sessionId)) return null;
  const { data, error } = await client
    .from(VOICE_SESSIONS_TABLE)
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as VoiceSessionRow;
}

/**
 * Minutes the team's calls billed in the last 24 hours, other than `excludeId`.
 * Null when unreadable; the caller treats that as 0 (fail open, like every
 * counter here; the per-call cap still holds).
 */
export async function teamMinutesToday(
  client: SupabaseClient,
  workspaceId: string,
  excludeId: string | null,
  now: number = Date.now()
): Promise<number | null> {
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  let query = client.from(VOICE_SESSIONS_TABLE).select('minutes_billed').eq('workspace_id', workspaceId).gte('started_at', since);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return null;
  return data.reduce((total, row) => total + (Number((row as { minutes_billed?: unknown }).minutes_billed) || 0), 0);
}

export async function updateVoiceSession(
  client: SupabaseClient,
  sessionId: string,
  patch: Partial<{
    status: 'ended';
    ended_at: string;
    end_reason: string;
    minutes_billed: number;
    credits_charged: number;
    actions_count: number;
    last_tick_at: string;
    pending_action: ChappiPendingConfirmation | null;
    tokens_in_audio: number | null;
    tokens_out_audio: number | null;
    tokens_text: number | null;
  }>
): Promise<boolean> {
  const { error } = await client.from(VOICE_SESSIONS_TABLE).update(patch).eq('id', sessionId);
  if (error) console.error('[urgans-voice] could not update a voice session:', error.message);
  return !error;
}

export type BillResult = {
  decision: VoiceTickDecision;
  /** Balance after this charge, when known. */
  balance: number | null;
  minutesBilled: number;
  creditsCharged: number;
  teamMinutesToday: number;
};

/**
 * Bill whatever has started since the call was last billed, from the server's
 * own clock. Called by the tick, before every tool and speech turn, and at the
 * end, so a browser that stops ticking still pays for the time it used. The
 * row's minute count is advanced AFTER the ledger write; a repeat of the same
 * minute is a no-op on the ledger (dedupe key), so a crash between the two
 * charges once.
 */
export async function billOwedMinutes(
  client: SupabaseClient,
  input: {
    session: VoiceSessionRow;
    actorUserId: string;
    credits: CreditSnapshot | null;
    now?: number;
  }
): Promise<BillResult> {
  const now = input.now ?? Date.now();
  const { session } = input;
  const others = (await teamMinutesToday(client, session.workspace_id, session.id, now)) ?? 0;
  const balance = input.credits ? input.credits.total : null;
  const decision = decideTick({
    elapsedMs: now - Date.parse(session.started_at),
    minutesBilled: session.minutes_billed,
    teamMinutesToday: others,
    balance,
  });

  if (decision.kind === 'nothing' || decision.minutes === 0) {
    return { decision, balance, minutesBilled: session.minutes_billed, creditsCharged: session.credits_charged, teamMinutesToday: others };
  }

  await settleVoiceMinutes(client, {
    workspaceId: session.workspace_id,
    ownerUserId: session.owner_user_id,
    actorUserId: input.actorUserId,
    sessionId: session.id,
    minutes: decision.minutes,
    minutesBilled: decision.minutesBilled,
    credits: decision.credits,
    estimatedRodiPerMinute: voiceMinuteCostRodi(session.transport === 'realtime' ? session.model : DEFAULT_REALTIME_MODEL),
    model: session.model,
    balances: input.credits,
  });
  const creditsCharged = session.credits_charged + decision.credits;
  await updateVoiceSession(client, session.id, {
    minutes_billed: decision.minutesBilled,
    credits_charged: creditsCharged,
    last_tick_at: new Date(now).toISOString(),
  });
  session.minutes_billed = decision.minutesBilled;
  session.credits_charged = creditsCharged;
  return {
    decision,
    balance: balance === null ? null : balance - decision.credits,
    minutesBilled: decision.minutesBilled,
    creditsCharged,
    teamMinutesToday: others,
  };
}

/** How long after the last billable minute an unended call is treated as over. */
export const VOICE_STALE_AFTER_MS = (VOICE_TICK_SECONDS * 3 + 30) * 1000;
