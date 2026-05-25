import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  PROFILE_ONBOARDING_SQL,
  deriveOnboardingRoleFromPersona,
  isOnboardingBiggestHeadache,
  isOnboardingPersona,
  isOnboardingReleaseProcess,
  isUserRole,
  normalizeOnboardingState,
  type OnboardingApiError,
  type UpdateOnboardingBody,
} from '@/lib/onboarding';

type ProfileOnboardingRecord = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  onboarding_completed: boolean | null;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
  onboarding_role: string | null;
  onboarding_persona: string | null;
  onboarding_release_process: string | null;
  onboarding_biggest_headache: string | null;
  onboarding_release_id: string | null;
  onboarding_task_id: string | null;
};

type SupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
};

const ONBOARDING_PROFILE_SELECT =
  'id,name,email,role,onboarding_completed,onboarding_step,onboarding_completed_at,onboarding_role,onboarding_persona,onboarding_release_process,onboarding_biggest_headache,onboarding_release_id,onboarding_task_id';
const TASKS_TABLE = 'tasks';

const isProfileOnboardingSchemaMissing = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('onboarding_') ||
    (message.includes('column') && message.includes('does not exist'))
  );
};

const buildMissingOnboardingSchemaResponse = (error = 'Profile onboarding columns are missing.') =>
  NextResponse.json(
    {
      error,
      sql: PROFILE_ONBOARDING_SQL,
    } satisfies OnboardingApiError,
    { status: 501 }
  );

const getSupabaseConfig = (): SupabaseConfig | null => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey };
};

const createAdminClient = (config: SupabaseConfig) => createClient(config.supabaseUrl, config.serviceRoleKey);

type AdminClient = ReturnType<typeof createAdminClient>;

const getAuthenticatedRequestUser = async (request: NextRequest) => {
  const config = getSupabaseConfig();
  if (!config) {
    return {
      error: NextResponse.json(
        { error: 'Server environment is not configured.' } satisfies OnboardingApiError,
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return {
      error: NextResponse.json({ error: 'Unauthorized.' } satisfies OnboardingApiError, { status: 401 }),
    };
  }

  const authClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.id) {
    return {
      error: NextResponse.json({ error: 'Unauthorized.' } satisfies OnboardingApiError, { status: 401 }),
    };
  }

  return {
    config,
    user,
    adminClient: createAdminClient(config),
  };
};

const toProfileSeed = (user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) => {
  const metadata = user.user_metadata || {};
  const nameCandidate =
    String(metadata.name || metadata.full_name || '').trim() ||
    String(user.email || '').split('@')[0] ||
    'User';
  const roleCandidate = String(metadata.role || '').trim() || 'artist-manager';

  return {
    id: user.id,
    name: nameCandidate,
    email: String(user.email || '').trim().toLowerCase() || null,
    role: roleCandidate,
    onboarding_completed: false,
    onboarding_step: 1,
    onboarding_completed_at: null,
    onboarding_role: null,
    onboarding_persona: null,
    onboarding_release_process: null,
    onboarding_biggest_headache: null,
    onboarding_release_id: null,
    onboarding_task_id: null,
    updated_at: new Date().toISOString(),
  };
};

const ensureProfileRecord = async (
  adminClient: AdminClient,
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  }
): Promise<{ profile: ProfileOnboardingRecord } | { error: NextResponse }> => {
  const profileResult = await adminClient
    .from('profiles')
    .select(ONBOARDING_PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle();

  if (profileResult.error) {
    if (isProfileOnboardingSchemaMissing(profileResult.error)) {
      return { error: buildMissingOnboardingSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: profileResult.error.message || 'Could not load profile onboarding state.' } satisfies OnboardingApiError,
        { status: 500 }
      ),
    };
  }

  if (profileResult.data) {
    return { profile: profileResult.data as ProfileOnboardingRecord };
  }

  const insertResult = await adminClient
    .from('profiles')
    .upsert(toProfileSeed(user), { onConflict: 'id' })
    .select(ONBOARDING_PROFILE_SELECT)
    .single();

  if (insertResult.error) {
    if (isProfileOnboardingSchemaMissing(insertResult.error)) {
      return { error: buildMissingOnboardingSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: insertResult.error.message || 'Could not initialize profile onboarding state.' } satisfies OnboardingApiError,
        { status: 500 }
      ),
    };
  }

  return { profile: insertResult.data as ProfileOnboardingRecord };
};

const resolveExistingReleaseId = async (
  adminClient: AdminClient,
  userId: string,
  currentReleaseId: string | null
) => {
  const normalizedReleaseId = typeof currentReleaseId === 'string' ? currentReleaseId.trim() : '';
  if (!normalizedReleaseId) {
    return null;
  }

  const currentReleaseResult = await adminClient
    .from('releases')
    .select('id')
    .eq('id', normalizedReleaseId)
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (currentReleaseResult.error || !currentReleaseResult.data?.id) {
    return null;
  }

  return String(currentReleaseResult.data.id);
};

const resolveExistingTaskId = async (
  adminClient: AdminClient,
  taskId: string | null,
  releaseId: string | null,
  userId: string
) => {
  const normalizedTaskId = typeof taskId === 'string' ? taskId.trim() : '';
  if (!normalizedTaskId) {
    return null;
  }

  const taskResult = await adminClient
    .from(TASKS_TABLE)
    .select('id,release_id,created_by')
    .eq('id', normalizedTaskId)
    .maybeSingle();

  if (taskResult.error || !taskResult.data?.id) {
    return null;
  }

  const taskReleaseId = typeof taskResult.data.release_id === 'string' ? taskResult.data.release_id : null;
  if (!taskReleaseId || (releaseId && taskReleaseId !== releaseId)) {
    return null;
  }

  if (String(taskResult.data.created_by || '') !== userId) {
    return null;
  }

  return String(taskResult.data.id);
};

const syncResumableOnboardingState = async (
  adminClient: AdminClient,
  userId: string,
  profile: ProfileOnboardingRecord
) => {
  const onboarding = normalizeOnboardingState(profile);
  if (onboarding.onboardingCompleted) {
    return onboarding;
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let shouldPersist = false;
  let nextState = { ...onboarding };

  if (!nextState.onboardingPersona) {
    if (nextState.onboardingStep !== 1) {
      updates.onboarding_step = 1;
      shouldPersist = true;
    }

    nextState.onboardingStep = 1;
  } else if (!nextState.onboardingReleaseProcess || !nextState.onboardingBiggestHeadache) {
    if (nextState.onboardingStep !== 2) {
      updates.onboarding_step = 2;
      shouldPersist = true;
    }

    nextState.onboardingStep = 2;
  }

  const releaseId =
    nextState.onboardingStep >= 4
      ? await resolveExistingReleaseId(adminClient, userId, nextState.releaseId)
      : nextState.releaseId;

  if (nextState.onboardingStep >= 4 && !releaseId) {
    updates.onboarding_step = 3;
    updates.onboarding_release_id = null;
    updates.onboarding_task_id = null;
    shouldPersist = true;

    nextState = {
      ...nextState,
      onboardingStep: 3,
      releaseId: null,
      taskId: null,
    };
  } else {
    if (nextState.releaseId !== releaseId) {
      updates.onboarding_release_id = releaseId;
      shouldPersist = true;
    }

    nextState.releaseId = releaseId;
  }

  const taskId =
    nextState.onboardingStep >= 4
      ? await resolveExistingTaskId(adminClient, nextState.taskId, nextState.releaseId, userId)
      : nextState.taskId;

  if (nextState.taskId !== taskId) {
    updates.onboarding_task_id = taskId;
    shouldPersist = true;
    nextState.taskId = taskId;
  }

  if (shouldPersist) {
    await adminClient.from('profiles').update(updates).eq('id', userId);
  }

  return nextState;
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const profileResult = await ensureProfileRecord(auth.adminClient, auth.user);
  if ('error' in profileResult) {
    return profileResult.error;
  }

  const onboarding = await syncResumableOnboardingState(auth.adminClient, auth.user.id, profileResult.profile);

  return NextResponse.json({
    onboarding,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedRequestUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const profileResult = await ensureProfileRecord(auth.adminClient, auth.user);
  if ('error' in profileResult) {
    return profileResult.error;
  }

  const body = (await request.json().catch(() => ({}))) as UpdateOnboardingBody;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.onboardingStep !== undefined) {
    const step = Number(body.onboardingStep);
    if (!Number.isFinite(step) || step < 1 || step > 5) {
      return NextResponse.json({ error: 'Onboarding step must be between 1 and 5.' } satisfies OnboardingApiError, {
        status: 400,
      });
    }

    updates.onboarding_step = Math.floor(step);
  }

  if (body.onboardingCompleted !== undefined) {
    updates.onboarding_completed = body.onboardingCompleted;
    updates.onboarding_completed_at = body.onboardingCompleted ? new Date().toISOString() : null;
    if (body.onboardingCompleted && updates.onboarding_step === undefined) {
      updates.onboarding_step = 5;
    }
  }

  if (body.onboardingRole !== undefined) {
    if (body.onboardingRole !== null && !isUserRole(body.onboardingRole)) {
      return NextResponse.json({ error: 'Onboarding role is invalid.' } satisfies OnboardingApiError, {
        status: 400,
      });
    }

    updates.onboarding_role = body.onboardingRole;
  }

  if (body.onboardingPersona !== undefined) {
    if (body.onboardingPersona !== null && !isOnboardingPersona(body.onboardingPersona)) {
      return NextResponse.json({ error: 'Onboarding persona is invalid.' } satisfies OnboardingApiError, {
        status: 400,
      });
    }

    const derivedRole = deriveOnboardingRoleFromPersona(body.onboardingPersona);
    if (
      body.onboardingPersona &&
      body.onboardingRole &&
      derivedRole &&
      body.onboardingRole !== derivedRole
    ) {
      return NextResponse.json(
        { error: 'Onboarding role does not match the selected persona.' } satisfies OnboardingApiError,
        { status: 400 }
      );
    }

    updates.onboarding_persona = body.onboardingPersona;
    if (body.onboardingRole === undefined) {
      updates.onboarding_role = derivedRole;
    }
  }

  if (body.onboardingReleaseProcess !== undefined) {
    if (
      body.onboardingReleaseProcess !== null &&
      !isOnboardingReleaseProcess(body.onboardingReleaseProcess)
    ) {
      return NextResponse.json(
        { error: 'Onboarding release process is invalid.' } satisfies OnboardingApiError,
        { status: 400 }
      );
    }

    updates.onboarding_release_process = body.onboardingReleaseProcess;
  }

  if (body.onboardingBiggestHeadache !== undefined) {
    if (
      body.onboardingBiggestHeadache !== null &&
      !isOnboardingBiggestHeadache(body.onboardingBiggestHeadache)
    ) {
      return NextResponse.json(
        { error: 'Onboarding biggest headache is invalid.' } satisfies OnboardingApiError,
        { status: 400 }
      );
    }

    updates.onboarding_biggest_headache = body.onboardingBiggestHeadache;
  }

  if (body.releaseId !== undefined) {
    const normalizedReleaseId = typeof body.releaseId === 'string' ? body.releaseId.trim() : '';
    if (body.releaseId !== null && !normalizedReleaseId) {
      return NextResponse.json({ error: 'Release id is invalid.' } satisfies OnboardingApiError, {
        status: 400,
      });
    }

    if (normalizedReleaseId) {
      const releaseResult = await auth.adminClient
        .from('releases')
        .select('id')
        .eq('id', normalizedReleaseId)
        .eq('owner_user_id', auth.user.id)
        .maybeSingle();

      if (releaseResult.error) {
        return NextResponse.json(
          { error: releaseResult.error.message || 'Could not verify onboarding release.' } satisfies OnboardingApiError,
          { status: 500 }
        );
      }

      if (!releaseResult.data?.id) {
        return NextResponse.json({ error: 'Release not found.' } satisfies OnboardingApiError, {
          status: 404,
        });
      }
    }

    updates.onboarding_release_id = body.releaseId === null ? null : normalizedReleaseId;
  }

  if (body.taskId !== undefined) {
    const normalizedTaskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
    if (body.taskId !== null && !normalizedTaskId) {
      return NextResponse.json({ error: 'Task id is invalid.' } satisfies OnboardingApiError, {
        status: 400,
      });
    }

    if (normalizedTaskId) {
      const expectedReleaseId =
        typeof updates.onboarding_release_id === 'string'
          ? updates.onboarding_release_id
          : body.releaseId !== undefined
            ? body.releaseId
            : profileResult.profile.onboarding_release_id;

      const taskResult = await auth.adminClient
        .from(TASKS_TABLE)
        .select('id,release_id,created_by')
        .eq('id', normalizedTaskId)
        .maybeSingle();

      if (taskResult.error) {
        return NextResponse.json(
          { error: taskResult.error.message || 'Could not verify onboarding task.' } satisfies OnboardingApiError,
          { status: 500 }
        );
      }

      if (!taskResult.data?.id) {
        return NextResponse.json({ error: 'Task not found.' } satisfies OnboardingApiError, {
          status: 404,
        });
      }

      const taskReleaseId = typeof taskResult.data.release_id === 'string' ? taskResult.data.release_id : null;
      if (!taskReleaseId || !expectedReleaseId || taskReleaseId !== expectedReleaseId) {
        return NextResponse.json({ error: 'Task does not belong to the onboarding release.' } satisfies OnboardingApiError, {
          status: 400,
        });
      }

      if (String(taskResult.data.created_by || '') !== auth.user.id) {
        return NextResponse.json({ error: 'Task does not belong to the current user.' } satisfies OnboardingApiError, {
          status: 403,
        });
      }
    }

    updates.onboarding_task_id = body.taskId === null ? null : normalizedTaskId;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No onboarding changes were provided.' } satisfies OnboardingApiError, {
      status: 400,
    });
  }

  const updateResult = await auth.adminClient
    .from('profiles')
    .update(updates)
    .eq('id', auth.user.id)
    .select(ONBOARDING_PROFILE_SELECT)
    .single();

  if (updateResult.error) {
    if (isProfileOnboardingSchemaMissing(updateResult.error)) {
      return buildMissingOnboardingSchemaResponse();
    }

    return NextResponse.json(
      { error: updateResult.error.message || 'Could not update onboarding state.' } satisfies OnboardingApiError,
      { status: 500 }
    );
  }

  const onboarding = await syncResumableOnboardingState(
    auth.adminClient,
    auth.user.id,
    updateResult.data as ProfileOnboardingRecord
  );

  return NextResponse.json({
    onboarding,
  });
}
