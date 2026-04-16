import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildDefaultPlaybookSeedRows,
  buildMissingDefaultPlaybookSeedRows,
  buildReleasePlaybookState,
  type PlaybookStep,
  type PlaybookStepSeed,
  type ReleasePlaybookPhaseKey,
  type ReleasePlaybookState,
} from '@/lib/release-playbook';
import {
  RELEASE_EVENTS_TABLE,
  isOptionalTableMissingError,
} from '../../_shared';

export const RELEASE_PLAYBOOK_STEPS_TABLE = 'release_playbook_steps';
export const RELEASE_PLAYBOOK_REORDER_FUNCTION = 'reorder_release_playbook_steps';
export const PLAYBOOK_INITIALIZED_EVENT_TYPE = 'playbook_steps_initialized';
export const PLAYBOOK_LEGACY_EVENT_TYPE = 'playbook_state_saved';

export const RELEASE_PLAYBOOK_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  'create table if not exists public.release_playbook_steps (',
  '  id uuid primary key default gen_random_uuid(),',
  '  release_id uuid not null references public.releases(id) on delete cascade,',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  phase_key text not null,',
  '  template_key text null,',
  '  title text not null,',
  '  description text null,',
  '  is_completed boolean not null default false,',
  '  completed_at timestamptz null,',
  '  is_custom boolean not null default false,',
  '  position integer not null default 1,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'alter table public.release_playbook_steps',
  '  add column if not exists phase_key text not null default \'foundation\';',
  'alter table public.release_playbook_steps',
  '  add column if not exists template_key text null;',
  'alter table public.release_playbook_steps',
  '  add column if not exists title text not null default \'\';',
  'alter table public.release_playbook_steps',
  '  add column if not exists description text null;',
  'alter table public.release_playbook_steps',
  '  add column if not exists is_completed boolean not null default false;',
  'alter table public.release_playbook_steps',
  '  add column if not exists completed_at timestamptz null;',
  'alter table public.release_playbook_steps',
  '  add column if not exists is_custom boolean not null default false;',
  'alter table public.release_playbook_steps',
  '  add column if not exists position integer not null default 1;',
  'alter table public.release_playbook_steps',
  '  add column if not exists updated_at timestamptz not null default now();',
  '',
  'create index if not exists release_playbook_steps_release_id_idx',
  '  on public.release_playbook_steps(release_id);',
  'create index if not exists release_playbook_steps_release_phase_position_idx',
  '  on public.release_playbook_steps(release_id, phase_key, position asc, created_at asc);',
  'create index if not exists release_playbook_steps_user_id_idx',
  '  on public.release_playbook_steps(user_id, created_at desc);',
  'create unique index if not exists release_playbook_steps_release_template_idx',
  '  on public.release_playbook_steps(release_id, template_key)',
  '  where template_key is not null;',
  '',
  'create or replace function public.reorder_release_playbook_steps(',
  '  p_release_id uuid,',
  '  p_user_id uuid,',
  '  p_phase_key text,',
  '  p_step_ids uuid[]',
  ') returns void',
  'language plpgsql',
  'security definer',
  'as $$',
  'declare',
  '  v_expected_count integer;',
  '  v_matched_count integer;',
  'begin',
  '  if coalesce(array_length(p_step_ids, 1), 0) = 0 then',
  '    raise exception \'Step order is required.\';',
  '  end if;',
  '',
  '  select count(*)',
  '  into v_expected_count',
  '  from public.release_playbook_steps',
  '  where release_id = p_release_id',
  '    and user_id = p_user_id',
  '    and phase_key = p_phase_key;',
  '',
  '  if v_expected_count <> array_length(p_step_ids, 1) then',
  '    raise exception \'Step order must include every step in the phase.\';',
  '  end if;',
  '',
  '  select count(*)',
  '  into v_matched_count',
  '  from public.release_playbook_steps',
  '  where release_id = p_release_id',
  '    and user_id = p_user_id',
  '    and phase_key = p_phase_key',
  '    and id = any(p_step_ids);',
  '',
  '  if v_matched_count <> v_expected_count then',
  '    raise exception \'Invalid step ids for this playbook phase.\';',
  '  end if;',
  '',
  '  update public.release_playbook_steps as steps',
  '  set position = ordered.position,',
  '      updated_at = now()',
  '  from (',
  '    select step_id, ordinality::integer as position',
  '    from unnest(p_step_ids) with ordinality as provided(step_id, ordinality)',
  '  ) as ordered',
  '  where steps.id = ordered.step_id',
  '    and steps.release_id = p_release_id',
  '    and steps.user_id = p_user_id',
  '    and steps.phase_key = p_phase_key;',
  'end;',
  '$$;',
  '',
  'alter table public.release_playbook_steps enable row level security;',
].join('\n');

export type PlaybookStepRecord = {
  id: string;
  release_id: string;
  user_id: string;
  phase_key: ReleasePlaybookPhaseKey;
  template_key: string | null;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  is_custom: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

type LegacyPlaybookEventRecord = {
  id: string;
  payload_json: {
    items?: unknown;
  } | null;
  created_at: string;
};

const PLAYBOOK_STEP_SELECT =
  'id,release_id,user_id,phase_key,template_key,title,description,is_completed,completed_at,is_custom,position,created_at,updated_at';

type PlaybookResponseShape = {
  phases: ReleasePlaybookState['phases'];
  steps: PlaybookStep[];
  completedCount: number;
  totalCount: number;
  remainingCount: number;
  completionPercent: number;
};

function toPlaybookStepRecord(row: Record<string, unknown>): PlaybookStepRecord {
  return {
    id: String(row.id || ''),
    release_id: String(row.release_id || ''),
    user_id: String(row.user_id || ''),
    phase_key: String(row.phase_key || 'foundation') as ReleasePlaybookPhaseKey,
    template_key: typeof row.template_key === 'string' ? row.template_key : null,
    title: String(row.title || ''),
    description: typeof row.description === 'string' ? row.description : null,
    is_completed: Boolean(row.is_completed),
    completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    is_custom: Boolean(row.is_custom),
    position: Number(row.position || 1),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function toPlaybookInsertRow(releaseId: string, userId: string, seed: PlaybookStepSeed) {
  return {
    release_id: releaseId,
    user_id: userId,
    phase_key: seed.phaseKey,
    template_key: seed.templateKey,
    title: seed.title,
    description: seed.description,
    is_completed: seed.isCompleted,
    completed_at: seed.completedAt,
    is_custom: seed.isCustom,
    position: seed.position,
    updated_at: new Date().toISOString(),
  };
}

export function isPlaybookSchemaMissingError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return (
    isOptionalTableMissingError(error) ||
    message.includes('release_playbook_steps') ||
    message.includes('reorder_release_playbook_steps') ||
    (message.includes('function') && message.includes('does not exist'))
  );
}

export function buildMissingPlaybookSchemaResponse(
  message = 'Release playbook tables are missing.'
) {
  return NextResponse.json({ error: message, sql: RELEASE_PLAYBOOK_SQL }, { status: 501 });
}

export function toPlaybookResponse(playbook: ReleasePlaybookState): PlaybookResponseShape {
  return {
    phases: playbook.phases,
    steps: playbook.steps,
    completedCount: playbook.completedCount,
    totalCount: playbook.totalCount,
    remainingCount: playbook.remainingCount,
    completionPercent: playbook.completionPercent,
  };
}

export async function loadPlaybookStepRecords(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<{ steps: PlaybookStepRecord[] } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(RELEASE_PLAYBOOK_STEPS_TABLE)
    .select(PLAYBOOK_STEP_SELECT)
    .eq('release_id', releaseId)
    .eq('user_id', userId);

  if (error) {
    if (isPlaybookSchemaMissingError(error)) {
      return { error: buildMissingPlaybookSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load release playbook steps.' },
        { status: 500 }
      ),
    };
  }

  return {
    steps: Array.isArray(data)
      ? data.map((row) => toPlaybookStepRecord(row as Record<string, unknown>))
      : [],
  };
}

async function loadLatestLegacyPlaybookEvent(
  adminClient: SupabaseClient,
  releaseId: string
): Promise<{ event: LegacyPlaybookEventRecord | null } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(RELEASE_EVENTS_TABLE)
    .select('id,payload_json,created_at')
    .eq('release_id', releaseId)
    .eq('type', PLAYBOOK_LEGACY_EVENT_TYPE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isPlaybookSchemaMissingError(error)) {
      return { error: buildMissingPlaybookSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the release playbook snapshot.' },
        { status: 500 }
      ),
    };
  }

  return {
    event: data ? (data as LegacyPlaybookEventRecord) : null,
  };
}

async function hasPlaybookInitializationEvent(
  adminClient: SupabaseClient,
  releaseId: string
): Promise<{ initialized: boolean } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(RELEASE_EVENTS_TABLE)
    .select('id')
    .eq('release_id', releaseId)
    .eq('type', PLAYBOOK_INITIALIZED_EVENT_TYPE)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isPlaybookSchemaMissingError(error)) {
      return { error: buildMissingPlaybookSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not inspect release playbook state.' },
        { status: 500 }
      ),
    };
  }

  return { initialized: Boolean(data?.id) };
}

async function recordPlaybookInitialization(
  adminClient: SupabaseClient,
  releaseId: string,
  importedLegacySnapshot: boolean
): Promise<{ ok: true } | { error: NextResponse }> {
  const { error } = await adminClient.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: PLAYBOOK_INITIALIZED_EVENT_TYPE,
    payload_json: {
      importedLegacySnapshot,
      initializedAt: new Date().toISOString(),
    },
  });

  if (error) {
    if (isPlaybookSchemaMissingError(error)) {
      return { error: buildMissingPlaybookSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not initialize the editable playbook.' },
        { status: 500 }
      ),
    };
  }

  return { ok: true };
}

export async function ensurePlaybookInitialized(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<{ playbook: ReleasePlaybookState } | { error: NextResponse }> {
  const stepResult = await loadPlaybookStepRecords(adminClient, releaseId, userId);
  if ('error' in stepResult) {
    return stepResult;
  }

  if (stepResult.steps.length > 0) {
    return {
      playbook: buildReleasePlaybookState(stepResult.steps),
    };
  }

  const initializationResult = await hasPlaybookInitializationEvent(adminClient, releaseId);
  if ('error' in initializationResult) {
    return initializationResult;
  }

  if (initializationResult.initialized) {
    return {
      playbook: buildReleasePlaybookState([]),
    };
  }

  const legacyEventResult = await loadLatestLegacyPlaybookEvent(adminClient, releaseId);
  if ('error' in legacyEventResult) {
    return legacyEventResult;
  }

  const legacyItems = legacyEventResult.event?.payload_json?.items;
  const seedRows = buildDefaultPlaybookSeedRows(legacyItems).map((seed) =>
    toPlaybookInsertRow(releaseId, userId, seed)
  );

  const insertResult = await adminClient
    .from(RELEASE_PLAYBOOK_STEPS_TABLE)
    .insert(seedRows)
    .select(PLAYBOOK_STEP_SELECT);

  if (insertResult.error) {
    if (isPlaybookSchemaMissingError(insertResult.error)) {
      return { error: buildMissingPlaybookSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: insertResult.error.message || 'Could not initialize the release playbook.' },
        { status: 500 }
      ),
    };
  }

  const initializedEventResult = await recordPlaybookInitialization(
    adminClient,
    releaseId,
    Boolean(legacyEventResult.event?.id)
  );
  if ('error' in initializedEventResult) {
    return initializedEventResult;
  }

  return {
    playbook: buildReleasePlaybookState(
      Array.isArray(insertResult.data)
        ? insertResult.data.map((row) => toPlaybookStepRecord(row as Record<string, unknown>))
        : []
    ),
  };
}

export async function ensurePlaybookStepOwnership(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string,
  stepId: string
): Promise<{ step: PlaybookStepRecord } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(RELEASE_PLAYBOOK_STEPS_TABLE)
    .select(PLAYBOOK_STEP_SELECT)
    .eq('id', stepId)
    .eq('release_id', releaseId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isPlaybookSchemaMissingError(error)) {
      return { error: buildMissingPlaybookSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the requested playbook step.' },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return { error: NextResponse.json({ error: 'Playbook step not found.' }, { status: 404 }) };
  }

  return {
    step: toPlaybookStepRecord(data as Record<string, unknown>),
  };
}

export async function loadPlaybookState(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<{ playbook: ReleasePlaybookState } | { error: NextResponse }> {
  return ensurePlaybookInitialized(adminClient, releaseId, userId);
}

export async function reorderPlaybookPhase(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string,
  phaseKey: ReleasePlaybookPhaseKey,
  orderedStepIds: string[]
): Promise<{ playbook: ReleasePlaybookState } | { error: NextResponse }> {
  const { error } = await adminClient.rpc(RELEASE_PLAYBOOK_REORDER_FUNCTION, {
    p_release_id: releaseId,
    p_user_id: userId,
    p_phase_key: phaseKey,
    p_step_ids: orderedStepIds,
  });

  if (error) {
    if (isPlaybookSchemaMissingError(error)) {
      return { error: buildMissingPlaybookSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not reorder the release playbook.' },
        { status: 500 }
      ),
    };
  }

  return loadPlaybookState(adminClient, releaseId, userId);
}

export async function restoreMissingDefaultPlaybookSteps(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<{ playbook: ReleasePlaybookState } | { error: NextResponse }> {
  const currentPlaybookResult = await ensurePlaybookInitialized(adminClient, releaseId, userId);
  if ('error' in currentPlaybookResult) {
    return currentPlaybookResult;
  }

  const missingSeeds = buildMissingDefaultPlaybookSeedRows(currentPlaybookResult.playbook.steps);
  if (missingSeeds.length === 0) {
    return currentPlaybookResult;
  }

  const { error } = await adminClient
    .from(RELEASE_PLAYBOOK_STEPS_TABLE)
    .insert(missingSeeds.map((seed) => toPlaybookInsertRow(releaseId, userId, seed)));

  if (error) {
    if (isPlaybookSchemaMissingError(error)) {
      return { error: buildMissingPlaybookSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not restore the default playbook steps.' },
        { status: 500 }
      ),
    };
  }

  return loadPlaybookState(adminClient, releaseId, userId);
}
