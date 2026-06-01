'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Logo } from '@urganize/ui';
import { Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { type AccountStatus } from '@/lib/subscription-access';
import { errorMessage } from '@/lib/errors';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';

// Branded vanity URL → 302s to the Paystack Payment Page that collects the
// flat ₦15,000 fee. Implemented at apps/homepage/app/pay/route.ts so the URL
// bar stays in the urganize.app domain when users click "Pay" and so the
// link is shareable on its own ("urganize.app/pay").
// The webhook (api/webhooks/paystack/route.ts) credits the payer via email
// match against profiles.email once charge.success arrives.
const PAYMENT_LINK_URL = 'https://urganize.app/pay';

type AccessSnapshot = {
  accountStatus: AccountStatus;
  hasAccess: boolean;
  trialUsed: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number;
};

const REASON_COPY: Record<string, string> = {
  unpaid: 'Your account does not have an active subscription or trial.',
  expired: 'Your subscription has expired.',
  trial_expired: 'Your 28-day free trial has ended.',
};

export default function LockedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason') || '';
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const checkAuth = useAuthStore((state) => state.checkAuth);

  const [snapshot, setSnapshot] = useState<AccessSnapshot | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  const [isStartingTrial, setIsStartingTrial] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  // Allowlisted emails never see this page. Bounce them out before render
  // can flash any locked UI. The server-side bypass in /api/subscription-status
  // would also flip hasAccess=true on the snapshot, but this fast path means
  // they never even reach that fetch.
  useEffect(() => {
    if (isAuthenticated && isAllowlistedEmail(user?.email)) {
      console.log(`[paywall-allowlist] locked-page bypass: ${user?.email}`);
      router.replace('/dashboard');
    }
  }, [isAuthenticated, user?.email, router]);

  // Pull the live access snapshot from the server so the trial button's
  // disabled state reflects the authoritative trial_used flag, not whatever
  // is cached in the Zustand store.
  useEffect(() => {
    let cancelled = false;

    const loadSnapshot = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          if (!cancelled) {
            setIsLoadingSnapshot(false);
          }
          return;
        }

        const response = await fetch('/api/subscription-status', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as Partial<AccessSnapshot>;

        if (!cancelled && response.ok) {
          setSnapshot({
            accountStatus: (payload.accountStatus as AccountStatus) || 'unpaid',
            hasAccess: Boolean(payload.hasAccess),
            trialUsed: Boolean(payload.trialUsed),
            trialEndsAt: typeof payload.trialEndsAt === 'string' ? payload.trialEndsAt : null,
            trialDaysLeft: Number(payload.trialDaysLeft) || 0,
          });
        }
      } catch {
        // Fail open with no snapshot — the buttons still render.
      } finally {
        if (!cancelled) {
          setIsLoadingSnapshot(false);
        }
      }
    };

    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, []);

  // If access flips to true while the user is on /locked (e.g., webhook
  // credited them in the background), bounce them back to the app.
  useEffect(() => {
    if (snapshot?.hasAccess) {
      router.replace('/dashboard');
    }
  }, [snapshot?.hasAccess, router]);

  const handleStartTrial = useCallback(async () => {
    setTrialError(null);
    setIsStartingTrial(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error('Sign in again and retry.');
      }

      const response = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Could not start trial.');
      }

      await checkAuth();
      router.replace('/dashboard');
    } catch (error) {
      setTrialError(errorMessage(error, 'Could not start trial.'));
      setIsStartingTrial(false);
    }
  }, [checkAuth, router]);

  const trialUsed = Boolean(snapshot?.trialUsed);
  const reasonCopy = REASON_COPY[reason] || REASON_COPY.unpaid;

  const headline = useMemo(() => {
    if (!isAuthenticated) {
      return 'Sign in to continue';
    }
    return 'Your access is locked';
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <Logo />

        <Card padding="lg" className="w-full flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-status-warning/10 text-status-warning flex items-center justify-center">
              <Lock className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-content-primary">{headline}</h1>
              {isAuthenticated ? (
                <p className="text-sm text-content-secondary">{reasonCopy}</p>
              ) : (
                <p className="text-sm text-content-secondary">
                  Sign in to your account, then pick a way to unlock the app.
                </p>
              )}
            </div>
          </div>

          {isAuthenticated ? (
            <>
              <p className="text-sm text-content-secondary">
                Please pay <span className="font-medium text-content-primary">₦15,000</span> to
                continue using the app, or start your 28-day free trial (one per account).
              </p>

              <div className="flex flex-col gap-3">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.location.href = PAYMENT_LINK_URL;
                    }
                  }}
                >
                  Pay ₦15,000
                </Button>

                {trialUsed ? (
                  <div className="flex items-center gap-2 text-sm text-content-secondary px-3 py-2 rounded-md bg-bg-elevated">
                    <CheckCircle2 className="size-4 text-content-tertiary" />
                    <span>Trial already used</span>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={isStartingTrial || isLoadingSnapshot}
                    onClick={handleStartTrial}
                  >
                    {isStartingTrial ? 'Starting trial…' : 'Start 28-day free trial'}
                  </Button>
                )}
              </div>

              {trialError ? (
                <div className="flex items-start gap-2 text-sm text-status-error">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <span>{trialError}</span>
                </div>
              ) : null}

              {user?.email ? (
                <p className="text-xs text-content-tertiary">
                  Signed in as <span className="text-content-secondary">{user.email}</span>. Pay
                  with this same email so we can credit your account automatically.
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                className="w-full"
                onClick={() => router.push('/auth?next=/locked')}
              >
                Sign in
              </Button>
            </div>
          )}
        </Card>

        <p className="text-xs text-content-tertiary text-center">
          Need help?{' '}
          <a
            className="underline text-content-secondary"
            href="mailto:contact@urganize.app"
          >
            contact@urganize.app
          </a>
        </p>
      </div>
    </div>
  );
}
