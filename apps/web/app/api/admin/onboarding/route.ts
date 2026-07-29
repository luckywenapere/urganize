import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../_shared';
import {
  ONBOARDING_BIGGEST_HEADACHE_LABELS,
  ONBOARDING_PERSONA_LABELS,
  ONBOARDING_PLANNING_PREFERENCE_LABELS,
  ONBOARDING_RELEASE_PROCESS_LABELS,
  normalizeOnboardingState,
} from '@/lib/onboarding';
import { ONBOARDING_RELEASE_TYPES, ONBOARDING_STAGE_OPTIONS, ONBOARDING_WHERE_STUCK_OPTIONS } from '@/lib/onboarding-draft';

// URG-195. Read-only view of what users actually pick during /onboarding —
// the questions have existed since the wizard shipped, but nothing ever
// displayed the answers anywhere. Modeled on
// apps/homepage/app/admin/waitlist (stat cards + aggregate pill rows +
// recent-signups table + CSV) and apps/web/app/api/admin/pricing-validation
// (the auth + in-app-join + CSV shape, which is directly reusable here).

// Wizard A ("what are you working on" etc., the live /onboarding flow) only
// writes profiles.role — a two-value 'artist' | 'artist-manager' from the
// wizard's own account-details step (OnboardingPageClient.tsx). This is a
// DIFFERENT column from the legacy onboarding_role (Wizard B, retired
// 2026-07-29 per URG-191), which is why it isn't run through
// ONBOARDING_ROLE_LABELS below — that map is for the other column.
const ONBOARDING_WIZARD_ROLE_LABELS: Record<string, string> = {
  artist: "I'm the artist",
  'artist-manager': 'I manage an artist',
};

type ProfileOnboardingRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  created_at: string | null;
  onboarding_completed: boolean | null;
  onboarding_completed_at: string | null;
  onboarding_role: string | null;
  onboarding_persona: string | null;
  onboarding_release_process: string | null;
  onboarding_biggest_headache: string | null;
  onboarding_planning_preference: string | null;
  onboarding_where_stuck: string[] | null;
  onboarding_stage: string | null;
  onboarding_release_id: string | null;
};

const PROFILE_SELECT =
  'id,name,email,role,created_at,onboarding_completed,onboarding_completed_at,onboarding_role,onboarding_persona,onboarding_release_process,onboarding_biggest_headache,onboarding_planning_preference,onboarding_where_stuck,onboarding_stage,onboarding_release_id';

const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

// Typed as Map<string, string> rather than the narrower enum key each
// options array declares — these get looked up with whatever raw string
// came back from the DB (or a joined releases.release_type), which
// TypeScript can't narrow to the enum at the call site.
const RELEASE_TYPE_LABELS = new Map<string, string>(
  ONBOARDING_RELEASE_TYPES.map((option) => [option.value, option.label])
);
const WHERE_STUCK_LABELS = new Map<string, string>(
  ONBOARDING_WHERE_STUCK_OPTIONS.map((option) => [option.value, option.label])
);
const STAGE_LABELS = new Map<string, string>(ONBOARDING_STAGE_OPTIONS.map((option) => [option.value, option.label]));

type Tally = { label: string; count: number };

// Counts non-null/non-empty occurrences of `pick(row)` per row, using
// `label` to turn each raw value into display text. Sorted by count so the
// most common answer always renders first — matches the waitlist
// reference's `ORDER BY COUNT(*) DESC` role-counts query.
function tally<T>(rows: T[], pick: (row: T) => string | null, label: (value: string) => string): Tally[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = pick(row);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ label: label(value), count }))
    .sort((a, b) => b.count - a.count);
}

// Same as `tally`, but for the multi-select where-stuck column — each row
// can contribute to several buckets at once.
function tallyMulti<T>(rows: T[], pick: (row: T) => string[] | null, label: (value: string) => string): Tally[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of pick(row) || []) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ label: label(value), count }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const { data, error } = await adminResult.supabaseAdmin
    .from('profiles')
    .select(PROFILE_SELECT)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load onboarding answers.' }, { status: 500 });
  }

  const profiles = (data || []) as ProfileOnboardingRow[];

  // "What are you working on?" (step 1) writes releases.release_type, not a
  // profiles column — same in-app-join pattern pricing-validation/route.ts
  // uses for its profiles lookup: collect ids, one more query, build a Map.
  const releaseIds = Array.from(
    new Set(profiles.map((row) => row.onboarding_release_id).filter((id): id is string => Boolean(id)))
  );
  let releaseTypeById = new Map<string, string>();
  if (releaseIds.length > 0) {
    const { data: releases } = await adminResult.supabaseAdmin
      .from('releases')
      .select('id,release_type')
      .in('id', releaseIds);
    releaseTypeById = new Map(
      ((releases || []) as Array<{ id: string; release_type: string }>).map((release) => [
        release.id,
        release.release_type,
      ])
    );
  }

  const rows = profiles.map((row) => {
    const onboarding = normalizeOnboardingState(row);
    return {
      id: row.id,
      name: row.name || '',
      email: row.email || '',
      role: row.role || '',
      releaseType: row.onboarding_release_id ? releaseTypeById.get(row.onboarding_release_id) || '' : '',
      completed: onboarding.onboardingCompleted,
      completedAt: onboarding.onboardingCompletedAt,
      planningPreference: onboarding.onboardingPlanningPreference,
      whereStuck: onboarding.onboardingWhereStuck,
      stage: onboarding.onboardingStage,
      // Legacy (Wizard B, retired URG-191) — real for a ~9-day production
      // window (see 20260720120000_profiles_backfill_onboarding_completed.sql)
      // but no live writer going forward. Shown, not hidden, per principle 8
      // ("visible state... trust is built through visibility") — just kept
      // out of the primary aggregate section below.
      persona: onboarding.onboardingPersona,
      releaseProcess: onboarding.onboardingReleaseProcess,
      biggestHeadache: onboarding.onboardingBiggestHeadache,
      createdAt: row.created_at || '',
    };
  });

  const hasLegacyData = rows.some((row) => row.persona || row.releaseProcess || row.biggestHeadache);

  const summary = {
    total: rows.length,
    // rows.length hitting exactly the LIMIT means there may be more profiles
    // than fetched — same "Showing the latest 200" honesty note the
    // waitlist reference gives.
    truncated: rows.length === 200,
    completed: rows.filter((row) => row.completed).length,
    // profiles.onboarding_where_stuck is null only for accounts that signed
    // up before URG-192 (2026-07-29) ever asked the question — see the
    // null-vs-[] distinction documented in lib/onboarding.ts.
    neverAskedWhereStuckOrStage: rows.filter((row) => row.whereStuck === null).length,
  };

  const breakdowns = {
    role: tally(rows, (row) => row.role || null, (value) => ONBOARDING_WIZARD_ROLE_LABELS[value] || value),
    releaseType: tally(rows, (row) => row.releaseType || null, (value) => RELEASE_TYPE_LABELS.get(value) || value),
    planningPreference: tally(
      rows,
      (row) => row.planningPreference,
      (value) => ONBOARDING_PLANNING_PREFERENCE_LABELS[value as keyof typeof ONBOARDING_PLANNING_PREFERENCE_LABELS] || value
    ),
    whereStuck: tallyMulti(rows, (row) => row.whereStuck, (value) => WHERE_STUCK_LABELS.get(value) || value),
    stage: tally(rows, (row) => row.stage, (value) => STAGE_LABELS.get(value) || value),
    legacyPersona: hasLegacyData
      ? tally(rows, (row) => row.persona, (value) => ONBOARDING_PERSONA_LABELS[value as keyof typeof ONBOARDING_PERSONA_LABELS] || value)
      : [],
    legacyReleaseProcess: hasLegacyData
      ? tally(
          rows,
          (row) => row.releaseProcess,
          (value) => ONBOARDING_RELEASE_PROCESS_LABELS[value as keyof typeof ONBOARDING_RELEASE_PROCESS_LABELS] || value
        )
      : [],
    legacyBiggestHeadache: hasLegacyData
      ? tally(
          rows,
          (row) => row.biggestHeadache,
          (value) => ONBOARDING_BIGGEST_HEADACHE_LABELS[value as keyof typeof ONBOARDING_BIGGEST_HEADACHE_LABELS] || value
        )
      : [],
  };

  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const header = [
      'created_at',
      'name',
      'email',
      'role',
      'release_type',
      'onboarding_completed',
      'completed_at',
      'planning_preference',
      'where_stuck',
      'stage',
      'legacy_persona',
      'legacy_release_process',
      'legacy_biggest_headache',
    ];
    const lines = rows.map((row) =>
      [
        row.createdAt,
        row.name,
        row.email,
        row.role,
        row.releaseType,
        row.completed ? 'true' : 'false',
        row.completedAt || '',
        row.planningPreference || '',
        (row.whereStuck || []).join('; '),
        row.stage || '',
        row.persona || '',
        row.releaseProcess || '',
        row.biggestHeadache || '',
      ]
        .map(escapeCsv)
        .join(',')
    );
    return new NextResponse([header.join(','), ...lines].join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="onboarding-answers.csv"',
      },
    });
  }

  return NextResponse.json({ summary, breakdowns, hasLegacyData, rows });
}
