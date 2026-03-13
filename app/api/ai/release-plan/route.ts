import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateStructuredAiOutput, isAiConfigured } from '@/lib/ai/provider';
import { parseReleasePlanResult, type ReleasePlanResult } from '@/lib/release-plan';

type ReleasePlanRequest = {
  releaseId?: string;
  inputs?: Record<string, unknown>;
};

const buildAiFailureResponse = (error: unknown, fallbackAttempted: boolean) => {
  const detail = String((error as { message?: string } | null)?.message || 'Unknown AI generation error');
  const rateLimited = /rate-limited|rate limited/i.test(detail);

  return {
    generation_failed: true,
    error: rateLimited
      ? fallbackAttempted
        ? 'The current AI model is temporarily rate-limited. Urganize tried a backup model, but release plan generation still failed. Please try again shortly.'
        : 'The current AI model is temporarily rate-limited. Please try again shortly.'
      : 'Release plan generation failed after retries. Please generate again.',
    detail,
  };
};

const parseStructuredJson = <T,>(raw: string, parser: (value: unknown) => T | null): T | null => {
  const normalized = String(raw || '').trim();
  if (!normalized) return null;

  const cleaned = normalized
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/, '')
    .trim();

  const parseCandidate = (value: string): T | null => {
    try {
      const first = JSON.parse(value) as unknown;
      const parsed = typeof first === 'string' ? JSON.parse(first) : first;
      return parser(parsed);
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(cleaned);
  if (direct) return direct;

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return parseCandidate(cleaned.slice(firstBrace, lastBrace + 1));
  }

  return null;
};

const toStringValue = (value: unknown): string => String(value || '').trim();

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const single = toStringValue(value);
  return single ? [single] : [];
};

const buildPlanPrompt = (context: Record<string, unknown>): string => {
  return [
    'You are a release strategy planner for independent music teams.',
    'Generate a practical release plan that works for Nigerian and global independent artists and managers.',
    '',
    'Output JSON only with this exact shape:',
    '{',
    '  "summary": "string",',
    '  "release_strategy": "string",',
    '  "timeline_phases": [',
    '    { "phase": "string", "window": "string", "objective": "string" }',
    '  ],',
    '  "tasks": [',
    '    {',
    '      "title": "string",',
    '      "phase": "string",',
    '      "description": "string",',
    '      "owner": "string",',
    '      "measurable_outcome": "string",',
    '      "priority": "string"',
    '    }',
    '  ],',
    '  "milestones": [',
    '    { "title": "string", "timing": "string", "success_metric": "string" }',
    '  ],',
    '  "marketing_ideas": [',
    '    { "idea": "string", "channel": "string", "effort": "string", "why_it_fits": "string" }',
    '  ],',
    '  "audience_profile": {',
    '    "summary": "string",',
    '    "age_range": "string",',
    '    "locations": "string",',
    '    "platforms": "string",',
    '    "culture_signals": "string"',
    '  },',
    '  "playlist_suggestions": [',
    '    { "playlist_type": "string", "rationale": "string", "pitch_angle": "string" }',
    '  ],',
    '  "assumptions": ["string"]',
    '}',
    '',
    'Rules:',
    '- No markdown.',
    '- No additional keys.',
    '- Use practical actions, not label-industry jargon.',
    '- If budgetLevel is low, keep tactics lean and realistic.',
    '- If teamType is solo artist, do not assign everything to a manager.',
    '- If platforms are missing, still produce a workable plan.',
    '- If releaseDate is missing, use relative windows like "Week 1", "2 weeks before release", or "Launch week".',
    '- If contentAvailable is limited, suggest simple content the team can realistically make with a phone and basic editing.',
    '- Tasks must be easy to convert into in-app tasks.',
    '- Timeline phases must be concise and renderable as cards or rows.',
    '- Prefer globally understandable English with practical wording.',
    '',
    'Context JSON:',
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

  if (!isAiConfigured()) {
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
    contentAvailable: toStringArray(rawInputs.contentAvailable),
    listenerInterests: toStringValue(rawInputs.listenerInterests) || toStringValue(profile?.listener_interests),
    campaignNarrative: toStringValue(rawInputs.campaignNarrative) || toStringValue(profile?.campaign_narrative),
    songStage: toStringValue(rawInputs.songStage) || toStringValue(profile?.song_stage),
    notes: toStringValue(rawInputs.notes),
  };

  if (!mergedInputs.artistName && !mergedInputs.releaseTitle && !releaseId) {
    return NextResponse.json(
      { error: 'Provide releaseId or at least artistName / releaseTitle context in inputs' },
      { status: 400 }
    );
  }

  const prompt = buildPlanPrompt({
    release,
    release_profile: profile,
    inputs: mergedInputs,
  });

  try {
    const plan = await generateStructuredAiOutput<ReleasePlanResult>({
      messages: [
        {
          role: 'system',
          content: 'You are a precise music release planning engine. Output valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      parse: (raw) => parseStructuredJson(raw, parseReleasePlanResult),
    });

    return NextResponse.json({
      plan,
      context: {
        releaseId: releaseId || null,
        artistName: mergedInputs.artistName || null,
        releaseTitle: mergedInputs.releaseTitle || null,
      },
    });
  } catch (error) {
    const fallbackAttempted = String(process.env.OPENROUTER_MODEL || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean).length > 1;
    return NextResponse.json(buildAiFailureResponse(error, fallbackAttempted), { status: 502 });
  }
}
