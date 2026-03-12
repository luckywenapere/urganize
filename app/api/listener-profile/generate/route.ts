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

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 3;

const PERSONA_KEYS: Array<keyof ListenerPersonaResult> = Object.keys(EMPTY_LISTENER_PERSONA_RESULT) as Array<keyof ListenerPersonaResult>;

const parsePersonaJson = (raw: string): ListenerPersonaResult | null => {
  const normalized = String(raw || '').trim();
  if (!normalized) return null;

  const cleaned = normalized
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/, '')
    .trim();

  const parseCandidate = (value: string): ListenerPersonaResult | null => {
    try {
      const first = JSON.parse(value) as Record<string, unknown> | string;
      const parsed = (typeof first === 'string' ? JSON.parse(first) : first) as Record<string, unknown>;
      const output = { ...EMPTY_LISTENER_PERSONA_RESULT };
      for (const key of PERSONA_KEYS) {
        output[key] = String(parsed[key] || '').trim();
      }
      return parseListenerPersonaResult(output);
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(cleaned);
  if (direct) return direct;

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const extracted = cleaned.slice(firstBrace, lastBrace + 1);
    const extractedParsed = parseCandidate(extracted);
    if (extractedParsed) return extractedParsed;
  }

  return null;
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

const generateWithOllama = async ({
  prompt,
  baseUrl,
  model,
}: {
  prompt: string;
  baseUrl: string;
  model: string;
}): Promise<ListenerPersonaResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.35,
        },
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
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `Ollama request failed (${response.status})`);
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const messageContent =
      typeof (payload.message as Record<string, unknown> | undefined)?.content === 'string'
        ? String((payload.message as Record<string, unknown>).content)
        : '';
    const fallbackResponse = typeof payload.response === 'string' ? payload.response : '';
    const generated = parsePersonaJson(messageContent || fallbackResponse);
    if (!generated) {
      throw new Error('Model returned invalid JSON format');
    }
    return generated;
  } finally {
    clearTimeout(timer);
  }
};

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).trim();
  const ollamaModel = (process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL).trim();
  if (!ollamaBaseUrl || !ollamaModel) {
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
  let lastError: unknown = null;
  let generated: ListenerPersonaResult | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      generated = await generateWithOllama({
        prompt,
        baseUrl: ollamaBaseUrl,
        model: ollamaModel,
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!generated) {
    const errorMessage = String((lastError as { message?: string } | null)?.message || 'Unknown AI generation error');
    return NextResponse.json(
      {
        generation_failed: true,
        error: 'Listener profile generation failed after retries. Please generate again.',
        detail: errorMessage,
      },
      { status: 502 }
    );
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
