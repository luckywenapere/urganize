'use client';

// Onboarding: account, team, then the first music (#854, 29 Oct 2026; Oyin
// approved the mocks in docs/mocks/onboarding-team/). Four screens for a new
// team, two for an invited teammate, where there used to be thirteen:
//
//   S1  Create your account   Google, or name + email + password. Nothing is
//                             asked before the account, so nothing has to
//                             survive the Google round trip.
//   S2  Your team             An invite to this email comes first (one-tap
//                             Join cards). Otherwise "Set up your team": the
//                             name, prefilled "{First name}'s Team", and who
//                             the team is for.
//   S3  Ask to be invited     "I'm joining someone's team": the WhatsApp ask,
//                             their email, a pasted link, and a check every
//                             20 seconds that turns into a Join card.
//   S4  New project           Stage first, then artist, kind, a name and that
//                             stage's fields. Early stages save as a record in
//                             the making, Ready and Already out as a rollout.
//   S5  The landing           The record or the rollout, then the trial sheet
//                             (components/onboarding/OnboardingTrialSheet.tsx).
//
// The rules are pure in lib/onboarding-flow.ts. The server side is
// app/api/onboarding/* and POST /api/releases (which now takes the team).
//
// Kept from before: the Google OAuth round trip (it lands back here, signed
// in), ?setup=1 for an account with no team (any signed-in account that has
// not finished is served the team screen now), email confirmation (Check your
// inbox; the confirm link comes back here through /auth/callback), the
// referral code (behind "Have a referral code?"), closed sign-up (the
// invite-only notice, and /locked for a held account) and curator accounts
// (never the wizard).
//
// Front door rule: this page is statically server-rendered and must keep its
// real markup in the first response (the weak-connection dead end of
// 2026-08-13), so the URL is read imperatively after mount, never through
// useSearchParams.

import { AppleSignInButton } from '@/components/auth/AppleSignInButton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { HOME_PATH, resolveHomePath } from '@/lib/home-path';
import { errorMessage } from '@/lib/errors';
import { captureAnalyticsEvent, getOnboardingElapsedSeconds, markOnboardingStarted } from '@/lib/analytics/client';
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_HINT, isPasswordLongEnough } from '@/lib/password-rules';
import { describeNextBlocker } from '@/lib/onboarding-next-hint';
import { InviteOnlyNotice } from '@/components/access/InviteOnlyNotice';
import { checkEmailAccess, readAccessIntent, redeemPendingAccess } from '@/lib/access-intent';
import { readWelcomeIntent } from '@/lib/welcome-intent';
import {
  clearPendingConfirmation,
  firstNameOf as confirmationFirstName,
  readPendingConfirmation,
  writePendingConfirmation,
} from '@/lib/email-confirmation';
import { CheckInbox } from '@/components/auth/EmailConfirmation';
import {
  captureReferralFromSearch,
  judgeTypedReferralCode,
  readReferralCode,
  rememberTypedReferralCode,
  reportReferralCode,
} from '@/lib/referral-intent';
import { captureSignupSourceFromSearch, reportSignupSource } from '@/lib/signup-source-intent';
import { reportSourceLinkSignup } from '@/lib/source-links';
import { isReferralsEnabled } from '@/lib/referrals';
import { markOnboardingPlannerHandoff, onboardingLandingPath, startFirstSession } from '@/lib/first-session';
import { recordHref } from '@/lib/artist-page';
import { lagosToday } from '@/lib/next-records';
import {
  buildMusicSubmission,
  decideAfterJoin,
  decideOnboardingScreen,
  defaultTeamName,
  invitePollDelay,
  INVITE_POLL_LONG_WAIT_MS,
  whoForFromPersona,
  type MusicForm,
  type OnboardingTeamState,
  type TeamInvite,
  type TeamRole,
  type TeamWhoFor,
} from '@/lib/onboarding-flow';
import { writeOnboardingLanding } from '@/lib/onboarding-landing';
import { TEAM_TRIAL_DAYS } from '@/lib/team-billing';
import { getTeamAccessClient } from '@/lib/team-billing-client';
import {
  GoogleMark,
  OnboardingFrame,
  SignupSplitFrame,
  errorTextClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  textLinkClass,
} from '@/components/onboarding/OnboardingFrame';
import {
  AskInviteScreen,
  InvitesScreen,
  SetupTeamScreen,
  TeamLoadingScreen,
} from '@/components/onboarding/OnboardingTeamScreens';
import {
  NewProjectScreen,
  clearSavedMusicForm,
  type NewProjectSubmitState,
} from '@/components/onboarding/NewProjectScreen';

type Screen = 'account' | 'invite_only' | 'check_inbox' | 'team_loading' | 'invites' | 'setup' | 'ask' | 'music' | 'leaving';

const REFERRAL_FIELD_ENABLED = isReferralsEnabled();
/** "I'm joining someone's team" is remembered, so closing the app brings them back to the ask. */
const LAST_CHOICE_KEY = 'urganize.onboarding.team-choice';
/** Set before the Google round trip, only to report how the account was made. */
const GOOGLE_STARTED_KEY = 'urganize.onboarding.google';
/** On bad data the team screen does not wait for the invite check forever. */
const TEAM_CHECK_TIMEOUT_MS = 6000;
const ONBOARDING_DONE_STEP = 3;

const isEmailValid = (value: string): boolean => /\S+@\S+\.\S+/.test(value.trim());

function readLastChoice(): 'ask' | 'setup' | null {
  try {
    const value = window.localStorage.getItem(LAST_CHOICE_KEY);
    return value === 'ask' || value === 'setup' ? value : null;
  } catch {
    return null;
  }
}

function writeLastChoice(value: 'ask' | 'setup' | null): void {
  try {
    if (value) window.localStorage.setItem(LAST_CHOICE_KEY, value);
    else window.localStorage.removeItem(LAST_CHOICE_KEY);
  } catch {
    // Only a convenience.
  }
}

/** Every onboarding event carries the seconds since onboarding_started (#854 analytics). */
// onboarding_team_viewed fires once per page life: the check-failed fallback,
// a late answer and the background re-check can all reach the team screen.
let teamViewedTracked = false;

function track(event: Parameters<typeof captureAnalyticsEvent>[0]): void {
  if (event.name === 'onboarding_team_viewed') {
    if (teamViewedTracked) return;
    teamViewedTracked = true;
  }
  const seconds = getOnboardingElapsedSeconds();
  const properties = { ...(event.properties as Record<string, unknown>) };
  if (seconds !== null) properties.seconds_since_start = seconds;
  captureAnalyticsEvent({ ...event, properties } as Parameters<typeof captureAnalyticsEvent>[0]);
}

const isNetworkError = (error: unknown): boolean =>
  error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);

export default function OnboardingPage() {
  const router = useRouter();
  const signup = useAuthStore((state) => state.signup);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const logout = useAuthStore((state) => state.logout);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);

  const [screen, setScreen] = useState<Screen>('account');
  const [hydrated, setHydrated] = useState(false);

  // S1
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralOpen, setReferralOpen] = useState(false);
  // The missing-answer line waits for the first keystroke, so a fresh form
  // does not open on "Add your name." like a telling-off.
  const [accountTouched, setAccountTouched] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [referralInvalid, setReferralInvalid] = useState(false);
  const [creating, setCreating] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [accountError, setAccountError] = useState<{ kind: 'taken' } | { kind: 'message'; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ email: string; sentAt: number; firstName: string } | null>(null);
  const [entry, setEntry] = useState<'auth' | 'homepage'>('homepage');

  // S2 / S3
  const [teamState, setTeamState] = useState<OnboardingTeamState | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState('');
  const [arrived, setArrived] = useState(false);
  const [askStartedAt, setAskStartedAt] = useState<number | null>(null);
  const [longWait, setLongWait] = useState(false);
  const [askStatus, setAskStatus] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');

  // S4
  const [joinedRole, setJoinedRole] = useState<TeamRole | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [submit, setSubmit] = useState<NewProjectSubmitState>({ kind: 'idle' });

  const flowStartedRef = useRef(false);
  const screenRef = useRef<Screen>('account');
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // ── Hydration: read the URL once, before paint ─────────────────────────────
  useIsomorphicLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    captureReferralFromSearch(window.location.search);
    captureSignupSourceFromSearch(window.location.search);
    if (REFERRAL_FIELD_ENABLED) {
      const remembered = readReferralCode();
      if (remembered) {
        setReferralInput(remembered);
        setReferralOpen(true);
      }
    }
    const handoff = (params.get('email') || '').trim().toLowerCase();
    if (isEmailValid(handoff)) {
      setEmail(handoff);
      setEntry('auth');
      // Part of the form is filled in for them, so the disabled button says
      // what is still missing from the start ("Add your name.").
      setAccountTouched(true);
      // Closed sign-up: stop an invite-less email here, before the form.
      void checkEmailAccess(handoff).then((allowed) => {
        if (!allowed) setScreen('invite_only');
      });
    }
    const pending = readPendingConfirmation();
    if (pending?.kind === 'onboarding') {
      if (params.get('change') === '1') {
        if (pending.firstName) setName(pending.firstName);
        setEmail((current) => current || pending.email);
        setAccountTouched(true);
      } else if (!handoff) {
        setConfirmation({ email: pending.email, sentAt: pending.sentAt, firstName: pending.firstName || '' });
        setScreen('check_inbox');
      }
    }
    setHydrated(true);
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || '';
    if (!token) throw new Error('Your session ended. Log in again.');
    return token;
  }, []);

  // ── Team state ────────────────────────────────────────────────────────────
  const fetchTeamState = useCallback(async (): Promise<OnboardingTeamState> => {
    const token = await getToken();
    const response = await fetch('/api/onboarding/team-state', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('team-state failed');
    return (await response.json()) as OnboardingTeamState;
  }, [getToken]);

  const goHome = useCallback(
    async (path: string = HOME_PATH) => {
      setScreen('leaving');
      try {
        await checkAuth({ force: true });
      } catch {
        // The app reads the profile again on its own.
      }
      router.replace(path);
    },
    [checkAuth, router]
  );

  // Pay first (2026-10-31, founder): a team with no trial and no plan meets the
  // plan wall before its first project, because saving one needs access.
  // Paying lands on /checkout/welcome, then home, which brings an unfinished
  // account back here to the first project.
  const sendToPlansIfUnpaid = useCallback(async (): Promise<boolean> => {
    if (TEAM_TRIAL_DAYS > 0) return false;
    const id = useAuthStore.getState().user?.id;
    if (!id) return false;
    const access = await getTeamAccessClient(id, { force: true }).catch(() => null);
    if (!access || access.hasAccess) return false;
    setScreen('leaving');
    router.replace('/locked');
    return true;
  }, [router]);

  const showScreenFor = useCallback(
    (state: OnboardingTeamState) => {
      setTeamState(state);
      const next = decideOnboardingScreen(state, { lastChoice: readLastChoice() });
      if (next === 'held') {
        router.replace('/locked?reason=not_approved');
        return;
      }
      if (next === 'done') {
        void goHome();
        return;
      }
      if (next === 'music') {
        setSelectedTeamId((current) => current ?? state.ownTeam?.workspaceId ?? state.teams[0]?.workspaceId ?? null);
        void sendToPlansIfUnpaid().then((sent) => {
          if (!sent) setScreen('music');
        });
        return;
      }
      if (next === 'invites') {
        track({
          name: 'onboarding_team_viewed',
          properties: { invites: state.invites.length, state: 'invited' },
        });
      } else if (next === 'setup') {
        track({ name: 'onboarding_team_viewed', properties: { invites: 0, state: 'none' } });
      }
      if (next === 'ask') setAskStartedAt(Date.now());
      setScreen(next);
    },
    [goHome, router, sendToPlansIfUnpaid]
  );

  /** Signed in: the closed sign-up check, then where they stand. */
  const enterTeamFlow = useCallback(async () => {
    if (flowStartedRef.current) return;
    flowStartedRef.current = true;
    // A remembered sign-in with no live session is signed out: back to S1.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      flowStartedRef.current = false;
      setScreen('account');
      return;
    }
    clearPendingConfirmation();
    setConfirmation(null);
    setScreen('team_loading');

    let googleStarted = false;
    try {
      googleStarted = window.sessionStorage.getItem(GOOGLE_STARTED_KEY) === '1';
      window.sessionStorage.removeItem(GOOGLE_STARTED_KEY);
    } catch {
      // Analytics only.
    }
    markOnboardingStarted(googleStarted ? 'google' : 'auth');
    if (googleStarted) {
      track({ name: 'onboarding_account_created', properties: { method: 'google', had_referral: Boolean(readReferralCode()) } });
    }

    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      setCheckFailed(true);
      track({ name: 'onboarding_team_viewed', properties: { invites: 0, state: 'check_failed' } });
      setScreen((current) => (current === 'team_loading' ? 'setup' : current));
    }, TEAM_CHECK_TIMEOUT_MS);
    try {
      const token = await getToken();
      // Redeem any /start or /welcome code this browser holds, then ask
      // whether this account is let in. Fails open: the server decides.
      const access = await redeemPendingAccess(token);
      if (!access.approved) {
        window.clearTimeout(timer);
        router.replace('/locked?reason=not_approved');
        return;
      }
      const state = await fetchTeamState();
      window.clearTimeout(timer);
      if (!timedOut) showScreenFor(state);
      else {
        setTeamState(state);
        if (state.invites.length) showScreenFor(state);
      }
    } catch {
      window.clearTimeout(timer);
      if (!timedOut) {
        setCheckFailed(true);
        track({ name: 'onboarding_team_viewed', properties: { invites: 0, state: 'check_failed' } });
        setScreen('setup');
      }
    }
  }, [fetchTeamState, getToken, router, showScreenFor]);

  // Signed in on arrival (Google came back, a confirm link, ?setup=1, or a
  // reload mid-flow), or signed in just now on this page.
  useEffect(() => {
    if (!hydrated || isAuthLoading || !isAuthenticated || flowStartedRef.current) return;
    if (screenRef.current === 'account' && creating) return;
    if (String(user?.role || '').toLowerCase() === 'curator') {
      router.replace(resolveHomePath(user?.role));
      return;
    }
    if (user?.onboarding_completed === true) {
      router.replace(HOME_PATH);
      return;
    }
    void enterTeamFlow();
  }, [hydrated, isAuthLoading, isAuthenticated, user?.role, user?.onboarding_completed, creating, enterTeamFlow, router]);

  // First view of the account screen starts the onboarding clock.
  useEffect(() => {
    if (!hydrated || isAuthLoading || isAuthenticated) return;
    if (screen === 'account') markOnboardingStarted(entry);
  }, [hydrated, isAuthLoading, isAuthenticated, screen, entry]);

  // While the account is being made, leaving would strand it half made.
  useEffect(() => {
    if (!creating) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [creating]);

  // Check your inbox: a confirmation in another tab of this browser arrives as
  // a session here; focus and visibility re-check for browsers that miss it.
  useEffect(() => {
    if (screen !== 'check_inbox') return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) void checkAuth({ force: true });
    });
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase.auth.getSession().then(({ data: sessionData }) => {
        if (sessionData.session) void checkAuth({ force: true });
      });
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [screen, checkAuth]);

  // The check-failed team screen keeps looking for an invite in the background.
  useEffect(() => {
    if (!checkFailed || screen !== 'setup' || teamState) return;
    const timer = window.setInterval(() => {
      void fetchTeamState()
        .then((state) => {
          setCheckFailed(false);
          if (screenRef.current === 'setup' && state.invites.length) showScreenFor(state);
          else setTeamState(state);
        })
        .catch(() => undefined);
    }, invitePollDelay(0));
    return () => window.clearInterval(timer);
  }, [checkFailed, screen, teamState, fetchTeamState, showScreenFor]);

  // S3: ask the server every 20 seconds while the page is visible, and once
  // when it comes back to the front. Slower after 30 minutes.
  useEffect(() => {
    if (screen !== 'ask' || askStartedAt === null) return;
    let timer: number | null = null;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const state = await fetchTeamState();
        if (stopped) return;
        if (state.invites.length) {
          track({ name: 'onboarding_join_resolved', properties: { waited_seconds: Math.round((Date.now() - askStartedAt) / 1000) } });
          setTeamState(state);
          setArrived(true);
          setScreen('invites');
        }
      } catch {
        // Try again next time.
      }
    };
    const schedule = () => {
      const waited = Date.now() - askStartedAt;
      setLongWait(waited >= INVITE_POLL_LONG_WAIT_MS);
      timer = window.setTimeout(async () => {
        await check();
        if (!stopped) schedule();
      }, invitePollDelay(waited));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [screen, askStartedAt, fetchTeamState]);

  // Device Back: New project goes back to the team screen; the team screens
  // never go back into account creation (lib/onboarding-history's approach:
  // hold the page by pushing the entry back).
  useEffect(() => {
    if (!['setup', 'invites', 'ask', 'music'].includes(screen)) return;
    window.history.pushState({ urganizeOnboarding: screen }, '');
    const onPop = () => {
      if (screenRef.current === 'music' && !joinedRole) {
        setScreen('setup');
        return;
      }
      window.history.pushState({ urganizeOnboarding: screenRef.current }, '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [screen, joinedRole]);

  // ── S1 actions ────────────────────────────────────────────────────────────
  const rememberReferral = () => {
    if (!REFERRAL_FIELD_ENABLED || !referralInput.trim()) return;
    const verdict = rememberTypedReferralCode(referralInput);
    setReferralInvalid(verdict.kind === 'invalid');
    if (verdict.kind === 'invalid') captureAnalyticsEvent({ name: 'onboarding_referral_invalid', properties: {} });
  };

  const accountBlocker = describeNextBlocker({
    hasName: Boolean(name.trim()),
    hasEmail: isEmailValid(email),
    passwordLongEnough: isPasswordLongEnough(password),
    passwordLength: password.length,
  });

  const createAccount = async () => {
    if (accountBlocker || creating) return;
    rememberReferral();
    setAccountError(null);
    setCreating(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (!(await checkEmailAccess(normalizedEmail))) {
        setCreating(false);
        setScreen('invite_only');
        return;
      }
      const accessCode = readAccessIntent();
      const welcomeToken = readWelcomeIntent();
      // The role is set from "Who is this team for?" on the next screen.
      const result = await signup(normalizedEmail, password, name.trim(), 'artist-manager', undefined, {
        metadata: {
          ...(accessCode ? { pending_access_code: accessCode } : {}),
          ...(welcomeToken ? { pending_welcome_token: welcomeToken } : {}),
        },
      });
      track({
        name: 'onboarding_account_created',
        properties: { method: 'email', had_referral: Boolean(readReferralCode()) },
      });
      if (result.status === 'confirmation_sent') {
        // No session until the email is confirmed. The confirm link comes
        // back through /auth/callback to the team screen.
        const sentAt = Date.now();
        const firstName = confirmationFirstName(name);
        writePendingConfirmation({ email: result.email, sentAt, kind: 'onboarding', firstName });
        setPassword('');
        setCreating(false);
        setConfirmation({ email: result.email, sentAt, firstName });
        setScreen('check_inbox');
        return;
      }
      setCreating(false);
      setPassword('');
      await enterTeamFlow();
    } catch (error) {
      setCreating(false);
      const message = errorMessage(error, 'Could not create your account.');
      if (/already (been )?registered|already exists|already has an account/i.test(message)) {
        setAccountError({ kind: 'taken' });
      } else {
        setAccountError({ kind: 'message', text: message });
      }
    }
  };

  const continueWithGoogle = async () => {
    rememberReferral();
    setAccountError(null);
    setGoogleBusy(true);
    try {
      window.sessionStorage.setItem(GOOGLE_STARTED_KEY, '1');
    } catch {
      // Analytics only.
    }
    try {
      // Google → /auth/callback → back here, signed in → the team screen.
      await loginWithGoogle('/onboarding');
    } catch (error) {
      setGoogleBusy(false);
      setAccountError({ kind: 'message', text: errorMessage(error, 'Could not start Google sign-in.') });
    }
  };

  const logOut = async () => {
    writeLastChoice(null);
    try {
      await logout();
    } catch {
      // Signed out locally either way.
    }
    router.replace('/auth');
  };

  // ── S2 / S3 actions ───────────────────────────────────────────────────────
  const displayName = user?.name || name;
  const accountEmail = user?.email || email;
  const account = { name: displayName || accountEmail, email: accountEmail, onLogout: () => void logOut() };
  const whoFor: TeamWhoFor | null = whoForFromPersona(user?.onboarding_persona ?? null);

  const afterTeamExists = async (token: string) => {
    // The partner code and where they came from, now the team exists.
    await Promise.all([reportReferralCode(token), reportSignupSource(token), reportSourceLinkSignup(token)]).catch(() => undefined);
  };

  const createTeam = async (input: { name: string; whoFor: TeamWhoFor; nameEdited: boolean }) => {
    setTeamBusy(true);
    setTeamError('');
    try {
      const token = await getToken();
      const response = await fetch('/api/onboarding/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'create', name: input.name, whoFor: input.whoFor }),
      });
      const payload = (await response.json().catch(() => ({}))) as { workspaceId?: string; error?: string; redirect?: string };
      if (response.status === 402 && payload.redirect) {
        router.replace('/locked?reason=not_approved');
        return;
      }
      if (!response.ok || !payload.workspaceId) throw new Error(payload.error || 'Could not make your team.');
      track({ name: 'onboarding_team_created', properties: { who_for: input.whoFor, name_edited: input.nameEdited } });
      writeLastChoice('setup');
      await afterTeamExists(token);
      await checkAuth({ force: true }).catch(() => undefined);
      const state = await fetchTeamState().catch(() => null);
      if (state) setTeamState(state);
      setSelectedTeamId(payload.workspaceId);
      setJoinedRole(null);
      if (await sendToPlansIfUnpaid()) return;
      setScreen('music');
    } catch (error) {
      setTeamError(isNetworkError(error) ? 'No connection. Try again.' : errorMessage(error, 'Could not make your team.'));
    }
    setTeamBusy(false);
  };

  const afterJoin = async (result: { workspaceId: string; role: TeamRole }, teamName: string, via: 'pending' | 'link' | 'waited') => {
    track({ name: 'onboarding_team_joined', properties: { via, role: result.role } });
    writeLastChoice(null);
    const token = await getToken().catch(() => '');
    if (token) await afterTeamExists(token);
    if (decideAfterJoin(result.role) === 'music') {
      const state = await fetchTeamState().catch(() => null);
      if (state) setTeamState(state);
      setSelectedTeamId(result.workspaceId);
      setJoinedRole(result.role);
      if (await sendToPlansIfUnpaid()) return;
      setScreen('music');
      return;
    }
    if (user?.id) writeOnboardingLanding({ userId: user.id, kind: 'joined', teamName });
    await goHome();
  };

  const joinInvite = async (invite: TeamInvite) => {
    setJoiningId(invite.workspaceId);
    setJoinError('');
    try {
      const token = await getToken();
      const response = await fetch('/api/onboarding/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'join', workspaceId: invite.workspaceId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { workspaceId?: string; role?: TeamRole; error?: string };
      if (!response.ok || !payload.workspaceId) throw new Error(payload.error || 'Could not join the team.');
      await afterJoin({ workspaceId: payload.workspaceId, role: payload.role ?? 'member' }, invite.teamName, arrived ? 'waited' : 'pending');
    } catch (error) {
      setJoinError(isNetworkError(error) ? 'No connection. Try again.' : errorMessage(error, 'Could not join the team.'));
      setJoiningId(null);
    }
  };

  const joinLink = async (link: string) => {
    setLinkBusy(true);
    setLinkError('');
    try {
      const token = await getToken();
      const response = await fetch('/api/onboarding/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'join_link', link }),
      });
      const payload = (await response.json().catch(() => ({}))) as { workspaceId?: string; role?: TeamRole; error?: string };
      if (!response.ok || !payload.workspaceId) throw new Error(payload.error || "That isn't an invite link. Ask for a new one.");
      const state = await fetchTeamState().catch(() => null);
      const teamName = state?.teams.find((team) => team.workspaceId === payload.workspaceId)?.name || 'your team';
      await afterJoin({ workspaceId: payload.workspaceId, role: payload.role ?? 'member' }, teamName, 'link');
    } catch (error) {
      setLinkError(isNetworkError(error) ? 'No connection. Try again.' : errorMessage(error, "That isn't an invite link. Ask for a new one."));
    }
    setLinkBusy(false);
  };

  const openAsk = () => {
    writeLastChoice('ask');
    setAskStatus('');
    setLinkError('');
    setAskStartedAt(Date.now());
    setLongWait(false);
    setScreen('ask');
  };

  const openSetup = () => {
    writeLastChoice('setup');
    setArrived(false);
    setScreen('setup');
  };

  // ── S4 actions ────────────────────────────────────────────────────────────
  const markOnboardingDone = async (token: string) => {
    await fetch('/api/user/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ onboardingCompleted: true, onboardingStep: ONBOARDING_DONE_STEP }),
    }).catch(() => undefined);
  };

  const teams = teamState?.teams ?? [];
  const selectedTeam = teams.find((team) => team.workspaceId === selectedTeamId) ?? null;
  const joined = Boolean(joinedRole) || Boolean(selectedTeam && !selectedTeam.isOwn);

  const addMusic = async (form: MusicForm) => {
    const submission = buildMusicSubmission(form, lagosToday());
    if (!submission || submit.kind === 'busy') return;
    setSubmit({ kind: 'busy', label: 'Adding…' });
    // The team picked, or the one just made/joined when the team list failed
    // to load: never "no team", which lets the server fall back to the primary
    // team (a joined team, for someone who also has an invite).
    const workspaceId = selectedTeam?.workspaceId ?? selectedTeamId ?? null;
    const userId = user?.id ?? '';
    try {
      const token = await getToken();
      if (submission.savesAs === 'record') {
        const response = await fetch('/api/onboarding/music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...submission, workspaceId }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          recordId?: string;
          artistId?: string;
          workspaceId?: string;
          error?: string;
          limitKey?: string;
        };
        if (!response.ok || !payload.recordId || !payload.artistId) {
          setSubmit({ kind: 'error', message: payload.error || 'Could not save it. Try again.', artistLimit: Boolean(payload.limitKey) });
          return;
        }
        await markOnboardingDone(token);
        track({
          name: 'onboarding_music_added',
          properties: { stage: form.stage ?? '', kind: form.kind, has_date: false, saved_as: 'record' },
        });
        captureAnalyticsEvent({ name: 'record_started', properties: { artist_id: payload.artistId, source: 'onboarding' } });
        clearSavedMusicForm(userId);
        if (userId && !joined) writeOnboardingLanding({ userId, kind: 'record', ...(whoFor ? { whoFor } : {}) });
        // The record page reads the person's primary team; a record saved in
        // another team lands on Home instead of a page that cannot find it.
        const primary = teamState?.primaryWorkspaceId ?? payload.workspaceId;
        const destination =
          !primary || primary === payload.workspaceId ? recordHref(payload.artistId, payload.recordId) : HOME_PATH;
        await goHome(destination);
        return;
      }

      if (submission.releaseDate) setSubmit({ kind: 'busy', label: 'Building your plan…' });
      const response = await fetch('/api/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: submission.title,
          releaseDate: submission.releaseDate ?? '',
          releaseType: submission.releaseType,
          artistName: submission.artistName,
          source: 'onboarding',
          plan: 'template',
          // Ready to release means mastered; planner v2 asks the rest.
          autoPlan: { readyToday: ['master'], whereStuck: [] },
          ...(workspaceId ? { workspaceId } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        releaseId?: string;
        release?: { id?: string };
        plannerPending?: boolean;
        planAuto?: boolean;
        error?: string;
        limitKey?: string;
      };
      const releaseId = payload.releaseId ?? payload.release?.id;
      if (!response.ok || !releaseId) {
        setSubmit({ kind: 'error', message: payload.error || 'Could not save it. Try again.', artistLimit: payload.limitKey === 'artists' });
        return;
      }
      await markOnboardingDone(token);
      track({
        name: 'onboarding_music_added',
        properties: {
          stage: form.stage ?? '',
          kind: form.kind,
          has_date: Boolean(submission.releaseDate),
          saved_as: 'rollout',
        },
      });
      // "Just me, I'm the artist": their artist name, so the app does not ask again.
      if (user?.role === 'artist' && !user.artist_name && userId) {
        void supabase.from('profiles').update({ artist_name: submission.artistName }).eq('id', userId);
      }
      clearSavedMusicForm(userId);
      startFirstSession({ releaseId, shareReleaseId: null });
      if (payload.plannerPending && !payload.planAuto) {
        markOnboardingPlannerHandoff({
          releaseId,
          releaseType: submission.releaseType,
          artistName: submission.artistName,
          readyToday: ['master'],
          musicStage: 'finished',
          ...(submission.releaseDate ? { releaseDate: submission.releaseDate } : {}),
        });
      }
      if (userId && !joined) {
        writeOnboardingLanding({
          userId,
          kind: payload.planAuto ? 'rollout_dated' : 'rollout_nodate',
          releaseId,
          askHeardFrom: Boolean(payload.planAuto),
          ...(whoFor ? { whoFor } : {}),
        });
      }
      await goHome(onboardingLandingPath(releaseId, HOME_PATH));
    } catch (error) {
      if (isNetworkError(error)) setSubmit({ kind: 'offline' });
      else setSubmit({ kind: 'error', message: errorMessage(error, 'Could not save it. Try again.') });
    }
  };

  const skipMusic = async () => {
    setScreen('leaving');
    try {
      const token = await getToken();
      await markOnboardingDone(token);
    } catch {
      // The app still opens; onboarding is finished on the next try.
    }
    if (!joined) {
      track({ name: 'onboarding_music_skipped', properties: {} });
      if (user?.id) writeOnboardingLanding({ userId: user.id, kind: 'skipped', ...(whoFor ? { whoFor } : {}) });
    } else if (user?.id) {
      // A Manager who joined comes through here ("Go to Home"), not afterJoin's
      // straight-home branch, so Home's "You're in {team}" needs its record here too.
      writeOnboardingLanding({ userId: user.id, kind: 'joined', teamName: selectedTeam?.name || '' });
    }
    await goHome();
  };

  const refreshTeams = () => {
    void fetchTeamState()
      .then((state) => setTeamState(state))
      .catch(() => undefined);
  };

  const defaultName = useMemo(() => defaultTeamName(displayName), [displayName]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (screen === 'check_inbox' && confirmation) {
    return (
      <CheckInbox
        email={confirmation.email}
        firstName={confirmation.firstName}
        sentAt={confirmation.sentAt}
        onChangeEmail={() => {
          setEmail(confirmation.email);
          setPassword('');
          setConfirmation(null);
          clearPendingConfirmation();
          setScreen('account');
        }}
      />
    );
  }

  if (screen === 'invite_only') {
    return (
      <OnboardingFrame narrow>
        <div className="md:rounded-2xl md:border md:border-stroke-control md:bg-bg-surface md:p-7">
          <InviteOnlyNotice signInHref="/auth" />
        </div>
      </OnboardingFrame>
    );
  }

  if (screen === 'account') {
    const takenEmail = encodeURIComponent(email.trim().toLowerCase());
    // On a computer (#1229): the form sits on the page, fields are outlined
    // and labelled in place, and the button is an ink pill like sign-in's.
    const deskInput = 'lg:h-[46px] lg:border-content-tertiary lg:bg-bg-surface lg:text-[14px]';
    return (
      <SignupSplitFrame>
        <div className="animate-fade-in md:rounded-2xl md:border md:border-stroke-control md:bg-bg-surface md:p-7 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
          <h1 className="text-balance font-display text-[30px] font-normal leading-[1.12] tracking-[-0.012em] md:text-[34px] lg:text-[40px] lg:leading-[46px]">
            Create your account
          </h1>
          <p className="mt-2 text-[15px] text-content-secondary">
            <span className="lg:hidden">One plan for you and your team. </span>It takes a minute.
          </p>

          {/* Signing up needs JavaScript. Say so instead of a button that does nothing. */}
          <noscript>
            <p className="mt-5 rounded-xl border border-status-warning/40 bg-bg-surface px-4 py-3 text-sm text-content-secondary">
              Signing up needs JavaScript switched on. If you are using a content blocker or private browsing
              restrictions, turn them off for urganize.app and reload this page.
            </p>
          </noscript>

          {/* Apple: only inside the iPhone app, above Google as Apple asks. */}
          <AppleSignInButton
            nextPath="/onboarding"
            disabled={googleBusy || creating}
            onBeforeStart={rememberReferral}
            className={`${secondaryButtonClass} mt-[22px] lg:mt-7 lg:text-[14px]`}
            onError={(message) => setAccountError({ kind: 'message', text: message })}
          />
          <button
            type="button"
            onClick={() => void continueWithGoogle()}
            disabled={googleBusy || creating}
            className={`${secondaryButtonClass} mt-[22px] lg:mt-7 lg:bg-bg-surface lg:text-[14px]`}
          >
            {googleBusy ? (
              'Opening Google…'
            ) : (
              <>
                <GoogleMark />
                Continue with Google
              </>
            )}
          </button>

          <div className="mb-0.5 mt-[18px] flex items-center gap-3 text-[13px] text-content-tertiary" aria-hidden="true">
            <span className="h-px flex-1 bg-stroke-control" />
            or with email
            <span className="h-px flex-1 bg-stroke-control" />
          </div>

          <form
            onInput={() => setAccountTouched(true)}
            onSubmit={(event) => {
              event.preventDefault();
              void createAccount();
            }}
          >
            <label className="mt-4 block">
              <span className={labelClass}>Your name</span>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={`${inputClass} ${deskInput}`} />
            </label>
            <label className="mt-4 block">
              <span className={labelClass}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (accountError?.kind === 'taken') setAccountError(null);
                }}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`${inputClass} ${deskInput}`}
              />
              {accountError?.kind === 'taken' ? (
                <span className={errorTextClass}>
                  This email already has an account.{' '}
                  <a href={`/auth?email=${encodeURIComponent(takenEmail)}`} className="underline underline-offset-[3px]">
                    Log in instead
                  </a>
                  .
                </span>
              ) : null}
            </label>
            <label className="mt-4 block">
              <span className={`${labelClass} lg:flex lg:items-baseline lg:justify-between`}>
                Password
                <span className="hidden font-normal text-content-tertiary lg:inline">{PASSWORD_LENGTH_HINT.replace(/\.$/, '')}</span>
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                className={`${inputClass} ${deskInput}`}
              />
              <span className={`${hintClass} lg:hidden`}>{PASSWORD_LENGTH_HINT}</span>
            </label>

            {REFERRAL_FIELD_ENABLED ? (
              referralOpen ? (
                <label className="mt-4 block">
                  <span className={labelClass}>
                    Referral code <span className="font-normal text-content-tertiary">(optional)</span>
                  </span>
                  <input
                    type="text"
                    value={referralInput}
                    onChange={(event) => {
                      setReferralInput(event.target.value);
                      if (referralInvalid) setReferralInvalid(false);
                    }}
                    onBlur={() => setReferralInvalid(Boolean(referralInput.trim()) && judgeTypedReferralCode(referralInput).kind === 'invalid')}
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={40}
                    className={inputClass}
                  />
                  {referralInvalid ? (
                    <span className={hintClass}>That code doesn&apos;t look right. You can carry on without it.</span>
                  ) : null}
                </label>
              ) : (
                <p className="mt-3.5">
                  <button type="button" onClick={() => setReferralOpen(true)} className={`${textLinkClass} text-sm text-content-secondary`}>
                    Have a referral code?
                  </button>
                </p>
              )
            ) : null}

            <div className="mt-[22px]">
              <button
                type="submit"
                disabled={Boolean(accountBlocker) || creating || googleBusy}
                aria-describedby="account-blocker"
                className={`${primaryButtonClass} lg:bg-content-primary lg:text-[14px] lg:text-bg-base lg:hover:bg-content-primary/90 lg:disabled:bg-bg-hover lg:disabled:text-content-secondary`}
              >
                {creating ? 'Creating your account…' : 'Create account'}
              </button>
              <p id="account-blocker" className="mt-2 min-h-5 text-center text-[13px] text-content-secondary">
                {accountTouched ? accountBlocker : ''}
              </p>
              {accountError?.kind === 'message' ? (
                <p role="alert" className="text-center text-[13px] text-status-error">
                  {accountError.text}
                </p>
              ) : null}
            </div>
          </form>

          <p className="mt-[22px] text-center text-sm text-content-secondary">
            Already have an account?{' '}
            <a href="/auth" className={`${textLinkClass} lg:font-semibold lg:text-brand lg:decoration-brand`}>
              <span className="lg:hidden">Log in</span>
              <span className="hidden lg:inline">Sign in</span>
            </a>
          </p>
        </div>
      </SignupSplitFrame>
    );
  }

  const frameName = displayName || accountEmail;

  if (screen === 'team_loading' || screen === 'leaving' || (screen === 'music' && !teamState)) {
    return (
      <OnboardingFrame name={frameName}>
        <TeamLoadingScreen account={account} leaving={screen === 'leaving'} />
      </OnboardingFrame>
    );
  }

  if (screen === 'invites' && teamState) {
    const arrivedBy = (teamState.invites[0]?.inviterName || 'The owner').split(/\s+/)[0];
    return (
      <OnboardingFrame name={frameName}>
        <InvitesScreen
          account={account}
          invites={teamState.invites}
          joiningId={joiningId}
          error={joinError}
          arrived={arrived}
          arrivedBy={arrivedBy}
          onJoin={(invite) => void joinInvite(invite)}
          onCreateTeam={openSetup}
        />
      </OnboardingFrame>
    );
  }

  if (screen === 'ask') {
    return (
      <OnboardingFrame name={frameName}>
        <AskInviteScreen
          account={account}
          longWait={longWait}
          onBack={openSetup}
          onUseDifferentEmail={() => void logOut()}
          onAsked={(channel) => {
            track({ name: 'onboarding_join_asked', properties: { channel } });
            setAskStatus('Message ready. Send it, then come back here.');
          }}
          onJoinLink={(link) => void joinLink(link)}
          linkError={linkError}
          linkBusy={linkBusy}
          status={askStatus}
        />
      </OnboardingFrame>
    );
  }

  if (screen === 'music' && teamState && user?.id) {
    return (
      <OnboardingFrame name={frameName}>
        <NewProjectScreen
          userId={user.id}
          account={account}
          teams={teams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={setSelectedTeamId}
          joined={joined}
          whoFor={whoFor}
          submit={submit}
          onSubmit={(form) => void addMusic(form)}
          onSkip={() => void skipMusic()}
          onBackToTeam={joined ? null : () => setScreen('setup')}
          onAskInvite={openAsk}
          onOpenRollout={(releaseId) => void goHome(onboardingLandingPath(releaseId, HOME_PATH))}
          getToken={getToken}
          onTeamChanged={refreshTeams}
        />
      </OnboardingFrame>
    );
  }

  // Set up your team (also the fallback while the invite check is slow).
  const teamMade = Boolean(teamState?.teamDecided || (teamState?.ownTeam && screen === 'setup' && selectedTeamId));
  return (
    <OnboardingFrame name={frameName}>
      <SetupTeamScreen
        key={teamMade ? 'made' : 'new'}
        account={account}
        defaultName={defaultName}
        initialName={teamMade ? teamState?.ownTeam?.name || '' : ''}
        initialWhoFor={whoFor}
        teamMade={teamMade}
        checkFailed={checkFailed}
        busy={teamBusy}
        error={teamError}
        onSubmit={(input) => void createTeam(input)}
        onAsk={openAsk}
      />
    </OnboardingFrame>
  );
}
