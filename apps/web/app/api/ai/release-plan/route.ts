import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  extractAiAssistantText,
  normalizeReleaseTaskPlanResponse,
  parseReleaseTaskPlan,
  type ReleaseTaskPlan,
} from '@/lib/task-plan';

type ReleasePlanRequest = {
  releaseId?: string;
  inputs?: Record<string, unknown>;
};

const DEFAULT_AI_API_BASE = 'https://urganize-main-34fd8f6.d2.zuplo.dev';
const AI_MODEL = 'qwen2.5:3b';
const TASK_PLAN_FALLBACK_MESSAGE = 'We could not generate the task plan right now. Please try again.';

const buildAiFailureResponse = (error: unknown) => {
  const detail = String((error as { message?: string } | null)?.message || 'Unknown AI generation error');
  const rateLimited = /rate-limited|rate limited/i.test(detail);
  const unavailable = /unavailable|failed|timeout|empty content|request failed|invalid/i.test(detail);

  return {
    generation_failed: true,
    error: rateLimited
      ? 'The current AI model is temporarily rate-limited. Please try again shortly.'
      : unavailable
        ? TASK_PLAN_FALLBACK_MESSAGE
        : TASK_PLAN_FALLBACK_MESSAGE,
    detail,
  };
};

const toStringValue = (value: unknown): string => String(value || '').trim();

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const single = toStringValue(value);
  return single ? [single] : [];
};

const getAiGatewayConfig = () => {
  const apiKey = String(process.env.AI_API_KEY || '').trim();
  const apiBase = String(process.env.AI_API_BASE || DEFAULT_AI_API_BASE).trim();

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    apiBase,
  };
};

const buildUserPrompt = (context: Record<string, unknown>): string => {
  return [
    'Generate a release task plan for the following music release.',
    '',
    'Return JSON only in this exact shape:',
    '{',
    '  "plan_title": "string",',
    '  "plan_summary": "string",',
    '  "tasks": [',
    '    {',
    '      "title": "string",',
    '      "description": "string",',
    '      "phase": "string",',
    '      "priority": "string",',
    '      "recommended_timing": "string"',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- No markdown.',
    '- No extra keys.',
    '- Tasks must be actionable.',
    '- Tasks must be useful for real release execution.',
    '- Keep the plan practical and organized by timing.',
    '- Make tasks realistic, sequential, and useful for artists and managers.',
    '- Avoid vague filler tasks.',
    '- Phase should be one of: Strategy, Preparation, Content, Distribution, Promotion, Launch, Post-Launch.',
    '- Priority should be one of: High, Medium, Low.',
    '- recommended_timing must be human-readable.',
    '',
    'Input:',
    JSON.stringify(context),
  ].join('\n');
};

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const aiConfig = getAiGatewayConfig();
  if (!aiConfig) {
    return NextResponse.json({ error: 'AI model environment is not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ReleasePlanRequest;
  const releaseId = toStringValue(body.releaseId);
  const rawInputs = body.inputs && typeof body.inputs === 'object' ? (body.inputs as Record<string, unknown>) : {};

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  let release: Record<string, unknown> | null = null;
  let profile: Record<string, unknown> | null = null;

  if (releaseId) {
    const { data: releaseRow, error: releaseError } = await supabaseAdmin
      .from('releases')
      .select('id,user_id,title,artist_name,type,status,release_date,created_at,updated_at')
      .eq('id', releaseId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (releaseError) {
      return NextResponse.json({ error: releaseError.message || 'Could not load release context' }, { status: 500 });
    }

    if (!releaseRow) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 });
    }

    release = releaseRow as Record<string, unknown>;

    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from('release_profiles')
      .select(
        'release_id,setup_step,setup_completed,genre,primary_market,campaign_narrative,target_audience_description,listener_interests,budget_naira,hard_deadline,deadline_reason,other_goals,song_stage,updated_at'
      )
      .eq('release_id', releaseId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message || 'Could not load release profile context' }, { status: 500 });
    }

    profile = (profileRow as Record<string, unknown> | null) || null;
  }

  const mergedInputs = {
    artistName: toStringValue(rawInputs.artistName) || toStringValue(release?.artist_name),
    releaseTitle: toStringValue(rawInputs.releaseTitle) || toStringValue(release?.title),
    releaseType: toStringValue(rawInputs.releaseType) || toStringValue(release?.type),
    releaseDate:
      toStringValue(rawInputs.releaseDate) ||
      toStringValue(rawInputs.hardDeadline) ||
      toStringValue(release?.release_date) ||
      toStringValue(profile?.hard_deadline),
    goal: toStringValue(rawInputs.goal) || toStringValue(profile?.other_goals) || toStringValue(rawInputs.objective),
    genre: toStringValue(rawInputs.genre) || toStringValue(profile?.genre),
    primaryMarket: toStringValue(rawInputs.primaryMarket) || toStringValue(profile?.primary_market),
    targetAudience:
      toStringValue(rawInputs.targetAudience) || toStringValue(profile?.target_audience_description),
    budgetLevel:
      toStringValue(rawInputs.budgetLevel) ||
      (Number(profile?.budget_naira || 0) > 0
        ? Number(profile?.budget_naira) <= 200000
          ? 'low'
          : Number(profile?.budget_naira) <= 1000000
            ? 'medium'
            : 'high'
        : ''),
    teamType: toStringValue(rawInputs.teamType),
    platforms: toStringArray(rawInputs.platforms),
    contentAvailable: toStringArray(rawInputs.contentAvailable || rawInputs.availableAssets),
    listenerInterests: toStringValue(rawInputs.listenerInterests) || toStringValue(profile?.listener_interests),
    campaignNarrative: toStringValue(rawInputs.campaignNarrative) || toStringValue(profile?.campaign_narrative),
    songStage: toStringValue(rawInputs.songStage) || toStringValue(profile?.song_stage),
    notes: toStringValue(rawInputs.notes),
    existingSteps: toStringValue(rawInputs.existingSteps || rawInputs.currentSteps || rawInputs.stepsText),
    availableAssets: toStringArray(rawInputs.availableAssets || rawInputs.contentAvailable),
  };

  if (!mergedInputs.artistName && !mergedInputs.releaseTitle && !releaseId) {
    return NextResponse.json(
      { error: 'Provide releaseId or at least artistName / releaseTitle context in inputs' },
      { status: 400 }
    );
  }

  const prompt = buildUserPrompt({
    release,
    release_profile: profile,
    inputs: mergedInputs,
  });

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
            content: [
              'You are a precise music release planning engine.',
              'Return valid JSON only.',
              'Do not use markdown.',
              'Do not include any text outside the JSON object.',
              'Generate practical, realistic, sequential release tasks for artists and managers.',
              'Avoid generic advice and filler.',
            ].join('\n'),
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

    const payload = (await response.json().catch(() => null)) as unknown;
    const assistantText = extractAiAssistantText(payload);
    if (!assistantText) {
      throw new Error('AI gateway returned empty content');
    }

    const parsedPlan = parseReleaseTaskPlan(assistantText);
    if (!parsedPlan) {
      throw new Error(`AI returned an invalid task plan format. Raw content: ${assistantText.slice(0, 400)}`);
    }

    const normalizedPlan = normalizeReleaseTaskPlanResponse(parsedPlan as ReleaseTaskPlan);

    return NextResponse.json(normalizedPlan);
  } catch (error) {
    return NextResponse.json(buildAiFailureResponse(error), { status: 502 });
  }
}
