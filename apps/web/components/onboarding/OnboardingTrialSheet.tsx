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

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { isIOSApp } from '@/lib/platform';
import { HOME_PATH } from '@/lib/home-path';
import {
  PLAN_LANDED_EVENT,
  clearOnboardingLanding,
  decideTrialSheet,
  readOnboardingLanding,
  trialSheetPlan,
  type OnboardingLanding,
} from '@/lib/onboarding-landing';
import { Sheet, primaryButtonClass, textLinkClass } from './OnboardingFrame';

const RECORD_PATH = /^\/dashboard\/artists\/[^/]+\/records\/[^/]+$/;
const TICK_MS = 1000;

function readReleaseParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('release');
  } catch {
    return null;
  }
}

export function OnboardingTrialSheetHost() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const pathname = usePathname();
  const router = useRouter();
  const [landing, setLanding] = useState<OnboardingLanding | null>(null);
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const arrivedAtRef = useRef<number | null>(null);
  const placeKeyRef = useRef('');
  const plannerWasOpenedRef = useRef(false);
  const planLandedRef = useRef(false);
  const shownRef = useRef(false);

  useEffect(() => {
    setLanding(readOnboardingLanding(userId));
    setIos(isIOSApp());
  }, [userId, pathname]);

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
    const tick = () => {
      const releaseId = readReleaseParam();
      const place = {
        onHome: pathname === HOME_PATH,
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

  const plan = useMemo(() => trialSheetPlan(landing?.whoFor), [landing?.whoFor]);

  useEffect(() => {
    if (!open) return;
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
        Your 3-day trial is on
      </h2>
      <p className="mt-2 text-[15px] text-content-secondary">Everything is open for your whole team. No card needed.</p>
      {ios ? (
        <p className="mt-3.5 text-[15px] text-content-secondary">You can pick a plan later in Settings.</p>
      ) : (
        <>
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
          <p className="mt-3 text-center text-sm">
            <button
              type="button"
              onClick={() => {
                close(true);
                router.push('/locked?intent=activate');
              }}
              className={textLinkClass}
            >
              See all plans
            </button>
          </p>
        </>
      )}
      <button type="button" onClick={() => close(false)} className={`${primaryButtonClass} mt-[18px]`}>
        Keep going
      </button>
      {ios ? null : <p className="mt-2.5 text-center text-[13px] text-content-tertiary">We&apos;ll remind you before it ends.</p>}
    </Sheet>
  );
}

/** "You're in {team}. Here's what's yours to do." Once, on the first Home visit after joining. */
export function JoinedTeamNote() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [teamName, setTeamName] = useState<string | null>(null);

  useEffect(() => {
    const landing = readOnboardingLanding(userId);
    if (landing?.kind === 'joined') {
      setTeamName(landing.teamName || 'the team');
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
