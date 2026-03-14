import { NextRequest, NextResponse } from 'next/server';
import {
  EMPTY_LISTENER_PERSONA_RESULT,
  parseListenerPersonaResult,
  normalizeListenerProfileInputs,
  type ListenerPersonaResult,
} from '@/lib/listener-profile';
import {
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  LISTENER_PROFILE_TABLE,
  LISTENER_PROFILE_TABLE_SQL,
  listenerProfileSelectColumns,
  mapInputsToDbPayload,
  mapRowToInputs,
} from '../_shared';

type GenerateListenerProfileRequest = {
  workspaceId?: string | null;
  artistId?: string | null;
  inputs?: Record<string, unknown>;
};

const PERSONA_KEYS: Array<keyof ListenerPersonaResult> = Object.keys(EMPTY_LISTENER_PERSONA_RESULT) as Array<keyof ListenerPersonaResult>;
const PERSONA_KEY_SET = new Set<string>(PERSONA_KEYS);
const DEFAULT_AI_API_BASE = 'https://urganize-main-34fd8f6.d2.zuplo.dev';
const AI_MODEL = 'qwen2.5:3b';
const PERSONA_FALLBACK_MESSAGE = 'We could not generate the listener persona right now. Please try again.';

const buildAiFailureResponse = (error: unknown) => {
  const detail = String((error as { message?: string } | null)?.message || 'Unknown AI generation error');
  const rateLimited = /rate-limited|rate limited/i.test(detail);
  const unavailable = /unavailable|failed|timeout|empty content|request failed/i.test(detail);

  return {
    generation_failed: true,
    error: rateLimited
      ? 'The current AI model is temporarily rate-limited. Please try again shortly.'
      : unavailable
        ? PERSONA_FALLBACK_MESSAGE
        : PERSONA_FALLBACK_MESSAGE,
    detail,
  };
};

type ZuploChatResponse = {
  message?: {
    content?: string;
  };
};

const getAiGatewayConfig = () => {
  const apiKey = String(process.env.AI_API_KEY || '').trim();
  const apiBase = String(process.env.AI_API_BASE || DEFAULT_AI_API_BASE).trim();

  if (!apiKey) {
    return null;
  }

  return { apiKey, apiBase };
};

const parsePersonaPayload = (rawContent: string): ListenerPersonaResult | null => {
  const normalized = String(rawContent || '').trim();
  if (!normalized) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== PERSONA_KEYS.length) {
    return null;
  }

  for (const key of keys) {
    if (!PERSONA_KEY_SET.has(key)) {
      return null;
    }
  }

  const output = { ...EMPTY_LISTENER_PERSONA_RESULT };
  for (const key of PERSONA_KEYS) {
    const value = record[key];
    if (typeof value !== 'string') {
      return null;
    }
    output[key] = value.trim();
  }

  return parseListenerPersonaResult(output);
};

const buildPrompt = (inputs: Record<string, string | null>): string => {
  return [
    'You are an audience intelligence system for music artists.',
    'Analyze the artist inputs and generate a realistic ideal listener persona.',
    'The persona must feel like a real human fan.',
    'Base the persona strictly on provided inputs.',
    'If some inputs are missing, infer carefully and mention uncertainty.',
    '',
    'Return JSON only with this exact shape and string values:',
    '{',
    '  "persona_name": "string",',
    '  "age_range": "string",',
    '  "location_tendency": "string",',
    '  "lifestyle_summary": "string",',
    '  "personality_traits": "string",',
    '  "emotional_drivers": "string",',
    '  "music_behavior": "string",',
    '  "content_behavior": "string",',
    '  "platform_usage": "string",',
    '  "fashion_aesthetic": "string",',
    '  "cultural_references": "string",',
    '  "campaign_messaging": "string",',
    '  "best_platforms": "string",',
    '  "best_campaign_styles": "string",',
    '  "confidence_score": "string",',
    '  "missing_data_suggestions": "string"',
    '}',
    '',
    'Rules:',
    '- No markdown.',
    '- No additional keys.',
    '- Keep it practical for release planning and campaign execution.',
    '- Keep confidence_score in human-readable form (for example: "Medium (62%)").',
    '',
    'Input JSON:',
    JSON.stringify(inputs),
  ].join('\n');
};

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const aiConfig = getAiGatewayConfig();
  if (!aiConfig) {
    return NextResponse.json({ error: 'AI model environment is not configured' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as GenerateListenerProfileRequest;
  const bodyInputs = normalizeListenerProfileInputs((body.inputs || null) as Record<string, unknown> | null);
  const bodyWorkspaceId = String(body.workspaceId || '').trim() || null;
  const bodyArtistId = String(body.artistId || '').trim() || null;

  const { data: existing, error: loadError } = await adminClient
    .from(LISTENER_PROFILE_TABLE)
    .select(listenerProfileSelectColumns)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (loadError) {
    if (isOptionalTableMissingError(loadError)) {
      return NextResponse.json({ error: 'Listener profile table is missing', sql: LISTENER_PROFILE_TABLE_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: loadError.message || 'Could not load listener profile inputs' }, { status: 500 });
  }

  const existingRow = existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : null;
  const mergedInputs = mapRowToInputs(existingRow);
  for (const key of Object.keys(mergedInputs)) {
    const typedKey = key as keyof typeof mergedInputs;
    if (bodyInputs[typedKey] !== null) {
      mergedInputs[typedKey] = bodyInputs[typedKey];
    }
  }

  const workspaceId = bodyWorkspaceId || String(existingRow?.workspace_id || '').trim() || null;
  const artistId = bodyArtistId || String(existingRow?.artist_id || '').trim() || null;

  const prompt = buildPrompt(mergedInputs);
  let generated: ListenerPersonaResult;
  try {
    const response = await fetch(`${aiConfig.apiBase}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiConfig.apiKey,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a precise listener persona generation engine. Output valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: false,
        format: 'json',
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`AI gateway request failed (${response.status})`);
    }

    const payload = (await response.json().catch(() => null)) as ZuploChatResponse | null;
    const content = String(payload?.message?.content || '').trim();
    const parsedPersona = parsePersonaPayload(content);
    if (!parsedPersona) {
      throw new Error('Listener persona response did not match the expected JSON schema');
    }
    generated = parsedPersona;
  } catch (error) {
    return NextResponse.json(buildAiFailureResponse(error), { status: 502 });
  }

  const timestamp = new Date().toISOString();
  const savePayload = {
    user_id: auth.user.id,
    workspace_id: workspaceId,
    artist_id: artistId,
    ...mapInputsToDbPayload(mergedInputs),
    generated_persona: generated,
    generated_at: timestamp,
    updated_at: timestamp,
  };

  const { error: saveError } = await adminClient.from(LISTENER_PROFILE_TABLE).upsert(savePayload, { onConflict: 'user_id' });
  if (saveError) {
    if (isOptionalTableMissingError(saveError)) {
      return NextResponse.json({ error: 'Listener profile table is missing', sql: LISTENER_PROFILE_TABLE_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: saveError.message || 'Could not save generated listener profile' }, { status: 500 });
  }

  return NextResponse.json({
    persona: generated,
    generatedAt: timestamp,
    inputs: mergedInputs,
  });
}
