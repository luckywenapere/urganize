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
// (SAFE_PATHS) and apps/web/lib/auth-store.ts (SAFE_AUTH_PATHS). AppShell
// renders this route without workspace chrome. (A third allowlist lived in
// useOnboardingWizard.ts's PUBLIC_ROUTE_PREFIXES until that file was deleted
// with FirstTimeOnboardingGate — see URG-191.)
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
//      paywall (otherwise POST /api/releases 402s). SKIPPED when the card trial
//      OR the hard paywall is on: this route 404s under EITHER, and 404 is not
//      in the tolerated {400, 409} set, so an unconditional call would throw and
//      strand the signup. The release POST below still works pre-trial because
//      either the server paywall is off (card-trial path) or the team already
//      has its trial (hard-paywall path). See lib/onboarding-trial.ts.
//   3. POST /api/releases — same path the in-app modal uses. The step-4
//      planning preference maps to the route's `plan` field: template tasks
//      get instantiated via apps/web/lib/release-templates/instantiate.ts,
//      unless the user chose start_from_scratch (→ plan: 'blank', URG-201).
//   4. PATCH /api/user/onboarding { onboardingCompleted: true } — records that
//      this account finished onboarding, plus the three answers that live on
//      the profile rather than the release: planningPreference, whereStuck and
//      stage (the last two since URG-192; before that they were collected and
//      then discarded). (Until 2026-07-29 this PATCH also had to defuse
//      FirstTimeOnboardingGate, a legacy dashboard takeover; that gate is
//      deleted and THIS route is the only onboarding flow — see URG-191.)
//   5a. Workspace flag ON  → advance to step 6 (invite).
//   5b. Workspace flag OFF → finishToDashboard.
//   6. finishToDashboard routes to /start-trial instead of HOME_PATH when the
//      card-trial flag is on — the card+trial page is the first thing after
//      onboarding, for every exit (send invites, skip, workspace-off).
//
// Invite step: each row { email, role } maps to one POST to
// /api/workspace/members/invite (the same endpoint Settings → Teammates uses).
// Send sends every row in parallel; per-row success/failure is rendered
// inline. Skip is always reachable and routes to /dashboard regardless of
// the in-flight state. Failures never block the dashboard.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chappi } from '@urganize/ui';
import { useAuthStore } from '@/lib/auth-store';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { HOME_PATH } from '@/lib/home-path';
import { describeNextBlocker } from '@/lib/onboarding-next-hint';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';
import { ONBOARDING_PLANNING_PREFERENCE_LABELS, type OnboardingPlanningPreference } from '@/lib/onboarding';
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
import { isCardTrialEnabled, shouldRunAuthedOnboardingSetup } from '@/lib/trial-card';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { shouldStartOnboardingTrial } from '@/lib/onboarding-trial';
import { isSocialShareEnabled } from '@/lib/social-share';
import { markPendingFirstShare } from '@/lib/social-share-offer';
import { resolvePostSignupDestination, takePitchIntent } from '@/lib/pitch-intent';
import { takeClaimIntent } from '@/lib/claim-intent';
import { captureReferralFromSearch, reportReferralCode } from '@/lib/referral-intent';
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_HINT, isPasswordLongEnough } from '@/lib/password-rules';

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

// Workspace flag — the invite step exists only when the workspace consolidation
// is active. Same pattern app/dashboard/DashboardPageClient.tsx uses.
const WORKSPACE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// Card-before-trial flag — when on, the no-card trial grant is skipped in the
// hand-off and finishToDashboard lands on /start-trial instead of the
// dashboard (see the Hand-off comment above).
const CARD_TRIAL_ENABLED = isCardTrialEnabled();

// Whether the hand-off should call POST /api/trial/start. That route 404s under
// the card trial AND under the hard paywall, and the hand-off only tolerates
// 400/409 — so calling it under either flag throws and strands the signup
// before the release and welcome email. See lib/onboarding-trial.ts.
const SHOULD_START_LEGACY_TRIAL = shouldStartOnboardingTrial({
  cardTrialEnabled: CARD_TRIAL_ENABLED,
  hardPaywallEnabled: isHardPaywallEnabled(),
});

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
  1: 'Where does a rollout usually fall apart?',
  2: 'Where is this rollout in its lifecycle?',
  3: 'Tell us about this rollout',
  4: 'Your first move',
  5: 'Create your account',
  6: 'Bring your team in',
};

// The "Step N of M" kicker is computed in the render body, not a table:
// authed-setup mode (?setup=1) skips the account step, so both the number and
// the total depend on the mode the wizard is running in.

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

// URG-158: preference captured on step 4 ("Your first move"), right where
// the AI-suggested next task is already on screen. Two options, one
// preselected — see EMPTY_ONBOARDING_DRAFT.planningPreference for why
// 'ai_recommendations' is the default.
const PLANNING_PREFERENCE_OPTIONS: Array<{
  value: OnboardingPlanningPreference;
  label: string;
  helper: string;
}> = [
  {
    value: 'ai_recommendations',
    label: ONBOARDING_PLANNING_PREFERENCE_LABELS.ai_recommendations,
    helper: 'See a suggested next step like the one above, every time you start a rollout.',
  },
  {
    value: 'start_from_scratch',
    label: ONBOARDING_PLANNING_PREFERENCE_LABELS.start_from_scratch,
    helper: 'Skip the suggestions. Your rollout starts blank and you add every activity yourself.',
  },
];

// Onboarding role choice. Matches the two values the standalone /auth signup
// produces. 'artist' fires the ArtistNameGate downstream (AppShell.tsx:59-65)
// when artist_name is blank, so we always collect artistName when this is
// chosen. 'artist-manager' is the default — the same hardcoded value the
// flow used before this picker existed, so unchanged paths behave the same.
type OnboardingRole = 'artist' | 'artist-manager';
const DEFAULT_ONBOARDING_ROLE: OnboardingRole = 'artist-manager';
const ONBOARDING_ROLE_OPTIONS: Array<{ value: OnboardingRole; label: string; helper: string }> = [
  {
    value: 'artist-manager',
    label: 'I manage an artist',
    helper: 'You run rollouts on behalf of the artist (manager, label, agency).',
  },
  {
    value: 'artist',
    label: "I'm the artist",
    helper: 'You are the artist running your own rollouts.',
  },
];

// Google OAuth round-trip persistence.
//
// Email/password signup is single-page: the auth-store call returns inline
// and we run the hand-off (trial → release → onboarding-complete) without
// the user leaving /onboarding. Google OAuth, by contrast, redirects the
// browser to Google, then back to /auth/callback, then to /onboarding — at
// which point the local React state from before the click is gone.
//
// To bridge the round-trip we drop a marker in sessionStorage right before
// calling loginWithGoogle. sessionStorage survives same-tab navigation, so
// the marker is intact when we land back here. On mount we read-and-clear
// the marker; if it was set and the user is now authenticated, we resume
// the same hand-off the email/password path runs — just with the role and
// artistName we captured pre-redirect.
const RESUME_STORAGE_KEY = 'urganize.onboarding.resume_oauth';

// Authed-setup mode (?setup=1) — the card-trial funnel's fix for Google
// signups from /auth, which arrive authenticated but never went through this
// wizard (nothing routed them here; the email funnel STARTS here). Without it
// they were walled at billing before creating anything, while an email signup
// got its release and plan first. With it, every funnel reads the same:
// questions → your release and its plan → billing → the app.
//
// In this mode the account already exists, so step 5 (Create your account) is
// skipped entirely: the wizard runs its questions and then executes the SAME
// hand-off the two signup paths run (release creation + the onboarding PATCH)
// against the session already in hand.
//
// The param is read IMPERATIVELY, once, in the pre-paint layout effect —
// never via useSearchParams. Reading that hook in a statically prerendered
// client component bails the page out to its loading.tsx as its server HTML,
// which is exactly the weak-connection dead end of 2026-08-13 (see "The front
// door is server-rendered" in CLAUDE.md). Both front doors must keep their
// real markup in the initial response.
const AUTHED_SETUP_PARAM = 'setup';

function readAuthedSetupParam(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get(AUTHED_SETUP_PARAM) === '1';
  } catch {
    return false;
  }
}

type OnboardingResumeData = {
  role: OnboardingRole;
  artistName: string;
};

const isOnboardingRole = (value: unknown): value is OnboardingRole =>
  value === 'artist' || value === 'artist-manager';

function readAndClearResumeMarker(): OnboardingResumeData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(RESUME_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<OnboardingResumeData> | null;
    if (!parsed || !isOnboardingRole(parsed.role)) return null;
    return {
      role: parsed.role,
      artistName: typeof parsed.artistName === 'string' ? parsed.artistName : '',
    };
  } catch {
    return null;
  }
}

function writeResumeMarker(data: OnboardingResumeData): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage may be unavailable (private mode). The OAuth path
    // degrades gracefully — without the marker, the resume hand-off
    // skips, the user ends up at /dashboard authenticated but without a
    // first release. They can create one via the in-app modal. Not ideal
    // but not worse than the pre-OAuth state of the world.
  }
}

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

// The ?email= hand-off from /auth's identifier-first flow. Returns '' for
// anything that isn't a plausible email so a mangled or hostile query value
// never lands in the field.
const normalizeHandoffEmail = (search: string): string => {
  const value = (new URLSearchParams(search).get('email') || '').trim().toLowerCase();
  return isEmailValid(value) ? value : '';
};

// ---------------------------------------------------------------------------
// Reused class fragments — kept as constants so every input/button on this
// page looks identical without each call site copying the class soup.
// ---------------------------------------------------------------------------

const cardShell =
  'rounded-2xl border border-stroke-default bg-bg-surface px-5 py-5 sm:px-6 sm:py-6';

const inputBase =
  'block w-full rounded-xl border border-stroke-control bg-bg-elevated px-3 py-2.5 text-base text-content-primary placeholder:text-content-tertiary outline-none transition-colors duration-fast ease-standard focus:border-brand';

const labelBase = 'block text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary';

const primaryButton =
  'motion-press inline-flex min-h-12 items-center justify-center rounded-full bg-content-primary px-6 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

const secondaryButton =
  'motion-press inline-flex min-h-12 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-6 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const signup = useAuthStore((state) => state.signup);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  // Authed-setup mode needs the profile's onboarding_completed + role.
  const user = useAuthStore((state) => state.user);

  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_ONBOARDING_DRAFT);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [step, setStep] = useState<StepIndex>(0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Role + artist name. Drives both the auth-store signup call (email/
  // password path) AND the post-OAuth profile patch (Google path). Default
  // to 'artist-manager' so anyone hitting the previous code path gets the
  // same result as before.
  const [role, setRole] = useState<OnboardingRole>(DEFAULT_ONBOARDING_ROLE);
  const [artistName, setArtistName] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  // Once the account has been created we suppress the "already-signed-in"
  // redirect to /dashboard so the user can finish the invite step on this
  // page instead of being shunted away the moment auth flips.
  const [accountCreated, setAccountCreated] = useState(false);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');

  // OAuth resume state. Set on mount if we detect a sessionStorage marker
  // from a previous loginWithGoogle call. Drives two effects: (1) suppress
  // the bounce-to-/dashboard redirect, (2) trigger the post-OAuth hand-off
  // once isAuthenticated is true. resumeStartedRef prevents the hand-off
  // from being kicked off more than once (the hand-off itself sets state
  // that would otherwise re-fire the effect's dependencies).
  const [resumeData, setResumeData] = useState<OnboardingResumeData | null>(null);
  const resumeStartedRef = useRef(false);

  // Authed-setup mode. Read pre-paint from the URL (see readAuthedSetupParam)
  // and combined with live auth state below — the param alone never grants it.
  const [hasSetupParam, setHasSetupParam] = useState(false);

  const [inviteRows, setInviteRows] = useState<InviteRow[]>(() => [makeInviteRow()]);
  const [isFinishing, setIsFinishing] = useState(false);

  // ---- hydration ---------------------------------------------------------
  // Runs before the first paint (see lib/use-isomorphic-layout-effect.ts) so
  // the server-rendered step 1 is only ever visible to a user who actually
  // belongs on step 1. Everything it touches is storage-guarded, so this
  // cannot throw.
  useIsomorphicLayoutEffect(() => {
    const loaded = loadOnboardingDraft();
    if (loaded.releaseType !== null && !AVAILABLE_RELEASE_TYPE_SET.has(loaded.releaseType)) {
      setDraft({ ...loaded, releaseType: null });
    } else {
      setDraft(loaded);
    }
    // Read-and-clear the OAuth resume marker. If set, we just got back from
    // a Google round-trip and need to finish the hand-off the email/password
    // path runs synchronously. Apply the captured role + artistName to local
    // state too so the UI reflects what the user chose pre-redirect.
    const resume = readAndClearResumeMarker();
    if (resume) {
      setResumeData(resume);
      setRole(resume.role);
      setArtistName(resume.artistName);
      setStep(5);
    }
    // Identifier-first hand-off from /auth: an email with no account arrives
    // as ?email= so the person doesn't retype it at the account step. Read
    // post-mount on purpose — useSearchParams() would knock this page off
    // static server rendering (the /auth front-door trap). Email is local
    // state, not part of the persisted draft, so there is nothing to clash
    // with; the functional set keeps anything already typed.
    // A partner's link carries ?ref=. Remembered here, read post-mount for the
    // same reason as the email above, and handed to the server when signup ends.
    captureReferralFromSearch(window.location.search);
    const handoffEmail = normalizeHandoffEmail(window.location.search);
    if (handoffEmail) {
      setEmail((current) => current || handoffEmail);
    }
    // Authed-setup marker. Read here (pre-paint, imperatively — same reason as
    // the email hand-off above) so the redirect-suppression below has it on
    // the first committed render; an effect-ordered read would let the
    // bounce-home effect fire first and eject the very user this mode exists
    // to serve.
    setHasSetupParam(readAuthedSetupParam());
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    saveOnboardingDraft(draft);
  }, [draft, hasHydrated]);

  // Authed-setup: a signed-in account that never finished onboarding, sent
  // here deliberately (?setup=1) so it gets its release and plan before
  // billing. The param alone is not enough — the account must really be
  // un-onboarded, or a stale link would re-run the wizard for someone who
  // already finished (see shouldRunAuthedOnboardingSetup).
  const isAuthedSetup = shouldRunAuthedOnboardingSetup({
    enabled: CARD_TRIAL_ENABLED,
    hasSetupParam,
    isAuthLoading,
    isAuthenticated,
    onboardingCompleted: user?.onboarding_completed,
    role: user?.role,
  });

  // If the user is already signed in BEFORE starting onboarding, send them
  // home. Once the onboarding flow has created an account (accountCreated),
  // we're mid-OAuth-resume, or we're in authed-setup mode, we let them stay
  // on /onboarding to finish the hand-off instead of being shunted away the
  // moment auth flips.
  //
  // hasHydrated gates the whole effect: the setup param is read pre-paint but
  // lands in state, so acting before hydration completes would bounce an
  // authed-setup visitor on the first render — the one user who must stay.
  useEffect(() => {
    if (!hasHydrated) return;
    if (
      !isAuthLoading &&
      isAuthenticated &&
      !isSubmitting &&
      !accountCreated &&
      !resumeData &&
      !isAuthedSetup
    ) {
      router.replace(HOME_PATH);
    }
  }, [
    isAuthenticated,
    isAuthLoading,
    isSubmitting,
    accountCreated,
    resumeData,
    isAuthedSetup,
    hasHydrated,
    router,
  ]);

  // ---- step gating -------------------------------------------------------
  const canAdvance = useMemo(() => {
    if (step === 0) return isReleaseTypeAvailable(draft.releaseType);
    if (step === 1) return draft.whereStuck.length > 0;
    if (step === 2) return Boolean(draft.stage);
    if (step === 3) return draft.title.trim().length > 0 && isReleaseDateValid(draft.releaseDate);
    if (step === 4) return true;
    if (step === 5) {
      // Email/password path requires all three fields plus, if the user
      // picked 'artist', an artistName. The Google button is gated
      // separately and bypasses the email/password requirement.
      const hasEmailPasswordFields = Boolean(name.trim() && email.trim() && isPasswordLongEnough(password));
      const hasRequiredArtistName = role !== 'artist' || artistName.trim().length > 0;
      return hasEmailPasswordFields && hasRequiredArtistName;
    }
    // Step 6 (invite) intentionally has no gate — Skip is always reachable.
    if (step === 6) return true;
    return false;
  }, [draft, name, email, password, role, artistName, step]);

  // What the main button is waiting for, in a sentence, shown beside it. A
  // disabled button that does not say why is a button people tap and abandon.
  const nextHint = describeNextBlocker({
    step,
    releaseTypeAvailable: isReleaseTypeAvailable(draft.releaseType),
    whereStuckCount: draft.whereStuck.length,
    hasStage: Boolean(draft.stage),
    hasTitle: draft.title.trim().length > 0,
    dateValid: isReleaseDateValid(draft.releaseDate),
    hasName: Boolean(name.trim()),
    hasEmail: Boolean(email.trim()),
    passwordLongEnough: isPasswordLongEnough(password),
    needsArtistName: role === 'artist',
    hasArtistName: artistName.trim().length > 0,
  });
  const nextHintId = !canAdvance && nextHint ? 'onboarding-next-hint' : undefined;

  // Google button has its own gate — doesn't require name/email/password
  // (Google provides those) but DOES require a complete draft and the
  // artist-name field when role='artist' (we still need to write it).
  const canStartGoogle = useMemo(() => {
    if (!isReleaseTypeAvailable(draft.releaseType)) return false;
    if (!draft.title.trim() || !isReleaseDateValid(draft.releaseDate)) return false;
    if (role === 'artist' && !artistName.trim()) return false;
    return true;
  }, [draft, role, artistName]);

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
    // Best-effort — if the PATCH fails the user still reaches their
    // workspace; we just keep the draft (below) so the answers aren't lost.
    let persisted = false;
    if (token) {
      const response = await fetch('/api/user/onboarding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          onboardingCompleted: true,
          onboardingStep: 5,
          onboardingPlanningPreference: draft.planningPreference,
          // URG-192: these two were collected and then thrown away for the
          // whole life of this flow. They go to the server now.
          onboardingWhereStuck: draft.whereStuck,
          onboardingStage: draft.stage,
        }),
      }).catch(() => undefined);
      persisted = Boolean(response?.ok);
    }
    // Tell the server which partner's link this person came in through, now
    // that their team exists. A no-op unless a code was remembered.
    if (token) await reportReferralCode(token);
    await checkAuth({ force: true });
    // Only drop the draft once the server has the answers. If the PATCH
    // failed, leaving sessionStorage intact is strictly better than wiping
    // it — the answers survive for a retry instead of being destroyed, which
    // is the bug URG-192 exists to fix.
    if (persisted) {
      clearOnboardingDraft();
    }
    // Where they land, decided in one pure place so the ORDER is checkable
    // rather than a reading of one line inside this file. Card trial first
    // (money), then a curator whose public page sent them here, then the
    // ordinary landing. One line still covers every exit into this tail (send
    // invites, skip, workspace-off, invite-token fallbacks).
    router.replace(
      resolvePostSignupDestination({
        cardTrialEnabled: CARD_TRIAL_ENABLED,
        cardTrialPath: '/start-trial',
        pitchCuratorSlug: takePitchIntent(),
        claimToken: takeClaimIntent(),
        homePath: HOME_PATH,
      })
    );
  };

  // Trial → release → onboarding-complete chain. Runs the same SQL writes
  // regardless of which auth path got us here (email/password or Google).
  // Caller is responsible for setting accountCreated=true and providing a
  // valid access token (already in the supabase session).
  const runPostSignupHandoff = async (accessToken: string) => {
    // 1. Start the 28-day trial so the next call passes the paywall.
    // 400/409 are tolerable: a trial was already used / paid status, in
    // which case we let /api/releases be the arbiter.
    // Skipped when the card trial OR the hard paywall is on: /api/trial/start
    // 404s under either (the card trial starts on /start-trial; the hard paywall
    // grants a team trial at team creation), and a 404 isn't tolerated below, so
    // calling it would throw and strand the signup before the release POST and
    // the welcome email. The release POST still works pre-trial because either
    // the server paywall is off (card-trial path) or the team already has its
    // trial (hard-paywall path). See lib/onboarding-trial.ts.
    if (SHOULD_START_LEGACY_TRIAL) {
      setProgressMessage('Starting your trial...');
      const trialResponse = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!trialResponse.ok && trialResponse.status !== 400 && trialResponse.status !== 409) {
        const trialPayload = (await trialResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(trialPayload.error || 'Could not start your trial.');
      }
    }

    // 2. Create the real release. The step-4 planning preference decides the
    // plan: 'template' instantiates the rollout plan server-side; 'blank'
    // (start_from_scratch) creates an empty release the user builds up
    // themself — the same `plan` contract CreateReleaseModal uses (URG-201:
    // before this, the preference was recorded on the profile but the
    // release was always created with the full template).
    setProgressMessage('Setting up your first rollout...');
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
        plan: draft.planningPreference === 'start_from_scratch' ? 'blank' : 'template',
      }),
    });
    const releasePayload = (await releaseResponse.json().catch(() => ({}))) as {
      release?: { id?: string };
      releaseId?: string;
      firstRelease?: boolean;
      error?: string;
    };
    if (!releaseResponse.ok) {
      throw new Error(releasePayload.error || 'Could not create your rollout.');
    }

    // Share to socials (2026-09-23): this is where most people's first
    // rollout is made, but the share sheet lives in the app, and onboarding
    // still has the invite step and a redirect to get through. So it leaves a
    // marker in this tab, and the sheet offers itself once they land and
    // nothing else is open. The server's answer decides, not a guess here.
    const createdReleaseId = releasePayload.releaseId ?? releasePayload.release?.id;
    if (isSocialShareEnabled() && releasePayload.firstRelease === true && createdReleaseId) {
      markPendingFirstShare(createdReleaseId);
    }

    // 3a. If the workspace flag is OFF, mark complete + ship to dashboard.
    // 3b. If ON, advance to the invite step. The PATCH to mark onboarding
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
      // Pass the chosen role + artistName so the signup result matches
      // what standalone /auth signup would produce. The auth-store handler
      // already updates artist_name when role='artist' (auth-store.ts:423).
      const trimmedArtistName = role === 'artist' ? artistName.trim() : undefined;
      await signup(
        email.trim().toLowerCase(),
        password,
        name.trim(),
        role,
        trimmedArtistName
      );
      setAccountCreated(true);
      const accessToken = await getAccessToken();
      await runPostSignupHandoff(accessToken);
    } catch (handoffError) {
      setError(errorMessage(handoffError, 'Could not finish creating your team.'));
      setProgressMessage('');
      setIsSubmitting(false);
    }
  };

  // Authed-setup's terminal action on step 4, standing in for "Create account
  // & release": the account already exists, so this runs the hand-off (release
  // + plan, then the onboarding PATCH) against the session in hand and lands
  // on /start-trial via finishToDashboard. Deliberately reuses
  // runPostSignupHandoff rather than reimplementing it — one hand-off means
  // the wizard cannot produce a different result for Google than for email.
  const handleAuthedSetupFinish = async () => {
    if (!draft.releaseType) {
      setError('Please complete the previous steps.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    // Suppresses the bounce-home effect for the rest of this flow: the PATCH
    // inside the hand-off flips onboarding_completed to true, which would
    // otherwise end authed-setup mode mid-run and eject the user before
    // finishToDashboard's own redirect lands.
    setAccountCreated(true);
    setProgressMessage('Setting up your first rollout...');
    try {
      const accessToken = await getAccessToken();
      await runPostSignupHandoff(accessToken);
    } catch (handoffError) {
      setError(errorMessage(handoffError, 'Could not finish setting up your team.'));
      setProgressMessage('');
      setIsSubmitting(false);
    }
  };

  // Kick off Google OAuth signup. We persist role + artistName to
  // sessionStorage so the post-OAuth resume effect can apply them and run
  // the same hand-off the email/password path runs. The browser then leaves
  // /onboarding → Google → /auth/callback → back to /onboarding, where the
  // resume effect picks up. NOTE: validation here is intentionally stricter
  // than canAdvance — we re-check the whole draft because canStartGoogle
  // gates the button independently of the email/password fields.
  const handleGoogleSignup = async () => {
    if (!canStartGoogle || !draft.releaseType) {
      setError('Please complete the previous steps.');
      return;
    }

    setError('');
    setIsGoogleRedirecting(true);
    setProgressMessage('Redirecting to Google...');
    try {
      writeResumeMarker({
        role,
        artistName: role === 'artist' ? artistName.trim() : '',
      });
      // loginWithGoogle redirects the browser via supabase.auth.signInWithOAuth.
      // After the function awaits, the redirect should have been triggered
      // — but Supabase resolves the promise BEFORE the redirect actually
      // navigates, so we don't proceed to anything else on this code path.
      await loginWithGoogle('/onboarding');
    } catch (oauthError) {
      // OAuth init failed before the browser left the page. Clear the
      // marker so a subsequent email/password attempt doesn't accidentally
      // think it's resuming.
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(RESUME_STORAGE_KEY);
      }
      setError(errorMessage(oauthError, 'Could not start Google sign-in.'));
      setProgressMessage('');
      setIsGoogleRedirecting(false);
    }
  };

  // Resume hand-off after Google OAuth returns. Fires when we land back on
  // /onboarding with resumeData populated (from sessionStorage) and the
  // auth-store has settled into the authenticated state. The ref guard
  // ensures we only fire once per mount even though several state writes
  // inside the hand-off would otherwise re-trigger the effect.
  useEffect(() => {
    if (!resumeData) return;
    if (isAuthLoading) return;
    if (!isAuthenticated) return;
    if (resumeStartedRef.current) return;
    resumeStartedRef.current = true;

    const resumeRole = resumeData.role;
    const resumeArtistName = resumeData.artistName;

    void (async () => {
      setError('');
      setIsSubmitting(true);
      setAccountCreated(true);
      setProgressMessage('Setting up your account...');

      try {
        const accessToken = await getAccessToken();

        // /auth/callback upserts profiles with ignoreDuplicates:true, so a
        // brand-new Google user ends up with role='artist-manager' from
        // the callback's default. Patch it to what the user actually chose.
        // Existing users (rare path — they'd have hit /dashboard already)
        // skip this if their stored role already matches.
        const profileUpdate: Record<string, unknown> = {
          role: resumeRole,
          updated_at: new Date().toISOString(),
        };
        if (resumeRole === 'artist' && resumeArtistName) {
          profileUpdate.artist_name = resumeArtistName;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) {
          throw new Error('Could not read session after Google sign-in.');
        }
        const { error: updateError } = await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', userId);
        if (updateError) {
          // Don't hard-fail on the role write — the user can still use the
          // app at the default role. Log and continue so the release does
          // get created.
          console.warn('[onboarding] Could not write chosen role:', updateError.message);
        }
        await checkAuth({ force: true });

        await runPostSignupHandoff(accessToken);
      } catch (handoffError) {
        setError(errorMessage(handoffError, 'Could not finish setting up your team.'));
        setProgressMessage('');
        setIsSubmitting(false);
      } finally {
        // Clear the snapshot regardless of outcome so the marker doesn't
        // hang around if the user retries.
        setResumeData(null);
      }
    })();
    // Note: runPostSignupHandoff and checkAuth aren't in the dep array
    // because the resumeStartedRef guard means this effect only does work
    // once per mount; further re-renders that change those identities
    // bail before reaching the async block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeData, isAuthenticated, isAuthLoading]);

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

  // No loading gate here, deliberately (bug report, 2026-08-12: a user on a
  // weak mobile connection sat on a bare "Loading…" screen and could not sign
  // up at all). This page used to render nothing but that word until the
  // client bundle hydrated, which made the whole signup entrance dependent on
  // ~10 JS chunks all arriving: one dropped request, a content blocker, or any
  // throw during hydration left a permanent dead end with no error and no
  // retry — there are no error boundaries in this app to catch it. Step 1 is a
  // plain radio list over static template data and needs neither storage nor
  // auth, so it is server-rendered and hydration only upgrades it. Restoring a
  // saved draft happens pre-paint above, so returning users still skip it.

  // ---- render ------------------------------------------------------------
  // Authed-setup skips the account step, so it has one step fewer: the
  // questions (0–4) plus the invite step when the workspace flag is on. The
  // progress bar and the "Step N of M" kicker both read from these so they
  // cannot disagree with the flow the user is actually walking.
  const visibleTotalSteps = isAuthedSetup ? TOTAL_STEPS - 1 : TOTAL_STEPS;
  // Step 6 (invite) sits one slot earlier in authed-setup's counting because
  // step 5 never renders; every question step counts as itself.
  const visibleStepNumber = isAuthedSetup && step === 6 ? 6 : step + 1;
  const stepKicker = `Step ${visibleStepNumber} of ${visibleTotalSteps}`;

  return (
    <main className="relative min-h-screen text-content-primary">
      {/* Ikat bleed (NEXT_PUBLIC_FEATURE_TEXTILE) — warp-dyed vertical bands
          fading out before they reach the wizard's own content. Inert with the
          flag off; this page is `○ Static` and nothing here changes that. */}
      <div className="urg-ground-ikat" aria-hidden="true" />
      <div className="urg-above mx-auto w-full max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 md:max-w-2xl">
        {/* Brand / title. Chappi introduces himself here and nowhere else in
            the flow (mascot brief, 2026-08-30) — he sits beside the greeting
            on the first screen and does not follow the user through the
            questions.

            The signup line no longer says "workspace". The model sheet bans
            the word outright ("that word stays out of anything a customer
            reads"), and the rule binds every string rendered next to him, so
            putting him here forced the fix. Both branches now say the same
            true thing; the authed-setup branch already did. */}
        <div className="mb-6 flex items-start gap-4 sm:mb-8">
          {step === 0 ? <Chappi pose="idle" size={96} className="-mt-2" /> : null}
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Urganize
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold leading-tight text-content-primary sm:text-3xl">
              Welcome aboard
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-content-secondary">
              A few questions and your first rollout is ready.
            </p>
          </div>
        </div>

        {/* Signing up needs JavaScript. Say so instead of leaving the user
            tapping a Next button that silently does nothing. */}
        <noscript>
          <p className="mb-6 border border-status-warning/40 bg-bg-surface px-4 py-3 text-sm leading-relaxed text-content-secondary">
            Signing up needs JavaScript switched on. If you are using a content
            blocker or private-browsing restrictions, turn them off for
            urganize.app and reload this page.
          </p>
        </noscript>

        {/* Progress bar — TOTAL_STEPS thin segments */}
        <div
          className="mb-6 flex items-center gap-1.5 sm:mb-8"
          aria-label={`Onboarding progress, step ${visibleStepNumber} of ${visibleTotalSteps}`}
        >
          {Array.from({ length: visibleTotalSteps }).map((_, index) => (
            <span
              key={index}
              className={`h-1 flex-1 transition-colors duration-base ease-standard ${
                index < visibleStepNumber ? 'bg-brand' : 'bg-stroke-default'
              }`}
            />
          ))}
        </div>

        {/* Step container */}
        <section className={`${cardShell} animate-fade-in`} aria-labelledby="onboarding-step-heading">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {stepKicker}
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
                Pick the kind of rollout you are planning first. You can add more artists and more
                rollouts later.
              </p>
              <div role="radiogroup" aria-labelledby="onboarding-step-heading" className="space-y-2">
                {ONBOARDING_RELEASE_TYPES.map((option) => {
                  const available = AVAILABLE_RELEASE_TYPE_SET.has(option.value);
                  const selected = draft.releaseType === option.value;
                  return (
                    <label
                      key={option.value}
                      aria-disabled={!available || undefined}
                      className={`flex items-center gap-3 rounded-xl border bg-bg-elevated px-4 py-3 transition-colors duration-fast ease-standard ${
                        selected
                          ? 'border-brand bg-brand/8'
                          : available
                            ? 'border-stroke-default hover:border-stroke-strong'
                            : 'border-stroke-subtle opacity-60'
                      }`}
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
                Select every one that fits. We use this to decide what to put in front of you first. It
                doesn&apos;t lock you in.
              </p>
              <div role="group" aria-labelledby="onboarding-step-heading" className="space-y-2">
                {ONBOARDING_WHERE_STUCK_OPTIONS.map((option) => {
                  const checked = draft.whereStuck.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 rounded-xl border bg-bg-elevated px-4 py-3 transition-colors duration-fast ease-standard ${
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
                      className={`flex items-center gap-3 rounded-xl border bg-bg-elevated px-4 py-3 transition-colors duration-fast ease-standard ${
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
                What&apos;s the rollout called, and when is the release date?
              </p>
              <label className="block space-y-1.5">
                <span className={labelBase}>Title</span>
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
                  Even a working date is fine. You can change it later.
                </span>
              </label>
            </div>
          ) : null}

          {/* ----- Step 4: AI Moment ------------------------------------ */}
          {step === 4 && aiMoment ? (
            <div className="mt-5">
              <div className="rounded-2xl border border-brand/30 bg-brand/8 px-4 py-5 sm:px-5">
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
                    <span>{aiMoment.progressPercent}% · 0 of 1 done</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={aiMoment.progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    // stroke-strong, not bg-bg-elevated (2026-08-04, founder
                    // contrast fix) — same bug as the workspace Motion bars:
                    // bg-bg-elevated is a materials/layering token, not a
                    // meter-track color, and reads as nearly invisible
                    // against the surrounding background in both themes.
                    className="h-1.5 w-full overflow-hidden bg-stroke-strong"
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

              {/* URG-158: one-time planning preference, captured right where
                  the value of an AI-suggested next step is already visible. */}
              <fieldset className="mt-6 space-y-2">
                <legend className={labelBase}>How do you want to plan rollouts?</legend>
                <div className="space-y-2">
                  {PLANNING_PREFERENCE_OPTIONS.map((option) => {
                    const selected = draft.planningPreference === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 rounded-xl border bg-bg-elevated px-4 py-3 transition-colors duration-fast ease-standard ${
                          selected
                            ? 'border-brand bg-brand/8'
                            : 'border-stroke-default hover:border-stroke-strong'
                        }`}
                      >
                        <input
                          type="radio"
                          name="onboarding-planning-preference"
                          value={option.value}
                          checked={selected}
                          onChange={() => setDraft((current) => ({ ...current, planningPreference: option.value }))}
                          className="mt-0.5 h-4 w-4 accent-brand"
                        />
                        <span className="flex-1">
                          <span className="block text-sm text-content-primary">{option.label}</span>
                          <span className="mt-1 block text-xs text-content-tertiary">{option.helper}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          ) : null}

          {/* ----- Step 5: signup --------------------------------------- */}
          {step === 5 ? (
            <div className="mt-5 space-y-5">
              <p className="text-sm leading-relaxed text-content-secondary">
                Create your account to lock in your rollout and pick up this task on the other side.
              </p>

              {/* Role picker — at the top because it changes which fields
                  render below (artistName only for 'artist'). Same two
                  values the standalone /auth signup uses, so downstream
                  gates (ArtistNameGate in AppShell) treat the result
                  identically. */}
              <fieldset className="space-y-2">
                <legend className={labelBase}>Who are you?</legend>
                <div className="space-y-2">
                  {ONBOARDING_ROLE_OPTIONS.map((option) => {
                    const selected = role === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 rounded-xl border bg-bg-elevated px-4 py-3 transition-colors duration-fast ease-standard ${
                          selected
                            ? 'border-brand bg-brand/8'
                            : 'border-stroke-default hover:border-stroke-strong'
                        }`}
                      >
                        <input
                          type="radio"
                          name="onboarding-role"
                          value={option.value}
                          checked={selected}
                          onChange={() => setRole(option.value)}
                          className="mt-0.5 h-4 w-4 accent-brand"
                        />
                        <span className="flex-1">
                          <span className="block text-sm text-content-primary">{option.label}</span>
                          <span className="mt-1 block text-xs text-content-tertiary">
                            {option.helper}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Artist name. Required when role='artist' to satisfy the
                  ArtistNameGate downstream; otherwise hidden because the
                  manager role has no use for an account-level artist name. */}
              {role === 'artist' ? (
                <label className="block space-y-1.5">
                  <span className={labelBase}>Your artist name</span>
                  <input
                    type="text"
                    value={artistName}
                    onChange={(event) => setArtistName(event.target.value)}
                    placeholder="e.g. Tems"
                    autoComplete="off"
                    className={inputBase}
                    required
                  />
                  <span className="block text-xs text-content-tertiary">
                    Used across the app. Change later in Settings.
                  </span>
                </label>
              ) : null}

              {/* Google sign-in. Disabled when the draft or role-specific
                  fields aren't ready; clicking redirects through Google +
                  /auth/callback and resumes the hand-off on return. */}
              <div>
                <button
                  type="button"
                  onClick={() => void handleGoogleSignup()}
                  disabled={!canStartGoogle || isGoogleRedirecting || isSubmitting}
                  className="w-full inline-flex items-center justify-center gap-3 border border-stroke-default bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGoogleRedirecting ? (
                    'Redirecting…'
                  ) : (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>
                {!canStartGoogle ? (
                  <p className="mt-2 text-xs text-content-tertiary">
                    {role === 'artist' && !artistName.trim()
                      ? 'Add your artist name above to continue with Google.'
                      : 'Complete the previous steps to continue with Google.'}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-stroke-default" />
                <span className="text-xs uppercase tracking-[0.18em] text-content-tertiary">
                  Or with email
                </span>
                <div className="h-px flex-1 bg-stroke-default" />
              </div>

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
                  minLength={MIN_PASSWORD_LENGTH}
                  className={inputBase}
                  required
                />
                <span className="block text-xs text-content-tertiary">{PASSWORD_LENGTH_HINT}</span>
              </label>
            </div>
          ) : null}

          {/* ----- Step 6: invite (workspace flag) ---------------------- */}
          {step === 6 ? (
            <div className="mt-5 space-y-5">
              <p className="text-sm leading-relaxed text-content-secondary">
                Optional. Bring the people who&apos;ll touch this rollout with you. We&apos;ll email them
                an invite to join your team. You can do this later from Settings.
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
                      <p role="alert" className="mt-2 text-xs text-status-error">{row.message}</p>
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
                  <p className="text-xs text-content-tertiary">Maximum {MAX_INVITE_ROWS} invites in onboarding. Add more later from Settings.</p>
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
          {nextHintId ? (
            <p id={nextHintId} className="mt-5 text-sm text-content-secondary">
              {nextHint}
            </p>
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
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting || isGoogleRedirecting}
                className={secondaryButton}
              >
                Back
              </button>
            ) : (
              <span />
            )}

            {step === 5 ? (
              <button
                type="button"
                onClick={() => void handleCreateAccount()}
                disabled={!canAdvance || isSubmitting || isGoogleRedirecting}
                aria-describedby={nextHintId}
                className={primaryButton}
              >
                {isSubmitting ? 'Working…' : 'Create account & rollout'}
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
            ) : isAuthedSetup && step === 4 ? (
              // Authed-setup: step 4 is the last question, since the account
              // already exists and step 5 is skipped. This button does what
              // "Create account & release" does for a signup — creates the
              // release and its plan, then hands off to billing.
              <button
                type="button"
                onClick={() => void handleAuthedSetupFinish()}
                disabled={!canAdvance || isSubmitting}
                aria-describedby={nextHintId}
                className={primaryButton}
              >
                {isSubmitting ? 'Working…' : 'Create my rollout'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance || isSubmitting}
                aria-describedby={nextHintId}
                className={primaryButton}
              >
                {step === 4 ? 'Continue' : 'Next'}
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
