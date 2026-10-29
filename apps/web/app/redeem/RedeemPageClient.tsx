'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, Logo } from '@urganize/ui';
import { Gift, CheckCircle2, AlertTriangle } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';

// /redeem — the single, linkable surface for partnership promo codes.
// Reachable any time (active trial or expired), so a shareable link like
// my.urganize.app/redeem?code=SSS0709 works even though a fresh signup
// already holds a 28-day trial and would otherwise never see /locked.
//
// Copy leads with what's LIVE today (templates, workspace, tasks, files,
// milestones). No AI promises — those features aren't switched on yet.

// What redeeming actually unlocks — kept honest to the shipped product.
const PERKS = [
  'A hand-crafted rollout plan',
  'Tasks with owners, due dates, and dependencies',
  'Every rollout file in one place',
  'Milestones on your rollout timeline',
];

export default function RedeemPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authLoading = useAuthStore((state) => state.isLoading);
  const checkAuth = useAuthStore((state) => state.checkAuth);

  const codeFromUrl = (searchParams.get('code') || '').trim().toUpperCase();

  const [code, setCode] = useState(codeFromUrl);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ freeDays: number; label: string | null } | null>(null);

  // Keep the field in sync if the URL code arrives after first paint.
  useEffect(() => {
    if (codeFromUrl && !code) setCode(codeFromUrl);
  }, [codeFromUrl, code]);

  // Preserve the code through a sign-in / sign-up round-trip.
  const nextWithCode = useMemo(() => {
    const target = code ? `/redeem?code=${encodeURIComponent(code)}` : '/redeem';
    return encodeURIComponent(target);
  }, [code]);

  const handleRedeem = useCallback(async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError('Enter a promo code.');
      return;
    }
    setError(null);
    setIsRedeeming(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in again and retry.');

      const response = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: normalized }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        freeDays?: number;
        label?: string | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Could not redeem this code.');
      }

      // Refresh auth/access state, then send them into the product.
      await checkAuth({ force: true });
      setSuccess({ freeDays: payload.freeDays ?? 0, label: payload.label ?? null });
      // Brief success beat, then into the workspace.
      setTimeout(() => router.replace(HOME_PATH), 1400);
    } catch (err) {
      setError(errorMessage(err, 'Could not redeem this code.'));
      setIsRedeeming(false);
    }
  }, [code, checkAuth, router]);

  return (
    <div className="relative min-h-screen overflow-hidden p-4">
      {/* Gold-thread ray fan (NEXT_PUBLIC_FEATURE_TEXTILE). Replaces the
          blurred brand blobs below, which the same flag hides. Inert off. */}
      <div className="urg-ground-sunburst" aria-hidden="true" />
      <div className="urg-blob pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/15 blur-3xl" />
      <div className="urg-blob pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-status-info/15 blur-3xl" />

      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
        <div className="relative z-10 w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo size="lg" priority />
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-content-tertiary">
              Redeem a code
            </p>
          </div>

          <Card
            padding="lg"
            className="rounded-3xl border border-stroke-default bg-bg-surface/95 backdrop-blur-sm"
          >
            {success ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="size-10 text-brand" />
                <h1 className="font-display text-xl font-semibold text-content-primary">
                  You&apos;re in
                  {success.freeDays ? `: ${success.freeDays} days of full access` : ''}
                </h1>
                <p className="text-sm text-content-secondary">
                  {success.label ? `${success.label}. ` : ''}Taking you in…
                </p>
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-start gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand/12 text-brand">
                    <Gift className="size-4" />
                  </span>
                  <div>
                    <h1 className="font-display text-lg font-semibold text-content-primary">
                      Unlock your free access
                    </h1>
                    <p className="mt-1 text-sm text-content-secondary">
                      Enter your promo code to get full Urganize access. It is free and needs no card.
                    </p>
                  </div>
                </div>

                <ul className="mb-6 space-y-2">
                  {PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-sm text-content-secondary">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                {authLoading ? (
                  <p className="text-center text-sm text-content-tertiary">Loading…</p>
                ) : isAuthenticated ? (
                  <div className="flex flex-col gap-3">
                    <Input
                      label="Promo code"
                      value={code}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setCode(e.target.value.toUpperCase());
                        if (error) setError(null);
                      }}
                      placeholder="SSS0709"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isRedeeming}
                    />
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={isRedeeming}
                      onClick={handleRedeem}
                    >
                      {isRedeeming ? 'Redeeming…' : 'Redeem'}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-content-secondary">
                      Sign in or create your account to claim your free access.
                    </p>
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={() => router.push('/onboarding')}
                    >
                      Create your account
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => router.push(`/auth?next=${nextWithCode}`)}
                    >
                      Sign in
                    </Button>
                  </div>
                )}

                {error ? (
                  <div role="alert" className="mt-4 flex items-start gap-2 text-sm text-status-error">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
