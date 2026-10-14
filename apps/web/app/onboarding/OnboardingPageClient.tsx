'use client';

// Onboarding flow — Phases 1–3, reworked for URG-251 + URG-274 (2026-10-14).
//
// The steps and their order live in lib/onboarding-steps.ts (a list, walked by
// Next/Back, because several steps are conditional). After one screen in front
// of them all:
//
//   -  who are you (URG-262, 2026-10-14): one tap, saved as
//      onboarding_persona and, for the new account, profiles.role. Rendered
//      while `personaOpen` is true rather than as a numbered step, so every
//      step index below (and the URG-251 plan that refers to them) is unchanged.
//   0  what are you working on
//   1  where are you stuck
//   2  where in lifecycle
//   3  release details (title + date + artist name — the artist since
//      2026-10-11, so the planner that opens next never asks for it)
//   4  AI Moment (deterministic — apps/web/lib/onboarding-ai-moment.ts)
//   5  plan preview, week by week (read-only, client-side from the playbook;
//      only for people who did NOT choose start_from_scratch)
//   6  "Stay on top of your next move": push + email toggles, both OFF;
//      push permission asked only on the toggle tap (lib/onboarding-optin.ts)
//   7  create account (+ optional referral code)       ← anonymous → authenticated
//   8  paywall: "Start my free trial" (3-day team trial, no card; no skip)
//   9  welcome to Urganize (once per user)
//  10  invite teammates (workspace flag only)          ← Skip always reaches the rollout (URG-274)
//
// Steps 5, 6, 8, 9 and the referral field are NEXT_PUBLIC_FEATURE_ONBOARDING_V2
// (on unless set to 'false').
//
// Landing (2026-10-11, first-user flow): every exit now goes to the rollout
// onboarding created (/dashboard?release=<id>) and, when that rollout is
// waiting to be planned, opens the planner on it with the type, date and
// artist already answered, and (since the readiness merge, same day) what is
// already done, so the first plan asks three questions. The rest of
// that first session stays quiet (no share sheet, tours or install card); see
// lib/first-session.ts. The "Tell people it's coming" share offer moves to
// Home on the next visit.
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
import {
  ONBOARDING_PERSONA_CHOICES,
  ONBOARDING_PERSONA_LABELS,
  ONBOARDING_PLANNING_PREFERENCE_LABELS,
  profileRoleForPersona,
  type OnboardingPersona,
  type OnboardingPlanningPreference,
} from '@/lib/onboarding';
import {
  EMPTY_ONBOARDING_DRAFT,
  MAX_ONBOARDING_ARTIST_NAME_LENGTH,
  ONBOARDING_RELEASE_TYPES,
  ONBOARDING_WHERE_STUCK_OPTIONS,
  type OnboardingDraft,
  type OnboardingReleaseType,
  type OnboardingWhereStuck,
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from '@/lib/onboarding-draft';
import { getOnboardingAiMoment } from '@/lib/onboarding-ai-moment';
import {
  ONBOARDING_READY_OPTIONS,
  deriveOnboardingStage,
  toggleOnboardingReadyItem,
} from '@/lib/onboarding-readiness';
import type { ReadyItem } from '@/lib/release-planning';
import { getAvailableReleaseTypes } from '@/lib/release-templates/loader';
import { isCardTrialEnabled, shouldRunAuthedOnboardingSetup } from '@/lib/trial-card';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { shouldStartOnboardingTrial } from '@/lib/onboarding-trial';
import { isSocialShareEnabled } from '@/lib/social-share';
import {
  markOnboardingPlannerHandoff,
  onboardingLandingPath,
  startFirstSession,
} from '@/lib/first-session';
import {
  ONBOARDING_ALMOST_THERE_AFTER_MS,
  ONBOARDING_PROGRESS_NOTE,
  inviteStepButtonLabels,
  onboardingProgressMessage,
} from '@/lib/onboarding-progress';
import { resolvePostSignupDestination, takePitchIntent } from '@/lib/pitch-intent';
import { takeClaimIntent } from '@/lib/claim-intent';
import { readWelcomeIntent } from '@/lib/welcome-intent';
import { captureReferralFromSearch, reportReferralCode } from '@/lib/referral-intent';
import { captureSignupSourceFromSearch, reportSignupSource } from '@/lib/signup-source-intent';
import {
  readReferralCode,
  rememberTypedReferralCode,
  judgeTypedReferralCode,
} from '@/lib/referral-intent';
import { isReferralsEnabled } from '@/lib/referrals';
import {
  ONBOARDING_STEP,
  ONBOARDING_STEP_TITLES,
  firstStepAfterAccount,
  isOnboardingV2Enabled,
  isPostAccountStep,
  lastQuestionStep,
  nextOnboardingStep,
  onboardingStepKicker,
  onboardingStepSequence,
  previousOnboardingStep,
  type OnboardingStepIndex,
} from '@/lib/onboarding-steps';
import {
  attachOptInChoices,
  clearOptInChoices,
  readOptInChoices,
  saveMarketingEmailConsent,
} from '@/lib/onboarding-optin';
import { enablePush, getNotificationPermission } from '@/lib/push';
import { enableNativePush, getNativePushPermission, isNativePushAvailable } from '@/lib/native-push';
import { hasSeenWelcome, markWelcomeSeen } from '@/lib/onboarding-welcome';
import { markOnboardingInviteSkipped } from '@/lib/invite-gate';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { OnboardingPlanPreview } from '@/components/onboarding/OnboardingPlanPreview';
import { OnboardingOptInStep } from '@/components/onboarding/OnboardingOptInStep';
import { OnboardingPaywall } from '@/components/onboarding/OnboardingPaywall';
import { OnboardingWelcome } from '@/components/onboarding/OnboardingWelcome';
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

type StepIndex = OnboardingStepIndex;

// URG-251 + URG-274 (2026-10-14): the preview, opt-in, referral field, paywall
// and welcome screen. On unless NEXT_PUBLIC_FEATURE_ONBOARDING_V2 is 'false'.
const ONBOARDING_V2 = isOnboardingV2Enabled();
// The new paywall replaces nothing under the retired card trial, which has its
// own card-first page; with that flag off (production) it is the paywall.
const PAYWALL_ENABLED = ONBOARDING_V2 && !CARD_TRIAL_ENABLED;
// The referral field feeds the partner-code path, so it shows only when that
// path is on (otherwise a typed code would go nowhere).
const REFERRAL_FIELD_ENABLED = ONBOARDING_V2 && isReferralsEnabled();
const NATIVE_PUSH_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NATIVE_PUSH === 'true';
// The opt-in hand-over never holds the sign-up up for longer than this.
const OPT_IN_ATTACH_TIMEOUT_MS = 6000;

const PERSONA_TITLE = 'Who are you?';

// "What's already done?" (step 2) is asked once, here, since 2026-10-11: the
// planner's own readiness question, handed to the planner so it does not ask
// again. Titles live with the step list in lib/onboarding-steps.ts.
const STEP_TITLES: Record<StepIndex, string> = ONBOARDING_STEP_TITLES;

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

// The account role, derived from the persona answer (URG-262). It used to be
// a two-option picker on the account step ("I manage an artist" / "I'm the
// artist"); the first screen's "Who are you?" asks the same thing earlier and
// with more answers, so the picker is gone. 'artist' still fires the
// ArtistNameGate downstream (AppShell) when artist_name is blank, and the
// artist name is asked of everyone on step 3. 'artist-manager' stays the
// default for an answer that maps to no role ("Other"), the value the flow
// always used.
type OnboardingRole = 'artist' | 'artist-manager' | 'manager';
const DEFAULT_ONBOARDING_ROLE: OnboardingRole = 'artist-manager';
const roleForPersona = (persona: OnboardingPersona | null): OnboardingRole =>
  profileRoleForPersona(persona) ?? DEFAULT_ONBOARDING_ROLE;

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
  value === 'artist' || value === 'artist-manager' || value === 'manager';

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
  // URG-262: "Who are you?" shows first, until it is answered. True on the
  // server render so the first screen a slow connection paints is the real
  // first question; the pre-paint hydration below closes it for a draft that
  // already has an answer, and for a Google round trip coming back.
  const [personaOpen, setPersonaOpen] = useState(true);
  // Role drives both the auth-store signup call (email/password path) AND the
  // post-OAuth profile patch (Google path). Derived from the persona answer.
  const role: OnboardingRole = roleForPersona(draft.persona);
  // The artist name lives on the draft since 2026-10-11 (asked on step 3 for
  // everyone, sent with the release). The account step reads it from there.
  const artistName = draft.artistName;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  // Once the account has been created we suppress the "already-signed-in"
  // redirect to /dashboard so the user can finish the invite step on this
  // page instead of being shunted away the moment auth flips.
  const [accountCreated, setAccountCreated] = useState(false);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  // URG-251 Part 1: optional referral code on the account step, prefilled from
  // a remembered ?ref= link. Invalid shows one calm line and never blocks.
  const [referralInput, setReferralInput] = useState('');
  const [referralInvalid, setReferralInvalid] = useState(false);
  // The paywall's and the welcome screen's own buttons, while they move on.
  const [postAccountBusy, setPostAccountBusy] = useState(false);
  // Whether this account has already seen the welcome (per user, localStorage).
  const [welcomeAlreadySeen, setWelcomeAlreadySeen] = useState(false);

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
  // Which invite-step exit is running, so each button says its own word
  // ("Sending…" for send, "Continuing…" for skip).
  const [finishing, setFinishing] = useState<'send' | 'skip' | null>(null);
  const isFinishing = finishing !== null;

  // The rollout the hand-off created, kept in a ref so finishToDashboard can
  // read it in the same tick it was set (the workspace-off path calls it
  // straight from the hand-off, before any re-render).
  const createdReleaseRef = useRef<{ id: string; plannerPending: boolean; firstRelease: boolean } | null>(
    null
  );
  // Guards the create step against a second tap or a resumed effect running
  // the hand-off twice. State alone is a render late.
  const handoffRunningRef = useRef(false);
  const almostThereTimerRef = useRef<number | null>(null);

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
    if (loaded.persona) setPersonaOpen(false);
    // Read-and-clear the OAuth resume marker. If set, we just got back from
    // a Google round-trip and need to finish the hand-off the email/password
    // path runs synchronously. Apply the captured role + artistName to local
    // state too so the UI reflects what the user chose pre-redirect.
    const resume = readAndClearResumeMarker();
    if (resume) {
      setResumeData(resume);
      setPersonaOpen(false);
      // The draft (sessionStorage) normally survives the Google round trip
      // with the artist in it; the marker's copy only fills a gap.
      if (resume.artistName) {
        setDraft((current) =>
          current.artistName ? current : { ...current, artistName: resume.artistName }
        );
      }
      setStep(ONBOARDING_STEP.account);
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
    // ...and prefills the optional referral field on the account step.
    if (REFERRAL_FIELD_ENABLED) {
      const remembered = readReferralCode();
      if (remembered) setReferralInput((current) => current || remembered);
    }
    // A public profile's call to action carries ?from=profile (never ?ref=,
    // which is a partner code). Remembered the same way, reported at the end.
    captureSignupSourceFromSearch(window.location.search);
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

  // While the account and rollout are being created, leaving the page would
  // strand a half-made account, so the browser asks first. Only during that
  // work (the create step), never on the invite step or anywhere else.
  const creatingAccount = isSubmitting && !isPostAccountStep(step);
  useEffect(() => {
    if (!creatingAccount) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need a returnValue to show their own prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [creatingAccount]);

  useEffect(
    () => () => {
      if (almostThereTimerRef.current) window.clearTimeout(almostThereTimerRef.current);
    },
    []
  );

  // Authed-setup: a signed-in account that never finished onboarding, sent
  // here deliberately (?setup=1) so it gets its release and plan before
  // billing. The param alone is not enough — the account must really be
  // un-onboarded, or a stale link would re-run the wizard for someone who
  // already finished (see shouldRunAuthedOnboardingSetup).
  const isAuthedSetup = shouldRunAuthedOnboardingSetup({
    // Also on with onboarding v2 (Oct 14, 2026): /auth/callback now sends a
    // brand-new Google sign-up here (?setup=1) even with the card trial off.
    enabled: CARD_TRIAL_ENABLED || ONBOARDING_V2,
    hasSetupParam,
    isAuthLoading,
    isAuthenticated,
    onboardingCompleted: user?.onboarding_completed,
    role: user?.role,
  });

  // The steps this person walks, in order (lib/onboarding-steps.ts). Next and
  // Back walk this list; "Step N of M" is a position in it.
  const startFromScratch = draft.planningPreference === 'start_from_scratch';
  const sequence = useMemo(
    () =>
      onboardingStepSequence({
        workspaceEnabled: WORKSPACE_ENABLED,
        authedSetup: isAuthedSetup,
        startFromScratch,
        paywallEnabled: PAYWALL_ENABLED,
        welcomeEnabled: ONBOARDING_V2 && !welcomeAlreadySeen,
        previewEnabled: ONBOARDING_V2,
        optInEnabled: ONBOARDING_V2,
      }),
    [isAuthedSetup, startFromScratch, welcomeAlreadySeen]
  );
  const LAST_STEP = sequence[sequence.length - 1];
  const TOTAL_STEPS = sequence.length;

  // Read once per account, not on every render: the welcome step marks itself
  // seen as it hands over, and must not drop out of the list under its own feet.
  useEffect(() => {
    setWelcomeAlreadySeen(hasSeenWelcome(user?.id));
  }, [user?.id]);

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
    // "None of it yet" is a real answer; nothing ticked is not.
    if (step === 2) return draft.readyToday.length > 0;
    if (step === 3)
      return (
        draft.title.trim().length > 0 &&
        isReleaseDateValid(draft.releaseDate) &&
        draft.artistName.trim().length > 0
      );
    if (step === ONBOARDING_STEP.firstMove) return true;
    // The preview and the opt-in never block: both toggles may stay off.
    if (step === ONBOARDING_STEP.preview || step === ONBOARDING_STEP.optIn) return true;
    if (step === ONBOARDING_STEP.account) {
      // Email/password path requires all three fields plus, if the user
      // picked 'artist', an artistName. The Google button is gated
      // separately and bypasses the email/password requirement.
      const hasEmailPasswordFields = Boolean(name.trim() && email.trim() && isPasswordLongEnough(password));
      const hasRequiredArtistName = role !== 'artist' || artistName.trim().length > 0;
      return hasEmailPasswordFields && hasRequiredArtistName;
    }
    // The paywall and the welcome screen move on with their own buttons, and
    // the invite step intentionally has no gate — Skip is always reachable.
    if (
      step === ONBOARDING_STEP.paywall ||
      step === ONBOARDING_STEP.welcome ||
      step === ONBOARDING_STEP.invite
    )
      return true;
    return false;
  }, [draft, name, email, password, role, artistName, step]);

  // What the main button is waiting for, in a sentence, shown beside it. A
  // disabled button that does not say why is a button people tap and abandon.
  const nextHint = describeNextBlocker({
    step,
    releaseTypeAvailable: isReleaseTypeAvailable(draft.releaseType),
    whereStuckCount: draft.whereStuck.length,
    hasStage: draft.readyToday.length > 0,
    hasTitle: draft.title.trim().length > 0,
    dateValid: isReleaseDateValid(draft.releaseDate),
    hasReleaseArtist: draft.artistName.trim().length > 0,
    hasName: Boolean(name.trim()),
    hasEmail: Boolean(email.trim()),
    passwordLongEnough: isPasswordLongEnough(password),
    needsArtistName: role === 'artist',
    hasArtistName: artistName.trim().length > 0,
  });
  const nextHintId = !canAdvance && nextHint ? 'onboarding-next-hint' : undefined;

  // Google button has its own gate — doesn't require name/email/password
  // (Google provides those) but DOES require a complete draft, artist name
  // included (asked on the rollout step for every role since 2026-10-11).
  const canStartGoogle = useMemo(() => {
    if (!isReleaseTypeAvailable(draft.releaseType)) return false;
    if (!draft.title.trim() || !isReleaseDateValid(draft.releaseDate)) return false;
    if (!draft.artistName.trim()) return false;
    return true;
  }, [draft]);

  const aiMoment = useMemo(() => getOnboardingAiMoment(draft), [draft]);

  const handleNext = () => {
    if (!canAdvance) return;
    setError('');
    if (step === ONBOARDING_STEP.optIn) {
      const choices = readOptInChoices();
      captureAnalyticsEvent({
        name: 'onboarding_optin_choices',
        properties: { push: choices?.push === true, email: choices?.email === true },
      });
    }
    const next = step === LAST_STEP ? null : nextOnboardingStep(sequence, step);
    if (next !== null) setStep(next);
  };


  const handleBack = () => {
    setError('');
    // After signup we don't allow stepping back — the account already
    // exists and there's nothing meaningful to revise from this side.
    if (accountCreated) return;
    if (step === 0) {
      setPersonaOpen(true);
      return;
    }
    const previous = previousOnboardingStep(sequence, step);
    if (previous !== null) setStep(previous);
  };

  // One tap answers and moves on (URG-262: "one tap, no extra words").
  const handlePickPersona = (persona: OnboardingPersona) => {
    setError('');
    setDraft((current) => ({ ...current, persona }));
    setPersonaOpen(false);
  };

  // "None of it yet" is exclusive of the rest; the stage is derived, not asked.
  const toggleReadyItem = (item: ReadyItem) => {
    setDraft((current) => {
      const readyToday = toggleOnboardingReadyItem(current.readyToday, item);
      return { ...current, readyToday, stage: deriveOnboardingStage(readyToday) };
    });
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
      // The answers and the referral report do not depend on each other, so
      // they go together (2026-10-11): one round trip of waiting, not two.
      const referral = reportReferralCode(token);
      // And whether a public profile or a claim link sent them (profile growth).
      const signupSource = reportSignupSource(token);
      const response = await fetch('/api/user/onboarding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          onboardingCompleted: true,
          onboardingStep: 5,
          // URG-262: who they are, and for this brand-new account the role
          // that follows from it (replacing Google's 'artist-manager'
          // fallback; the server never overwrites a role an invite gave).
          ...(draft.persona ? { onboardingPersona: draft.persona, applyPersonaToRole: true } : {}),
          onboardingPlanningPreference: draft.planningPreference,
          // URG-192: these two were collected and then thrown away for the
          // whole life of this flow. They go to the server now.
          onboardingWhereStuck: draft.whereStuck,
          onboardingStage: draft.stage,
        }),
      }).catch(() => undefined);
      persisted = Boolean(response?.ok);
      // Tell the server which partner's link this person came in through, now
      // that their team exists. A no-op unless a code was remembered.
      await Promise.all([referral, signupSource]);
    }
    await checkAuth({ force: true });
    // Only drop the draft once the server has the answers. If the PATCH
    // failed, leaving sessionStorage intact is strictly better than wiping
    // it — the answers survive for a retry instead of being destroyed, which
    // is the bug URG-192 exists to fix.
    if (persisted) {
      clearOnboardingDraft();
    }
    // The first session (lib/first-session.ts): land on the rollout just made,
    // open the planner on it when it is waiting for a plan, keep everything
    // else quiet until the next visit, and hold the first-rollout share offer
    // for Home on that visit.
    const created = createdReleaseRef.current;
    if (created) {
      startFirstSession({
        releaseId: created.id,
        shareReleaseId: isSocialShareEnabled() && created.firstRelease ? created.id : null,
      });
      if (created.plannerPending) {
        const type = draft.releaseType;
        markOnboardingPlannerHandoff({
          releaseId: created.id,
          ...(type === 'single' || type === 'ep' || type === 'album' ? { releaseType: type } : {}),
          ...(isReleaseDateValid(draft.releaseDate) ? { releaseDate: draft.releaseDate } : {}),
          ...(draft.artistName.trim() ? { artistName: draft.artistName.trim() } : {}),
          // Asked once in onboarding, so the planner skips "What's already done?".
          ...(draft.readyToday.length ? { readyToday: draft.readyToday } : {}),
        });
      }
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
        welcomeToken: readWelcomeIntent(),
        // The new rollout (and its planner) rather than Home, 2026-10-11.
        homePath: onboardingLandingPath(created?.id, HOME_PATH),
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
    setProgressMessage(onboardingProgressMessage('rollout', draft.title));
    // A slow server still gets a later line, so the screen never sits on one
    // sentence long enough to look frozen.
    if (almostThereTimerRef.current) window.clearTimeout(almostThereTimerRef.current);
    almostThereTimerRef.current = window.setTimeout(() => {
      almostThereTimerRef.current = null;
      setProgressMessage(onboardingProgressMessage('almost', draft.title));
    }, ONBOARDING_ALMOST_THERE_AFTER_MS);
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
        // Stored on the rollout (and as the team's artist when it is new), so
        // the planner's artist question is answered before it is asked.
        artistName: draft.artistName.trim().slice(0, MAX_ONBOARDING_ARTIST_NAME_LENGTH),
        source: 'onboarding',
        plan: draft.planningPreference === 'start_from_scratch' ? 'blank' : 'template',
      }),
    });
    const releasePayload = (await releaseResponse.json().catch(() => ({}))) as {
      release?: { id?: string };
      releaseId?: string;
      firstRelease?: boolean;
      plannerPending?: boolean;
      error?: string;
    };
    if (almostThereTimerRef.current) {
      window.clearTimeout(almostThereTimerRef.current);
      almostThereTimerRef.current = null;
    }
    if (!releaseResponse.ok) {
      throw new Error(releasePayload.error || 'Could not create your rollout.');
    }

    // Remembered for finishToDashboard, which lands on this rollout and opens
    // its planner. Share to socials (2026-09-23) used to leave a pending
    // marker here so the "Tell people it's coming" sheet opened on arrival;
    // since 2026-10-11 that offer waits for Home on the NEXT visit instead
    // (founder call), recorded by startFirstSession. The server's answer
    // decides whether it is a first rollout, not a guess here.
    const createdReleaseId = releasePayload.releaseId ?? releasePayload.release?.id;
    createdReleaseRef.current = createdReleaseId
      ? {
          id: createdReleaseId,
          plannerPending: releasePayload.plannerPending === true,
          firstRelease: releasePayload.firstRelease === true,
        }
      : null;

    // 3. Hand the opt-in choices to the new account (URG-251 Part 2): the
    // push subscription (only when the person's tap already got permission)
    // and the email answer. Bounded, so a slow service worker never holds the
    // sign-up up.
    if (ONBOARDING_V2) {
      setProgressMessage(onboardingProgressMessage('almost', draft.title));
      await attachOnboardingOptIn(accessToken);
    }

    // 4a. Nothing left after the account (no paywall, welcome or invite step):
    // mark complete + ship to the rollout.
    // 4b. Otherwise go to the first of them. The PATCH to mark onboarding
    // complete happens in finishToDashboard, called from the last of them.
    const after = firstStepAfterAccount(sequence);
    if (after === null) {
      setProgressMessage(onboardingProgressMessage('almost', draft.title));
      await finishToDashboard(accessToken);
      return;
    }

    setProgressMessage('');
    setIsSubmitting(false);
    handoffRunningRef.current = false;
    setStep(after);
  };

  const attachOnboardingOptIn = async (accessToken: string) => {
    const native = NATIVE_PUSH_ENABLED && isNativePushAvailable();
    const attach = attachOptInChoices(readOptInChoices(), {
      getPermission: () =>
        native ? getNativePushPermission() : Promise.resolve(getNotificationPermission()),
      enablePush: () => (native ? enableNativePush() : enablePush()),
      saveEmailConsent: (consent) => saveMarketingEmailConsent(accessToken, consent),
    })
      .then(() => clearOptInChoices())
      .catch(() => undefined);
    await Promise.race([
      attach,
      new Promise<void>((resolve) => window.setTimeout(resolve, OPT_IN_ATTACH_TIMEOUT_MS)),
    ]);
  };

  // After the account: "Start my free trial" on the paywall, then "Let's go"
  // on the welcome screen. Each moves to the next step, or finishes.
  const continueAfterAccountStep = async (from: StepIndex) => {
    if (postAccountBusy) return;
    const next = nextOnboardingStep(sequence, from);
    if (next !== null) {
      setError('');
      setStep(next);
      return;
    }
    setPostAccountBusy(true);
    let token: string | null = null;
    try {
      token = await getAccessToken();
    } catch {
      token = null;
    }
    await finishToDashboard(token);
  };

  const handleStartTrial = () => {
    // The 3-day team trial (no card) began when the team was created, so this
    // records nothing server-side; the paywall saved their plan choice.
    void continueAfterAccountStep(ONBOARDING_STEP.paywall);
  };

  const handleWelcomeGo = () => {
    markWelcomeSeen(user?.id);
    void continueAfterAccountStep(ONBOARDING_STEP.welcome);
  };

  // The typed (or prefilled) referral code goes into the same store a ?ref=
  // link uses, and reportReferralCode attaches it once the team exists. A
  // malformed code says so in one line and sign-up carries on regardless.
  const rememberReferralField = () => {
    if (!REFERRAL_FIELD_ENABLED) return;
    const verdict = rememberTypedReferralCode(referralInput);
    setReferralInvalid(verdict.kind === 'invalid');
    if (verdict.kind === 'invalid') {
      captureAnalyticsEvent({ name: 'onboarding_referral_invalid', properties: {} });
    }
  };

  const handleCreateAccount = async () => {
    if (!canAdvance || !draft.releaseType) {
      setError('Please complete the previous steps.');
      return;
    }

    // One run at a time: a second tap while the first is still creating the
    // account would try to sign up twice.
    if (handoffRunningRef.current) return;
    handoffRunningRef.current = true;
    rememberReferralField();
    setError('');
    setIsSubmitting(true);
    setProgressMessage(onboardingProgressMessage('account', draft.title));

    try {
      // Pass the chosen role + artistName so the signup result matches
      // what standalone /auth signup would produce. The auth-store handler
      // already updates artist_name when role='artist' (auth-store.ts:423).
      // The name is asked of everyone since 2026-10-11 (step 3); a manager's
      // goes into the account's metadata only, which the release route reads
      // as its default artist.
      const trimmedArtistName = artistName.trim() || undefined;
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
      handoffRunningRef.current = false;
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
    if (handoffRunningRef.current) return;
    handoffRunningRef.current = true;
    setError('');
    setIsSubmitting(true);
    // Suppresses the bounce-home effect for the rest of this flow: the PATCH
    // inside the hand-off flips onboarding_completed to true, which would
    // otherwise end authed-setup mode mid-run and eject the user before
    // finishToDashboard's own redirect lands.
    setAccountCreated(true);
    setProgressMessage(onboardingProgressMessage('rollout', draft.title));
    try {
      const accessToken = await getAccessToken();
      await runPostSignupHandoff(accessToken);
    } catch (handoffError) {
      setError(errorMessage(handoffError, 'Could not finish setting up your team.'));
      setProgressMessage('');
      setIsSubmitting(false);
      handoffRunningRef.current = false;
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
    // Stored in localStorage, so the code survives the Google round trip.
    rememberReferralField();
    setIsGoogleRedirecting(true);
    setProgressMessage('Redirecting to Google...');
    try {
      writeResumeMarker({
        role,
        artistName: artistName.trim(),
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
      handoffRunningRef.current = true;
      setProgressMessage(onboardingProgressMessage('account', draft.title));

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
        handoffRunningRef.current = false;
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
    if (finishing) return;
    setFinishing('send');
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
      markOnboardingInviteSkipped();
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
    if (finishing) return;
    setFinishing('skip');
    setError('');
    // URG-274: skipping here also keeps the in-app invite gate away for its
    // skip window, so a brand-new account reaches its plan with zero invites.
    markOnboardingInviteSkipped();
    captureAnalyticsEvent({ name: 'onboarding_invite_skipped', properties: {} });
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
  // "Who are you?" (URG-262) is the first slot, so everything counts one on.
  // Both come from the step list, so a skipped step (the preview for a
  // start-from-scratch person, the account step in authed-setup) is never
  // counted. TOTAL_STEPS is the list's length; the persona slot adds one.
  const kicker = onboardingStepKicker(sequence, personaOpen ? 'persona' : step);
  const visibleTotalSteps = TOTAL_STEPS + 1;
  const visibleStepNumber = kicker.number;
  const stepKicker = `Step ${visibleStepNumber} of ${visibleTotalSteps}`;
  // The paywall and the welcome screen carry their own heading and button.
  const ownsItsScreen = !personaOpen && (step === ONBOARDING_STEP.paywall || step === ONBOARDING_STEP.welcome);
  const authedSetupFinishStep = lastQuestionStep(sequence);
  const inviteLabels = inviteStepButtonLabels(finishing);

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
          {personaOpen || step === 0 ? <Chappi pose="idle" size={96} className="-mt-2" /> : null}
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
            className={
              ownsItsScreen
                ? 'sr-only'
                : 'mt-1 font-display text-xl font-semibold leading-tight text-content-primary sm:text-2xl'
            }
          >
            {personaOpen ? PERSONA_TITLE : STEP_TITLES[step]}
          </h2>

          {/* ----- Who are you? (URG-262) -------------------------------- */}
          {personaOpen ? (
            <div role="group" aria-labelledby="onboarding-step-heading" className="mt-5 space-y-2">
              {ONBOARDING_PERSONA_CHOICES.map((persona) => {
                const selected = draft.persona === persona;
                return (
                  <button
                    key={persona}
                    type="button"
                    onClick={() => handlePickPersona(persona)}
                    aria-pressed={selected}
                    className={`motion-focus motion-press flex w-full items-center rounded-xl border bg-bg-elevated px-4 py-3 text-left text-sm text-content-primary transition-colors duration-fast ease-standard ${
                      selected ? 'border-brand bg-brand/8' : 'border-stroke-default hover:border-stroke-strong'
                    }`}
                  >
                    {ONBOARDING_PERSONA_LABELS[persona]}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* ----- Step 0: release type --------------------------------- */}
          {step === 0 && !personaOpen ? (
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

          {/* ----- Step 2: what's already done (multi) ----------------- */}
          {step === 2 ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm leading-relaxed text-content-secondary">
                Tick everything that&apos;s finished. Your plan marks it done and starts from there.
              </p>
              <div role="group" aria-labelledby="onboarding-step-heading" className="space-y-2">
                {ONBOARDING_READY_OPTIONS.map((option) => {
                  const checked = draft.readyToday.includes(option.value);
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
                        onChange={() => toggleReadyItem(option.value)}
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
                What&apos;s the rollout called, when is the release date, and who is the artist?
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
              <label className="block space-y-1.5">
                <span className={labelBase}>Artist name</span>
                <input
                  type="text"
                  value={draft.artistName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      artistName: event.target.value.slice(0, MAX_ONBOARDING_ARTIST_NAME_LENGTH),
                    }))
                  }
                  placeholder="e.g. Tems"
                  autoComplete="off"
                  maxLength={MAX_ONBOARDING_ARTIST_NAME_LENGTH}
                  className={inputBase}
                  required
                />
                <span className="block text-xs text-content-tertiary">
                  The artist this rollout is for. You or the artist you manage.
                </span>
              </label>
            </div>
          ) : null}

          {/* ----- Step 4: AI Moment ------------------------------------ */}
          {step === ONBOARDING_STEP.firstMove && aiMoment ? (
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

          {/* ----- Step 5: plan preview (read-only) --------------------- */}
          {step === ONBOARDING_STEP.preview ? (
            <OnboardingPlanPreview
              releaseType={draft.releaseType}
              releaseDate={draft.releaseDate}
              title={draft.title}
            />
          ) : null}

          {/* ----- Step 6: push + email opt-in (both off) -------------- */}
          {step === ONBOARDING_STEP.optIn ? (
            <OnboardingOptInStep authed={isAuthedSetup} getToken={getAccessToken} />
          ) : null}

          {/* ----- Step 7: signup --------------------------------------- */}
          {step === ONBOARDING_STEP.account ? (
            <div className="mt-5 space-y-5">
              <p className="text-sm leading-relaxed text-content-secondary">
                Create your account to lock in your rollout and pick up this task on the other side.
              </p>

              {/* The artist name moved to the rollout step (2026-10-11) and is
                  asked of everyone there, so an 'artist' account already has
                  it by now: signup writes it to the profile, which keeps the
                  ArtistNameGate in AppShell satisfied. */}

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
                    Complete the previous steps to continue with Google.
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
          {/* Optional referral code (URG-251 Part 1). Applies to Google and
              email alike, so it sits below both. Never blocks sign-up. */}
          {step === ONBOARDING_STEP.account && REFERRAL_FIELD_ENABLED ? (
            <label className="mt-5 block space-y-1.5">
              <span className={labelBase}>Referral code</span>
              <input
                type="text"
                value={referralInput}
                onChange={(event) => {
                  setReferralInput(event.target.value);
                  if (referralInvalid) setReferralInvalid(false);
                }}
                onBlur={() => setReferralInvalid(judgeTypedReferralCode(referralInput).kind === 'invalid')}
                placeholder="Optional"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={40}
                className={inputBase}
              />
              {referralInvalid ? (
                <span className="block text-xs text-content-tertiary">
                  That code doesn&apos;t look right. You can still sign up without it.
                </span>
              ) : null}
            </label>
          ) : null}

          {/* ----- Step 8: paywall (no skip, no close) ----------------- */}
          {step === ONBOARDING_STEP.paywall ? (
            <OnboardingPaywall
              persona={draft.persona}
              whereStuck={draft.whereStuck}
              startFromScratch={startFromScratch}
              busy={postAccountBusy}
              onStartTrial={handleStartTrial}
            />
          ) : null}

          {/* ----- Step 9: welcome (once) ------------------------------ */}
          {step === ONBOARDING_STEP.welcome ? (
            <OnboardingWelcome busy={postAccountBusy} onGo={handleWelcomeGo} />
          ) : null}

          {/* ----- Step 10: invite (workspace flag; skippable, URG-274) -- */}
          {step === ONBOARDING_STEP.invite ? (
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
            <div className="mt-5" role="status" aria-live="polite">
              <p className="text-sm text-content-secondary">{progressMessage}</p>
              {isSubmitting ? (
                <p className="mt-1 text-xs text-content-tertiary">{ONBOARDING_PROGRESS_NOTE}</p>
              ) : null}
            </div>
          ) : null}
          {nextHintId && !personaOpen ? (
            <p id={nextHintId} className="mt-5 text-sm text-content-secondary">
              {nextHint}
            </p>
          ) : null}

          {/* Footer / nav. None on "Who are you?": a tap is the answer. None
              on the paywall or the welcome screen either: each has one button. */}
          {personaOpen || ownsItsScreen ? null : (
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {step === ONBOARDING_STEP.invite ? (
              <button
                type="button"
                onClick={() => void handleSkipInvites()}
                disabled={isFinishing}
                className={secondaryButton}
              >
                {inviteLabels.skip}
              </button>
            ) : !accountCreated ? (
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

            {step === ONBOARDING_STEP.account ? (
              <button
                type="button"
                onClick={() => void handleCreateAccount()}
                disabled={!canAdvance || isSubmitting || isGoogleRedirecting}
                aria-describedby={nextHintId}
                className={primaryButton}
              >
                {isSubmitting ? 'Working…' : 'Create account & rollout'}
              </button>
            ) : step === ONBOARDING_STEP.invite ? (
              <button
                type="button"
                onClick={() => void handleSendAndFinish()}
                disabled={isFinishing}
                className={primaryButton}
              >
                {inviteLabels.send}
              </button>
            ) : isAuthedSetup && step === authedSetupFinishStep ? (
              // Authed-setup: the last question step (the opt-in, or "Your
              // first move" with v2 off), since the account already exists and
              // the account step is skipped. This button does what "Create
              // account & rollout" does for a signup — creates the rollout and
              // its plan, then hands off to billing.
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
                {step === ONBOARDING_STEP.optIn
                  ? 'Let’s go'
                  : step === ONBOARDING_STEP.firstMove || step === ONBOARDING_STEP.preview
                    ? 'Continue'
                    : 'Next'}
              </button>
            )}
          </div>
          )}
        </section>

        {/* Skip-to-dashboard escape hatch on the invite step — duplicated
            from the footer so it's also reachable above the fold on mobile,
            and aria-clear that the user is never blocked. */}
        {step === ONBOARDING_STEP.invite ? (
          <p className="mt-5 text-center text-xs text-content-tertiary">
            You can always invite teammates later from{' '}
            <span className="text-content-secondary">Settings → Teammates</span>.
          </p>
        ) : null}
      </div>
    </main>
  );
}
