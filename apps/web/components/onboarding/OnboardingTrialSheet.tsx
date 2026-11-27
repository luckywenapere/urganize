'use client';

// "Your 3-day trial is on" (#854, spec S5). The paywall moved from before the
// first plan to after the first music: a sheet you can close, that takes no
// money and starts nothing (the trial began when the team was made, so the
// copy says "is on" because that is true). No prices in the iPhone app (App
// Store rules, the same isIOSApp() call the billing wall makes).
//
// The host is mounted once in AppShell on app pages. It opens the sheet once,
// at the moment lib/onboarding-landing.ts picks, and never over the planner's
// questions.
//
// Since #1424 (27 Nov 2026) the sheet asks "Who is this team for?" when nobody
// has said (sign-up stopped asking in #1412): three rows, one tap. The plan on
// the sheet follows the tap at once, and the answer is saved as the persona,
// the way the "Who are you?" card on Home saves it (the account's role is not
// touched). No tap leaves the plan as it was, and Keep going always works.

import { usePurchasePromptsAllowed } from '@/lib/use-purchase-prompts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { isIOSApp } from '@/lib/platform';
import { isHomeLocation } from '@/lib/home-path';
import { TEAM_TRIAL_DAYS } from '@/lib/team-billing';
import { personaForWhoFor, type TeamWhoFor } from '@/lib/team-who-for';
import {
  PLAN_LANDED_EVENT,
  clearOnboardingLanding,
  decideTrialSheet,
  readOnboardingLanding,
  shouldAskWhoFor,
  trialSheetPlan,
  trialSheetTier,
  type OnboardingLanding,
} from '@/lib/onboarding-landing';
import { Sheet, WhoForRows, primaryButtonClass, textLinkClass } from './OnboardingFrame';

const RECORD_PATH = /^\/dashboard\/artists\/[^/]+\/records\/[^/]+$/;
const TICK_MS = 1000;
/** The longest "See all plans" waits for an answer tapped a moment ago to save. */
const SAVE_WAIT_MS = 1500;

function readReleaseParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('release');
  } catch {
    return null;
  }
}

export function OnboardingTrialSheetHost() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const hasPersona = useAuthStore((state) => Boolean(state.user?.onboarding_persona));
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const pathname = usePathname();
  const router = useRouter();
  const purchasePromptsAllowed = usePurchasePromptsAllowed();
  const [landing, setLanding] = useState<OnboardingLanding | null>(null);
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const arrivedAtRef = useRef<number | null>(null);
  const placeKeyRef = useRef('');
  const plannerWasOpenedRef = useRef(false);
  const planLandedRef = useRef(false);
  const shownRef = useRef(false);
  // "Who is this team for?", answered on this sheet. Saves run one after the
  // other, so a second tap is never overtaken by the first one's request.
  const [picked, setPicked] = useState<TeamWhoFor | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // While the sheet is open it keeps the landing it opened with: the saved
    // one is cleared the moment the sheet is seen, and a re-read then would
    // drop who the team is for and change the plan under the reader.
    setLanding((current) => (open && current ? current : readOnboardingLanding(userId)));
    setIos(isIOSApp());
  }, [userId, pathname, open]);

  // The plan built on its own (auto-plan): WorkspaceView says so.
  useEffect(() => {
    if (!landing?.releaseId) return;
    const onLanded = (event: Event) => {
      const detail = (event as CustomEvent<{ releaseId?: string | null }>).detail;
      if (!detail?.releaseId || detail.releaseId === landing.releaseId) planLandedRef.current = true;
    };
    window.addEventListener(PLAN_LANDED_EVENT, onLanded);
    return () => window.removeEventListener(PLAN_LANDED_EVENT, onLanded);
  }, [landing?.releaseId]);

  useEffect(() => {
    if (!landing || open || shownRef.current) return;
    if (landing.kind === 'joined') return;
    // No trial since 2026-10-31: the team paid before its first project, so
    // "Your trial is on" would be untrue.
    if (TEAM_TRIAL_DAYS <= 0) return;
    const tick = () => {
      const releaseId = readReleaseParam();
      const place = {
        onHome: isHomeLocation(pathname, window.location.search),
        releaseId: pathname === '/dashboard' ? releaseId : null,
        onRecord: RECORD_PATH.test(pathname || ''),
      };
      const placeKey = `${pathname}|${place.releaseId ?? ''}`;
      if (placeKey !== placeKeyRef.current) {
        placeKeyRef.current = placeKey;
        arrivedAtRef.current = Date.now();
      }
      const planner = usePlannerStore.getState();
      const plannerOpen = Boolean(planner.intake);
      if (plannerOpen && (!landing.releaseId || planner.intake?.releaseId === landing.releaseId)) {
        plannerWasOpenedRef.current = true;
      }
      const decision = decideTrialSheet({
        landing,
        place,
        elapsedMs: Date.now() - (arrivedAtRef.current ?? Date.now()),
        plannerOpen,
        plannerWasOpened: plannerWasOpenedRef.current,
        planBuilding: Boolean(landing.releaseId && planner.generatingReleaseIds.includes(landing.releaseId)),
        planLanded: planLandedRef.current || planner.lastBuilt?.releaseId === landing.releaseId,
      });
      if (decision === 'open') {
        shownRef.current = true;
        setOpen(true);
      }
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [landing, open, pathname]);

  const whoFor = picked ?? landing?.whoFor;
  const plan = useMemo(() => trialSheetPlan(whoFor), [whoFor]);
  const asksWhoFor = shouldAskWhoFor({ ios, landingWhoFor: landing?.whoFor, hasPersona, picked });

  const pickWhoFor = (next: TeamWhoFor) => {
    if (next === picked) return;
    // The plan on the sheet follows the tap at once; the save follows it.
    setPicked(next);
    saveChainRef.current = saveChainRef.current.then(async () => {
      let saved = false;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const response = await fetch('/api/user/onboarding', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ onboardingPersona: personaForWhoFor(next) }),
          });
          saved = response.ok;
        }
      } catch {
        // A lost answer is not worth an error on this sheet. They still see
        // the plan for it, and the "Who are you?" card on Home asks later.
      }
      captureAnalyticsEvent({
        name: 'onboarding_trial_sheet_answered',
        properties: { who_for: next, tier_shown: trialSheetTier(next), saved },
      });
      // So the card on Home knows the answer in this visit. Not waited for:
      // "See all plans" waits on this chain, and only the save matters to it.
      if (saved) void checkAuth({ force: true }).catch(() => undefined);
    });
  };

  const viewedRef = useRef(false);
  useEffect(() => {
    // Once per sheet: a tap on "Who is this team for?" changes plan.tier, and
    // that must not count as the sheet being seen a second time.
    if (!open || viewedRef.current) return;
    viewedRef.current = true;
    // Seen once: it never opens again, whatever happens next.
    clearOnboardingLanding();
    captureAnalyticsEvent({ name: 'onboarding_trial_sheet_viewed', properties: { tier_shown: ios ? 'none' : plan.tier, ios } });
  }, [open, ios, plan.tier]);

  const close = (openedPlans: boolean) => {
    setOpen(false);
    captureAnalyticsEvent({
      name: 'onboarding_trial_sheet_closed',
      properties: { tier_shown: ios ? 'none' : plan.tier, ios, opened_plans: openedPlans },
    });
  };

  return (
    <Sheet open={open} onClose={() => close(false)} labelledBy="trial-sheet-title">
      <h2 id="trial-sheet-title" className="pr-9 font-display text-[26px] font-normal leading-tight">
        Your {TEAM_TRIAL_DAYS}-day trial is on
      </h2>
      <p className="mt-2 text-[15px] text-content-secondary">Everything is open for your whole team. No card needed.</p>
      {ios ? (
        <p className="mt-3.5 text-[15px] text-content-secondary">You can pick a plan later in Settings.</p>
      ) : (
        <>
          {asksWhoFor ? <WhoForRows value={picked} onChange={pickWhoFor} /> : null}
          <div className="mt-4 rounded-2xl border border-brand bg-bg-base p-3.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="text-base font-semibold">
                {plan.name}
                <span className="ml-1.5 rounded-full border border-brand px-2 py-0.5 align-middle font-mono text-[10.5px] uppercase tracking-[0.06em] text-brand">
                  Fits you
                </span>
              </span>
              <span className="font-mono text-sm">{plan.price}</span>
            </div>
            {plan.then ? <p className="mt-1 text-[13px] text-content-tertiary">{plan.then}</p> : null}
            <ul className="mt-2 list-disc pl-[18px] text-sm text-content-secondary">
              {plan.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          {purchasePromptsAllowed ? (
            <p className="mt-3 text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  close(true);
                  // The plan wall reads the answer from the server, so a tap
                  // made a moment ago gets a moment to save before the wall
                  // opens. Never longer than SAVE_WAIT_MS: on bad data the
                  // button must not feel dead. The chain never rejects.
                  const waited = new Promise<void>((resolve) => window.setTimeout(resolve, SAVE_WAIT_MS));
                  void Promise.race([saveChainRef.current, waited]).then(() => router.push('/locked?intent=activate'));
                }}
                className={textLinkClass}
              >
                See all plans
              </button>
            </p>
          ) : null}
        </>
      )}
      <button type="button" onClick={() => close(false)} className={`${primaryButtonClass} mt-[18px]`}>
        Keep going
      </button>
      {ios ? null : <p className="mt-2.5 text-center text-[13px] text-content-tertiary">We&apos;ll remind you before it ends.</p>}
    </Sheet>
  );
}

// The saved landing is used up on first read, but Home can mount twice while it
// settles (#854: the note flashed away and never came back). Keep the name for
// the rest of this page visit so a remount still shows it.
let joinedTeamNameThisVisit: string | null = null;

/** "You're in {team}. Here's what's yours to do." Once, on the first Home visit after joining. */
export function JoinedTeamNote() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [teamName, setTeamName] = useState<string | null>(joinedTeamNameThisVisit);

  useEffect(() => {
    if (joinedTeamNameThisVisit) {
      setTeamName(joinedTeamNameThisVisit);
      return;
    }
    const landing = readOnboardingLanding(userId);
    if (landing?.kind === 'joined') {
      joinedTeamNameThisVisit = landing.teamName || 'the team';
      setTeamName(joinedTeamNameThisVisit);
      clearOnboardingLanding();
    }
  }, [userId]);

  if (!teamName) return null;
  return (
    <div role="status" className="mb-3.5 flex animate-fade-in items-center gap-2.5 rounded-2xl border border-stroke-control bg-bg-surface px-4 py-3 text-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-brand">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      <span>
        You&apos;re in <b className="font-semibold">{teamName}</b>. Here&apos;s what&apos;s yours to do.
      </span>
    </div>
  );
}
