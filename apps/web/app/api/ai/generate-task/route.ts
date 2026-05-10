import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateStructuredAiOutput, isAiConfigured } from '@/lib/ai/provider';

type GenerateMode = 'onboarding' | 'next-step';

type GenerateTaskRequest = {
  mode: GenerateMode;
  releaseId: string;
  onboardingInputs?: Record<string, unknown>;
};

type TaskGeneration = {
  title: string;
  description: string;
  why_it_matters: string;
  measurable_outcome: string;
};

const buildAiFailureResponse = (error: unknown) => {
  const detail = String((error as { message?: string } | null)?.message || 'Unknown AI generation error');
  const rateLimited = /rate-limited|rate limited/i.test(detail);
  const unavailable = /unavailable|failed|timeout|empty content|request failed/i.test(detail);

  return {
    generation_failed: true,
    error: rateLimited
      ? 'The current AI model is temporarily rate-limited. Please try again shortly.'
      : unavailable
        ? 'AI service unavailable'
        : detail,
    detail,
  };
};

const parseGenerationJson = (raw: string): TaskGeneration | null => {
  const normalized = String(raw || '').trim();
  if (!normalized) return null;

  const cleaned = normalized
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/, '')
    .trim();

  const parseCandidate = (value: string): TaskGeneration | null => {
    try {
      const first = JSON.parse(value) as Partial<TaskGeneration> | string;
      const parsed = (typeof first === 'string' ? JSON.parse(first) : first) as Partial<TaskGeneration>;
      const title = String(parsed.title || '').trim();
      const description = String(parsed.description || '').trim();
      const why = String(parsed.why_it_matters || '').trim();
      const measurable = String(parsed.measurable_outcome || '').trim();
      if (!title || !description || !why || !measurable) return null;
      return {
        title,
        description,
        why_it_matters: why,
        measurable_outcome: measurable,
      };
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

  try {
    const parsed = JSON.parse(cleaned) as Partial<TaskGeneration>;
    const title = String(parsed.title || '').trim();
    const description = String(parsed.description || '').trim();
    const why = String(parsed.why_it_matters || '').trim();
    const measurable = String(parsed.measurable_outcome || '').trim();
    if (!title || !description || !why || !measurable) return null;
    return {
      title,
      description,
      why_it_matters: why,
      measurable_outcome: measurable,
    };
  } catch {
    return null;
  }
};

const buildPrompt = ({
  mode,
  release,
  profile,
  tasks,
  onboardingInputs,
}: {
  mode: GenerateMode;
  release: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  tasks: Array<Record<string, unknown>>;
  onboardingInputs: Record<string, unknown> | null;
}): string => {
  const latestCompletedWithFeedback = tasks.find((task) => {
    return String(task.status || '') === 'completed' && String(task.user_input || '').trim().length > 0;
  });

  const contextPayload = {
    mode,
    release,
    profile,
    onboarding_inputs: onboardingInputs,
    latest_completed_feedback: latestCompletedWithFeedback || null,
    recent_tasks: tasks.slice(0, 12),
  };

  return [
    'You are an execution manager for music artists and artist teams.',
    'Write like a direct manager assigning one immediate next step.',
    'Use best-practice language matching: infer user language from inputs; default to English when unclear.',
    'You must account for every non-empty user-provided input in the context.',
    'The task must include a measurable outcome.',
    '',
    'Return JSON only with this exact shape and string values:',
    '{',
    '  "title": "string",',
    '  "description": "string",',
    '  "why_it_matters": "string",',
    '  "measurable_outcome": "string"',
    '}',
    '',
    'Rules:',
    '- No markdown.',
    '- No additional keys.',
    '- Keep it specific to music campaign execution context.',
    '- Title should be actionable and concise.',
    '- IMPORTANT: Do not include the release title or artist name in the task title. The title should focus purely on the action (e.g., "Define the core concept" instead of "Idea for Deinde").',
    '',
    'Context JSON:',
    JSON.stringify(contextPayload),
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
    return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<GenerateTaskRequest>;
  const mode: GenerateMode = body.mode === 'onboarding' ? 'onboarding' : 'next-step';
  const releaseId = String(body.releaseId || '').trim();
  const onboardingInputs =
    body.onboardingInputs && typeof body.onboardingInputs === 'object'
      ? (body.onboardingInputs as Record<string, unknown>)
      : null;

  if (!releaseId) {
    return NextResponse.json({ error: 'releaseId is required' }, { status: 400 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: `Unauthorized: ${userError?.message || 'Invalid or expired token'}` }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: release, error: releaseError } = await supabaseAdmin
    .from('releases')
    .select('id,user_id,title,artist_name,type,status,created_at,updated_at')
    .eq('id', releaseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (releaseError) {
    return NextResponse.json({ error: releaseError.message || 'Could not load release context' }, { status: 500 });
  }
  if (!release) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }

  const [{ data: profile, error: profileError }, { data: tasks, error: taskError }] = await Promise.all([
    supabaseAdmin
      .from('release_profiles')
      .select(
        'release_id,setup_step,setup_completed,genre,primary_market,campaign_narrative,target_audience_description,listener_interests,budget_naira,hard_deadline,deadline_reason,other_goals,song_stage,updated_at'
      )
      .eq('release_id', releaseId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('ai_tasks')
      .select('id,title,description,why_it_matters,status,order_index,user_input,completed_at,created_at')
      .eq('release_id', releaseId)
      .order('order_index', { ascending: false })
      .limit(30),
  ]);

  if (profileError) {
    return NextResponse.json({ error: profileError.message || 'Could not load profile context' }, { status: 500 });
  }
  if (taskError) {
    return NextResponse.json({ error: taskError.message || 'Could not load task context' }, { status: 500 });
  }

  const prompt = buildPrompt({
    mode,
    release: release as Record<string, unknown>,
    profile: (profile as Record<string, unknown> | null) || null,
    tasks: ((tasks as Array<Record<string, unknown>> | null) || []).slice(),
    onboardingInputs,
  });

  try {
    const generated = await generateStructuredAiOutput<TaskGeneration>({
      messages: [
        {
          role: 'system',
          content: 'You are a precise task-generation engine. Output valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.25,
      parse: parseGenerationJson,
    });

    return NextResponse.json({
      title: generated.title,
      description: generated.description,
      why_it_matters: `${generated.why_it_matters}\nMeasurable outcome: ${generated.measurable_outcome}`,
      measurable_outcome: generated.measurable_outcome,
    });
  } catch (error) {
    return NextResponse.json(buildAiFailureResponse(error), { status: 502 });
  }
}
