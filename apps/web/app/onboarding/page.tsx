'use client';

// Onboarding flow — Phases 1–3.
//
// Seven steps when NEXT_PUBLIC_FEATURE_WORKSPACE is on; six when it's off.
//
//   0  what are you working on
//   1  where are you stuck
//   2  where in lifecycle
//   3  release details (title + date)
//   4  AI Moment (deterministic — apps/web/lib/onboarding-ai-moment.ts)
//   5  create account                                  ← anonymous → authenticated
//   6  invite teammates (workspace flag only)          ← Skip always reaches /dashboard
//
// Auth carve-out: /onboarding is allow-listed in apps/web/lib/access-redirect.ts
// (SAFE_PATHS), apps/web/lib/auth-store.ts (SAFE_AUTH_PATHS), and
// apps/web/components/onboarding/FirstTimeOnboardingGate.tsx
// (PUBLIC_ROUTE_PREFIXES). AppShell renders this route without workspace chrome.
//
// Release-type restriction: the step-0 radio is wired to the template registry
// via getAvailableReleaseTypes(). Types whose template slot is null render
// disabled with "(coming soon)". This is the same mechanism CreateReleaseModal
// will adopt in a follow-up; the onboarding flow can therefore never produce a
// zero-task release.
//
// Hand-off (after step 5):
//   1. supabase.auth.signUp via useAuthStore.signup — reuses existing flow.
//   2. POST /api/trial/start — grant 28-day trial so the next call passes the
//      paywall (otherwise POST /api/releases 402s).
//   3. POST /api/releases — same path the in-app modal uses; template tasks
//      get instantiated via apps/web/lib/release-templates/instantiate.ts.
//   4. PATCH /api/user/onboarding { onboardingCompleted: true } — so the
//      FirstTimeOnboardingGate modal does not open on /dashboard.
//   5a. Workspace flag ON  → advance to step 6 (invite).
//   5b. Workspace flag OFF → router.replace('/dashboard').
//
// Invite step: each row { email, role } maps to one POST to
// /api/workspace/members/invite (the same endpoint Settings → Teammates uses).
// Send sends every row in parallel; per-row success/failure is rendered
// inline. Skip is always reachable and routes to /dashboard regardless of
// the in-flight state. Failures never block the dashboard.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';
import {
  EMPTY_ONBOARDING_DRAFT,
  ONBOARDING_RELEASE_TYPES,
  ONBOARDING_STAGE_OPTIONS,
  ONBOARDING_WHERE_STUCK_OPTIONS,
  type OnboardingDraft,
  type OnboardingReleaseType,
  type OnboardingStage,
  type OnboardingWhereStuck,
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from '@/lib/onboarding-draft';
import { getOnboardingAiMoment } from '@/lib/onboarding-ai-moment';
import { getAvailableReleaseTypes } from '@/lib/release-templates/loader';

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

// Workspace flag — the invite step exists only when the workspace consolidation
// is active. Same pattern app/dashboard/page.tsx uses.
const WORKSPACE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// Single source of truth for selectable release types: the template registry.
// See apps/web/lib/release-templates/loader.ts. EP/album/music_video become
// selectable automatically the moment their template slot becomes non-null.
const AVAILABLE_RELEASE_TYPE_SET: ReadonlySet<OnboardingReleaseType> = new Set(
  getAvailableReleaseTypes() as OnboardingReleaseType[]
);

const isReleaseTypeAvailable = (type: OnboardingReleaseType | null): boolean =>
  type !== null && AVAILABLE_RELEASE_TYPE_SET.has(type);

type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const LAST_STEP: StepIndex = WORKSPACE_ENABLED ? 6 : 5;
const TOTAL_STEPS = WORKSPACE_ENABLED ? 7 : 6;

const STEP_TITLES: Record<StepIndex, string> = {
  0: "What are you working on?",
  1: 'Where does a release usually fall apart?',
  2: 'Where is this release in its lifecycle?',
  3: 'Tell us about this release',
  4: 'Your first move',
  5: 'Create your account',
  6: 'Bring your team in',
};

const STEP_KICKER: Record<StepIndex, string> = {
  0: `Step 1 of ${TOTAL_STEPS}`,
  1: `Step 2 of ${TOTAL_STEPS}`,
  2: `Step 3 of ${TOTAL_STEPS}`,
  3: `Step 4 of ${TOTAL_STEPS}`,
  4: `Step 5 of ${TOTAL_STEPS}`,
  5: `Step 6 of ${TOTAL_STEPS}`,
  6: `Step 7 of ${TOTAL_STEPS}`,
};

// Role labels for the invite step. These are *display labels only* — the
// invite API normalizes unknown role strings to 'member' (see
// apps/web/app/api/workspace/members/invite/route.ts normalizeRole). The
// label is captured for the user's mental model; no role-based task routing
// is implemented in v1 (per CLAUDE.md).
const INVITE_ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'designer', label: 'Designer' },
  { value: 'producer', label: 'Producer' },
  { value: 'marketing', label: 'Marketing / promo' },
  { value: 'other', label: 'Other / team' },
] as const;

const MAX_INVITE_ROWS = 5;

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type InviteStatus = 'pending' | 'sending' | 'sent' | 'error';

interface InviteRow {
  id: string;
  email: string;
  role: (typeof INVITE_ROLE_OPTIONS)[number]['value'];
  status: InviteStatus;
  message: string;
}

const makeInviteRow = (): InviteRow => ({
  id:
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `inv-${Math.random().toString(36).slice(2, 10)}`,
  email: '',
  role: 'other',
  status: 'pending',
  message: '',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isReleaseDateValid(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const isEmailValid = (value: string): boolean => /\S+@\S+\.\S+/.test(value.trim());

// ---------------------------------------------------------------------------
// Reused class fragments — kept as constants so every input/button on this
// page looks identical without each call site copying the class soup.
// ---------------------------------------------------------------------------

const cardShell =
  'border border-stroke-default bg-bg-surface px-5 py-5 sm:px-6 sm:py-6';

const inputBase =
  'block w-full border border-stroke-default bg-bg-elevated px-3 py-2.5 text-base text-content-primary placeholder:text-content-tertiary outline-none transition-colors duration-fast ease-standard focus:border-brand';

const labelBase = 'block text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary';

const primaryButton =
  'inline-flex min-h-11 items-center justify-center bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors duration-fast ease-standard hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50';

const secondaryButton =
  'inline-flex min-h-11 items-center justify-center border border-stroke-default bg-bg-surface px-5 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const signup = useAuthStore((state) => state.signup);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_ONBOARDING_DRAFT);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [step, setStep] = useState<StepIndex>(0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  // Once the account has been created we suppress the "already-signed-in"
  // redirect to /dashboard so the user can finish the invite step on this
  // page instead of being shunted away the moment auth flips.
  const [accountCreated, setAccountCreated] = useState(false);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');

  const [inviteRows, setInviteRows] = useState<InviteRow[]>(() => [makeInviteRow()]);
  const [isFinishing, setIsFinishing] = useState(false);

  // ---- hydration ---------------------------------------------------------
  useEffect(() => {
    const loaded = loadOnboardingDraft();
    if (loaded.releaseType !== null && !AVAILABLE_RELEASE_TYPE_SET.has(loaded.releaseType)) {
      setDraft({ ...loaded, releaseType: null });
    } else {
      setDraft(loaded);
    }
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    saveOnboardingDraft(draft);
  }, [draft, hasHydrated]);

  // If the user is already signed in BEFORE starting onboarding, send them
  // home. Once the onboarding flow has created an account (accountCreated),
  // we let them stay on /onboarding to finish the invite step.
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && !isSubmitting && !accountCreated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isAuthLoading, isSubmitting, accountCreated, router]);

  // ---- step gating -------------------------------------------------------
  const canAdvance = useMemo(() => {
    if (step === 0) return isReleaseTypeAvailable(draft.releaseType);
    if (step === 1) return draft.whereStuck.length > 0;
    if (step === 2) return Boolean(draft.stage);
    if (step === 3) return draft.title.trim().length > 0 && isReleaseDateValid(draft.releaseDate);
    if (step === 4) return true;
    if (step === 5) return Boolean(name.trim() && email.trim() && password.length >= 6);
    // Step 6 (invite) intentionally has no gate — Skip is always reachable.
    if (step === 6) return true;
    return false;
  }, [draft, name, email, password, step]);

  const aiMoment = useMemo(() => getOnboardingAiMoment(draft), [draft]);

  const handleNext = () => {
    if (!canAdvance) return;
    setError('');
    setStep((current) => (current < LAST_STEP ? ((current + 1) as StepIndex) : current));
  };

  const handleBack = () => {
    setError('');
    // After signup we don't allow stepping back — the account already
    // exists and there's nothing meaningful to revise from this side.
    if (accountCreated) return;
    setStep((current) => (current > 0 ? ((current - 1) as StepIndex) : current));
  };

  const toggleWhereStuck = (value: OnboardingWhereStuck) => {
    setDraft((current) => ({
      ...current,
      whereStuck: current.whereStuck.includes(value)
        ? current.whereStuck.filter((item) => item !== value)
        : [...current.whereStuck, value],
    }));
  };

  // ---- hand-off ----------------------------------------------------------
  const getAccessToken = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || '';
    if (!token) {
      throw new Error('Could not read session after signup.');
    }
    return token;
  };

  const finishToDashboard = async (token: string | null) => {
    // Common tail: mark onboarding complete, refresh auth, clear draft, go.
    // Best-effort — if the PATCH fails the gate modal will briefly flash on
    // /dashboard but the user still reaches their workspace.
    if (token) {
      await fetch('/api/user/onboarding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          onboardingCompleted: true,
          onboardingStep: 5,
        }),
      }).catch(() => undefined);
    }
    await checkAuth();
    clearOnboardingDraft();
    router.replace('/dashboard');
  };

  const handleCreateAccount = async () => {
    if (!canAdvance || !draft.releaseType) {
      setError('Please complete the previous steps.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    setProgressMessage('Creating your account...');

    try {
      // 1. Signup — reuse existing auth flow. Role 'artist-manager' so the
      // artistName branch (which requires extra input) is bypassed. The
      // server will derive artistName from user_metadata.name.
      await signup(email.trim().toLowerCase(), password, name.trim(), 'artist-manager');
      setAccountCreated(true);
      const accessToken = await getAccessToken();

      // 2. Start the 28-day trial so the next call passes the paywall.
      // 400/409 are tolerable: a trial was already used / paid status, in
      // which case we let /api/releases be the arbiter.
      setProgressMessage('Starting your trial...');
      const trialResponse = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!trialResponse.ok && trialResponse.status !== 400 && trialResponse.status !== 409) {
        const trialPayload = (await trialResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(trialPayload.error || 'Could not start your trial.');
      }

      // 3. Create the real release. Template tasks instantiate server-side.
      setProgressMessage('Setting up your first release...');
      const releaseResponse = await fetch('/api/releases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: draft.title.trim(),
          releaseDate: draft.releaseDate,
          releaseType: draft.releaseType,
          source: 'onboarding',
        }),
      });
      const releasePayload = (await releaseResponse.json().catch(() => ({}))) as {
        release?: { id?: string };
        releaseId?: string;
        error?: string;
      };
      if (!releaseResponse.ok) {
        throw new Error(releasePayload.error || 'Could not create your release.');
      }

      // 4a. If the workspace flag is OFF, mark complete + ship to dashboard.
      // 4b. If ON, advance to the invite step. The PATCH to mark onboarding
      // complete happens in finishToDashboard, called from Send-and-finish
      // or Skip on the invite screen.
      if (!WORKSPACE_ENABLED) {
        setProgressMessage('Finishing up...');
        await finishToDashboard(accessToken);
        return;
      }

      setProgressMessage('');
      setIsSubmitting(false);
      setStep(6);
    } catch (handoffError) {
      setError(errorMessage(handoffError, 'Could not finish creating your workspace.'));
      setProgressMessage('');
      setIsSubmitting(false);
    }
  };

  // ---- invite step -------------------------------------------------------
  const updateInviteRow = (rowId: string, patch: Partial<InviteRow>) => {
    setInviteRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  };

  const removeInviteRow = (rowId: string) => {
    setInviteRows((current) => {
      const next = current.filter((row) => row.id !== rowId);
      return next.length > 0 ? next : [makeInviteRow()];
    });
  };

  const addInviteRow = () => {
    setInviteRows((current) =>
      current.length < MAX_INVITE_ROWS ? [...current, makeInviteRow()] : current
    );
  };

  const sendOneInvite = async (token: string, row: InviteRow) => {
    const response = await fetch('/api/workspace/members/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: row.email.trim().toLowerCase(), role: row.role }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `Invite failed (${response.status}).`);
    }
  };

  const handleSendAndFinish = async () => {
    setIsFinishing(true);
    setError('');
    let token: string | null = null;
    try {
      token = await getAccessToken();
    } catch {
      // No token means we can't send invites — surface the issue but still
      // honor "Skip never blocks dashboard reach" by short-circuiting to
      // the dashboard. The user can invite from Settings later.
      setError('Session expired. Heading to your dashboard.');
      await finishToDashboard(null);
      return;
    }

    const validRows = inviteRows.filter((row) => isEmailValid(row.email));
    if (validRows.length === 0) {
      // Nothing to send — equivalent to Skip.
      await finishToDashboard(token);
      return;
    }

    setInviteRows((current) =>
      current.map((row) =>
        validRows.find((valid) => valid.id === row.id)
          ? { ...row, status: 'sending', message: '' }
          : row
      )
    );

    const results = await Promise.all(
      validRows.map(async (row) => {
        try {
          await sendOneInvite(token!, row);
          return { id: row.id, ok: true as const };
        } catch (sendError) {
          return {
            id: row.id,
            ok: false as const,
            message: errorMessage(sendError, 'Invite failed.'),
          };
        }
      })
    );

    setInviteRows((current) =>
      current.map((row) => {
        const result = results.find((entry) => entry.id === row.id);
        if (!result) return row;
        return result.ok
          ? { ...row, status: 'sent', message: 'Invite sent' }
          : { ...row, status: 'error', message: result.message };
      })
    );

    // Even if some invites failed, the dashboard is reachable. The user can
    // retry failed invites from Settings → Teammates.
    await finishToDashboard(token);
  };

  const handleSkipInvites = async () => {
    setIsFinishing(true);
    setError('');
    let token: string | null = null;
    try {
      token = await getAccessToken();
    } catch {
      token = null;
    }
    await finishToDashboard(token);
  };

  // ---- loading shell -----------------------------------------------------
  if (!hasHydrated) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
          <p className="text-sm text-content-secondary">Loading…</p>
        </div>
      </main>
    );
  }

  // ---- render ------------------------------------------------------------
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 md:max-w-2xl">
        {/* Brand / title */}
        <div className="mb-6 sm:mb-8">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            Urganize
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight text-content-primary sm:text-3xl">
            Welcome aboard
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-content-secondary">
            A few questions before we set up your workspace.
          </p>
        </div>

        {/* Progress bar — TOTAL_STEPS thin segments */}
        <div
          className="mb-6 flex items-center gap-1.5 sm:mb-8"
          aria-label={`Onboarding progress, step ${step + 1} of ${TOTAL_STEPS}`}
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
            <span
              key={index}
              className={`h-1 flex-1 transition-colors duration-base ease-standard ${
                index <= step ? 'bg-brand' : 'bg-stroke-default'
              }`}
            />
          ))}
        </div>

        {/* Step container */}
        <section className={`${cardShell} animate-fade-in`} aria-labelledby="onboarding-step-heading">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {STEP_KICKER[step]}
          </p>
          <h2
            id="onboarding-step-heading"
            className="mt-1 font-display text-xl font-semibold leading-tight text-content-primary sm:text-2xl"
          >
            {STEP_TITLES[step]}
          </h2>

          {/* ----- Step 0: release type --------------------------------- */}
          {step === 0 ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm leading-relaxed text-content-secondary">
                Urganize is built around a single artist — pick the release for that artist. Only release
                types backed by a working playbook are selectable; others are marked &quot;coming soon&quot;
                until their template ships.
              </p>
              <div className="space-y-2">
                {ONBOARDING_RELEASE_TYPES.map((option) => {
                  const available = AVAILABLE_RELEASE_TYPE_SET.has(option.value);
                  const selected = draft.releaseType === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 border bg-bg-elevated px-4 py-3 transition-colors duration-fast ease-standard ${
                        selected
                          ? 'border-brand bg-brand/8'
                          : available
                            ? 'border-stroke-default hover:border-stroke-strong'
                            : 'border-stroke-subtle opacity-60'
                      } ${available ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      <input
                        type="radio"
                        name="release-type"
                        value={option.value}
                        checked={selected}
                        disabled={!available}
                        onChange={() => {
                          if (!available) return;
                          setDraft((current) => ({ ...current, releaseType: option.value }));
                        }}
                        className="h-4 w-4 accent-brand"
                      />
                      <span className="flex-1 text-sm text-content-primary">{option.label}</span>
                      {available ? null : (
                        <span className="text-xs uppercase tracking-[0.14em] text-content-tertiary">
                          Coming soon
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ----- Step 1: where stuck (multi) -------------------------- */}
          {step === 1 ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm leading-relaxed text-content-secondary">
                Select every one that fits. We use this to decide what to put in front of you first — it
                doesn&apos;t lock you in.
              </p>
              <div className="space-y-2">
                {ONBOARDING_WHERE_STUCK_OPTIONS.map((option) => {
                  const checked = draft.whereStuck.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 border bg-bg-elevated px-4 py-3 cursor-pointer transition-colors duration-fast ease-standard ${
                        checked
                          ? 'border-brand bg-brand/8'
                          : 'border-stroke-default hover:border-stroke-strong'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWhereStuck(option.value)}
                        className="h-4 w-4 accent-brand"
                      />
                      <span className="flex-1 text-sm text-content-primary">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ----- Step 2: stage (single) ------------------------------- */}
          {step === 2 ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm leading-relaxed text-content-secondary">
                Pick the stage that matches today. We&apos;ll start your plan from there instead of from
                week one.
              </p>
              <div className="space-y-2">
                {ONBOARDING_STAGE_OPTIONS.map((option) => {
                  const selected = draft.stage === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 border bg-bg-elevated px-4 py-3 cursor-pointer transition-colors duration-fast ease-standard ${
                        selected
                          ? 'border-brand bg-brand/8'
                          : 'border-stroke-default hover:border-stroke-strong'
                      }`}
                    >
                      <input
                        type="radio"
                        name="stage"
                        value={option.value}
                        checked={selected}
                        onChange={() => setDraft((current) => ({ ...current, stage: option.value as OnboardingStage }))}
                        className="h-4 w-4 accent-brand"
                      />
                      <span className="flex-1 text-sm text-content-primary">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ----- Step 3: release details ------------------------------ */}
          {step === 3 ? (
            <div className="mt-5 space-y-5">
              <p className="text-sm leading-relaxed text-content-secondary">
                What&apos;s the release called, and when is it going out?
              </p>
              <label className="block space-y-1.5">
                <span className={labelBase}>Release title</span>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="My Next Single"
                  className={inputBase}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelBase}>Release date</span>
                <input
                  type="date"
                  value={draft.releaseDate}
                  onChange={(event) => setDraft((current) => ({ ...current, releaseDate: event.target.value }))}
                  className={inputBase}
                  required
                />
                <span className="block text-xs text-content-tertiary">
                  Even a working date is fine — you can change it later.
                </span>
              </label>
            </div>
          ) : null}

          {/* ----- Step 4: AI Moment ------------------------------------ */}
          {step === 4 && aiMoment ? (
            <div className="mt-5">
              <div className="border border-brand/30 bg-brand/8 px-4 py-5 sm:px-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                  Your first move
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold leading-snug text-content-primary sm:text-2xl">
                  {aiMoment.task.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-content-secondary">{aiMoment.why}</p>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-content-tertiary">
                    <span>Progress</span>
                    <span>{aiMoment.progressPercent}% — 0 of 1 done</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={aiMoment.progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1 w-full overflow-hidden bg-bg-elevated"
                  >
                    <div
                      className="h-full bg-brand transition-[width] duration-slow ease-standard"
                      style={{ width: `${aiMoment.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {aiMoment.releaseTypeNote ? (
                <p className="mt-4 text-xs leading-relaxed text-content-tertiary">
                  {aiMoment.releaseTypeNote}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ----- Step 5: signup --------------------------------------- */}
          {step === 5 ? (
            <div className="mt-5 space-y-5">
              <p className="text-sm leading-relaxed text-content-secondary">
                Create your account to lock in your release and pick up this task on the other side.
              </p>
              <label className="block space-y-1.5">
                <span className={labelBase}>Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  className={inputBase}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelBase}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={inputBase}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelBase}>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  className={inputBase}
                  required
                />
                <span className="block text-xs text-content-tertiary">At least 6 characters.</span>
              </label>
            </div>
          ) : null}

          {/* ----- Step 6: invite (workspace flag) ---------------------- */}
          {step === 6 ? (
            <div className="mt-5 space-y-5">
              <p className="text-sm leading-relaxed text-content-secondary">
                Optional — bring the people who&apos;ll touch this release with you. We&apos;ll email them
                an invite to join your workspace. You can do this later from Settings.
              </p>
              <div className="space-y-3">
                {inviteRows.map((row, index) => (
                  <div
                    key={row.id}
                    className="border border-stroke-default bg-bg-elevated px-3 py-3 sm:px-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        type="email"
                        value={row.email}
                        onChange={(event) =>
                          updateInviteRow(row.id, {
                            email: event.target.value,
                            status: 'pending',
                            message: '',
                          })
                        }
                        placeholder="teammate@email.com"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className={`${inputBase} sm:flex-1`}
                      />
                      <select
                        value={row.role}
                        onChange={(event) =>
                          updateInviteRow(row.id, {
                            role: event.target.value as InviteRow['role'],
                          })
                        }
                        className={`${inputBase} sm:w-44`}
                      >
                        {INVITE_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {inviteRows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeInviteRow(row.id)}
                          disabled={isFinishing}
                          aria-label={`Remove invite ${index + 1}`}
                          className="inline-flex min-h-11 items-center justify-center border border-stroke-default bg-bg-surface px-3 text-sm text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary disabled:opacity-50 sm:min-h-0 sm:py-2.5"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    {row.status === 'sent' ? (
                      <p className="mt-2 text-xs text-status-success">{row.message}</p>
                    ) : null}
                    {row.status === 'error' ? (
                      <p className="mt-2 text-xs text-status-error">{row.message}</p>
                    ) : null}
                    {row.status === 'sending' ? (
                      <p className="mt-2 text-xs text-content-tertiary">Sending…</p>
                    ) : null}
                  </div>
                ))}
                {inviteRows.length < MAX_INVITE_ROWS ? (
                  <button
                    type="button"
                    onClick={addInviteRow}
                    disabled={isFinishing}
                    className="text-sm font-medium text-brand transition-colors duration-fast ease-standard hover:text-brand-hover disabled:opacity-50"
                  >
                    + Add another
                  </button>
                ) : (
                  <p className="text-xs text-content-tertiary">Maximum {MAX_INVITE_ROWS} invites in onboarding — add more later from Settings.</p>
                )}
              </div>
            </div>
          ) : null}

          {/* Errors + progress messages */}
          {error ? (
            <p role="alert" className="mt-5 border border-status-error/30 bg-status-error/8 px-3 py-2 text-sm text-status-error">
              {error}
            </p>
          ) : null}
          {progressMessage ? (
            <p className="mt-5 text-sm text-content-tertiary">{progressMessage}</p>
          ) : null}

          {/* Footer / nav */}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {step === 6 ? (
              <button
                type="button"
                onClick={() => void handleSkipInvites()}
                disabled={isFinishing}
                className={secondaryButton}
              >
                Skip for now
              </button>
            ) : step > 0 && !accountCreated ? (
              <button type="button" onClick={handleBack} disabled={isSubmitting} className={secondaryButton}>
                Back
              </button>
            ) : (
              <span />
            )}

            {step === 5 ? (
              <button
                type="button"
                onClick={() => void handleCreateAccount()}
                disabled={!canAdvance || isSubmitting}
                className={primaryButton}
              >
                {isSubmitting ? 'Working…' : 'Create account & release'}
              </button>
            ) : step === 6 ? (
              <button
                type="button"
                onClick={() => void handleSendAndFinish()}
                disabled={isFinishing}
                className={primaryButton}
              >
                {isFinishing ? 'Sending…' : 'Send invites & continue'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance || isSubmitting}
                className={primaryButton}
              >
                {step === 4 ? 'Save my workflow' : 'Next'}
              </button>
            )}
          </div>
        </section>

        {/* Skip-to-dashboard escape hatch on the invite step — duplicated
            from the footer so it's also reachable above the fold on mobile,
            and aria-clear that the user is never blocked. */}
        {step === 6 ? (
          <p className="mt-5 text-center text-xs text-content-tertiary">
            You can always invite teammates later from{' '}
            <span className="text-content-secondary">Settings → Teammates</span>.
          </p>
        ) : null}
      </div>
    </main>
  );
}
