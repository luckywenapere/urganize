'use client';

// The Day Zero activation page (#1393). Approved mocks:
// docs/mocks/dayzero-activation/mock.html. One card, one main button per state.

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Logo } from '@urganize/ui';
import { PRICING_TIERS } from '@urganize/pricing';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarRange,
  Clock,
  Info,
  KeyRound,
  Link2Off,
  Loader2,
  Mail,
  Mic,
  PartyPopper,
  Sparkles,
  UserX,
  Users,
  type LucideIcon,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { invalidateTeamAccessClientCache } from '@/lib/team-billing-client';
import { DAYZERO_PENDING_COOKIE, type DayzeroClaimState } from '@/lib/dayzero-shared';
import { clearDayzeroActivatedFlag } from '@/components/providers/DayzeroClaimer';

const DAYZERO_URL = 'https://dayzero.ltd';
const SUPPORT_MAILTO = 'mailto:contact@urganize.app?subject=Day%20Zero%20license';
const SIGN_IN_PATH = `/auth?next=${encodeURIComponent('/dayzero/callback')}`;

type View = 'checking' | 'start' | 'needs_account' | 'attached' | 'other_account' | 'expired' | 'error';

const pro = PRICING_TIERS.manager;
const PRO_INCLUDES: Array<[LucideIcon, string]> = [
  [Mic, `${pro.limits.artists} artists`],
  [Users, `${pro.limits.seats} people on your team`],
  [CalendarRange, `${pro.limits.activeReleases} rollouts at a time`],
  [Sparkles, `${pro.urgansMonthlyCredits} AI credits every month`],
];

const hasPendingCookie = () =>
  typeof document !== 'undefined' &&
  document.cookie.split(';').some((part) => part.trim() === `${DAYZERO_PENDING_COOKIE}=1`);

async function postClaim(code: string | null): Promise<DayzeroClaimState> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  try {
    const response = await fetch('/api/dayzero/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(code ? { code } : {}),
    });
    const body = (await response.json().catch(() => ({}))) as { state?: DayzeroClaimState };
    return body.state ?? 'error';
  } catch {
    return 'error';
  }
}

export default function DayzeroCallbackClient({
  code,
  activated,
  otherAccount,
}: {
  code: string;
  activated: boolean;
  otherAccount: boolean;
}) {
  const [view, setView] = useState<View>(code ? 'checking' : activated ? 'attached' : otherAccount ? 'other_account' : 'start');
  const started = useRef(false);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const settle = async (state: DayzeroClaimState) => {
      if (state === 'attached') {
        clearDayzeroActivatedFlag();
        invalidateTeamAccessClientCache();
        await checkAuth({ force: true }).catch(() => undefined);
      }
      setView(state === 'nothing' ? 'start' : state);
    };

    if (code) {
      // A code works once: take it out of the address bar before using it, so
      // a reload or a shared link never tries it twice.
      window.history.replaceState(null, '', '/dayzero/callback');
      void postClaim(code).then(settle);
      return;
    }
    if (activated) {
      clearDayzeroActivatedFlag();
      return;
    }
    if (otherAccount || !hasPendingCookie()) return;

    // Back from signing in (or still signed out) with a license waiting.
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setView('needs_account');
        return;
      }
      void postClaim(null).then(settle);
    });
  }, [activated, checkAuth, code, otherAccount]);

  const switchAccount = async () => {
    await logout().catch(() => undefined);
    window.location.assign(SIGN_IN_PATH);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-4 pb-16 pt-10 text-foreground sm:pt-16">
      <Link href="/" aria-label="Urganize" className="mb-8 sm:mb-10">
        <Logo size="lg" priority />
      </Link>
      <Card className="w-full max-w-[420px] p-6 sm:p-7">
        <div aria-live="polite">{renderView(view, switchAccount)}</div>
      </Card>
    </main>
  );
}

function renderView(view: View, switchAccount: () => void): ReactNode {
  switch (view) {
    case 'checking':
      return (
        <div className="flex flex-col items-center py-6 text-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <p className="mt-4 text-[15px] text-muted-foreground">Checking your license…</p>
        </div>
      );

    case 'needs_account':
      return (
        <>
          <div className="flex items-start justify-between">
            <Tile icon={BadgeCheck} />
            <span className="inline-flex items-center rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              Pro for life
            </span>
          </div>
          <Heading>Your Day Zero license is ready</Heading>
          <Body>Create your Urganize account, or sign in to the one you have. Pro goes on it straight away.</Body>
          <Actions>
            <Link href="/onboarding" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
              Create your account
            </Link>
            <Link href={SIGN_IN_PATH} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
              I already have an account
            </Link>
          </Actions>
          <Note icon={Clock}>This device holds your license for 1 hour. After that, click Activate in Day Zero again.</Note>
        </>
      );

    case 'attached':
      return (
        <>
          <Tile icon={PartyPopper} />
          <Heading>Pro is yours, for life</Heading>
          <Body>No card and no renewals. Here is what your team gets:</Body>
          <ul className="mt-5 flex flex-col gap-3">
            {PRO_INCLUDES.map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-3 text-[15px]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                {label}
              </li>
            ))}
          </ul>
          <div className="mt-6 h-px w-full bg-border" />
          <Actions>
            <Link href={HOME_PATH} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
              Open your dashboard
              <ArrowRight aria-hidden />
            </Link>
          </Actions>
        </>
      );

    case 'other_account':
      return (
        <>
          <Tile icon={UserX} tone="warn" />
          <Heading>This license is on another account</Heading>
          <Body>Each Day Zero license works on one Urganize account. Sign in with the account you used the first time.</Body>
          <Actions>
            <Button size="lg" className="w-full" onClick={switchAccount}>
              Switch account
            </Button>
            <a href={SUPPORT_MAILTO} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
              <Mail aria-hidden />
              Email us
            </a>
          </Actions>
          <Note icon={Info}>Bought a second license? Activate it from Day Zero while signed in to the other account.</Note>
        </>
      );

    case 'expired':
    case 'error':
      return (
        <>
          <Tile icon={Link2Off} tone="warn" />
          <Heading>{view === 'expired' ? 'This activation link has expired' : 'We could not check your license'}</Heading>
          <Body>
            {view === 'expired'
              ? 'Day Zero links work once, for 10 minutes. Go back to your Day Zero account and click Activate again.'
              : 'Something went wrong on our side. Go back to your Day Zero account and click Activate again. If it keeps happening, email us.'}
          </Body>
          <Actions>
            <a href={DAYZERO_URL} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
              Back to Day Zero
              <ArrowUpRight aria-hidden />
            </a>
            <a href={SUPPORT_MAILTO} className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full text-muted-foreground')}>
              Email us
            </a>
          </Actions>
        </>
      );

    case 'start':
    default:
      return (
        <>
          <Tile icon={KeyRound} tone="muted" />
          <Heading>Activate from your Day Zero account</Heading>
          <Body>Open your Day Zero account, find Urganize and click Activate. You come back here and Pro is added to your account.</Body>
          <Actions>
            <a href={DAYZERO_URL} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
              Open Day Zero
              <ArrowUpRight aria-hidden />
            </a>
            <Link href={HOME_PATH} className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full text-muted-foreground')}>
              I already activated, open Urganize
            </Link>
          </Actions>
        </>
      );
  }
}

function Tile({ icon: Icon, tone = 'primary' }: { icon: LucideIcon; tone?: 'primary' | 'warn' | 'muted' }) {
  const toneClass = {
    primary: 'bg-primary/15 text-primary',
    warn: 'bg-status-warning/15 text-status-warning',
    muted: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <span className={cn('grid size-12 place-items-center rounded-xl', toneClass)}>
      <Icon className="size-6" aria-hidden />
    </span>
  );
}

const Heading = ({ children }: { children: ReactNode }) => (
  <h1 className="mt-5 font-display text-[26px] leading-tight tracking-tight sm:text-[28px]">{children}</h1>
);

const Body = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{children}</p>
);

const Actions = ({ children }: { children: ReactNode }) => <div className="mt-7 flex flex-col gap-2">{children}</div>;

const Note = ({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) => (
  <p className="mt-5 flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
    <span>{children}</span>
  </p>
);
