'use client';

// Closed sign-up (2026-10-15). /locked?reason=not_approved: a signed-in account
// nobody has let in yet (most often a stray Google sign-up). Plain and short.
//
// On open it posts whatever invite this browser holds (a /start code, a founder
// /welcome link) and asks whether the account is let in, so someone the founder
// approved while they waited, or who opened their link after signing up, is
// taken into the app instead of being told to wait.

import { useEffect, useState } from 'react';
import { FaLinkedin } from 'react-icons/fa6';
import { SiFacebook, SiInstagram, SiTelegram, SiTiktok, SiWhatsapp, SiX } from 'react-icons/si';
import { useRouter } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { HELD_COPY } from '@/lib/access-gate';
import { redeemPendingAccess } from '@/lib/access-intent';
import { SOCIAL_LINKS } from '@/lib/email/links';
import {
  FRIENDS_NEEDED,
  SHARE_COPY,
  buildShareMessage,
  buildShareTargets,
  formatPlace,
  initialsOf,
  shareLinkLabel,
  type ShareTargetId,
} from '@/lib/waitlist-share';
import {
  PENDING_CHECKOUT_METADATA_KEY,
  SELF_SERVE_COPY,
  checkoutPath,
  finishBody,
  readPendingCheckout,
  type CheckoutIntent,
} from '@/lib/self-serve';

const outlinePillClass =
  'flex w-full items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 py-3.5 text-lg font-semibold text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50';

type ShareView = { url: string; friends: number; place: number | null; name: string };

const TARGET_ICONS: Record<ShareTargetId, typeof SiX> = {
  whatsapp: SiWhatsapp,
  x: SiX,
  telegram: SiTelegram,
  linkedin: FaLinkedin,
  facebook: SiFacebook,
};

const socialHref = (label: string): string => SOCIAL_LINKS.find((s) => s.label === label)?.href ?? '';

const FOLLOW_ICONS = [
  { label: 'Instagram', href: socialHref('Instagram'), Icon: SiInstagram },
  { label: 'TikTok', href: socialHref('TikTok'), Icon: SiTiktok },
  { label: 'X', href: socialHref('X'), Icon: SiX },
  { label: 'LinkedIn', href: socialHref('LinkedIn'), Icon: FaLinkedin },
];

const iconButtonClass =
  'flex size-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover';

function WaitlistShare({ share, signingOut, onSignOut }: { share: ShareView; signingOut: boolean; onSignOut: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = buildShareMessage(share.url);
  const targets = buildShareTargets(share.url, message);
  const whatsapp = targets[0];
  const place = share.place;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Blocked: the link is on screen to copy by hand.
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center px-6 py-10">
      <div className="urg-ground-sunburst" aria-hidden="true" />
      <div className="urg-above flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-8">
        <Logo />
        <div className="grid w-full items-center gap-8 md:grid-cols-2 md:gap-14">
          <div className="flex items-end gap-5 rounded-3xl border border-stroke-default bg-bg-surface p-5 sm:p-6">
            <div
              aria-hidden="true"
              className="flex size-28 shrink-0 items-center justify-center rounded-2xl bg-bg-elevated font-display text-4xl font-bold text-content-secondary sm:size-32"
            >
              {initialsOf(share.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-bold text-content-primary sm:text-2xl">
                {share.name || 'You'}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-content-secondary">
                {place ? `${formatPlace(place).replace('# ', '#')} · ` : ''}On the list
              </p>
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-content-tertiary">{SHARE_COPY.lineLabel}</p>
            {place ? (
              <p className="mt-2 font-display text-5xl font-bold text-content-primary sm:text-6xl">{formatPlace(place)}</p>
            ) : null}
            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.12em] text-content-tertiary">{SHARE_COPY.goalLabel}</p>
            <div
              className="mt-3 flex justify-center gap-2"
              role="img"
              aria-label={`${Math.min(share.friends, FRIENDS_NEEDED)} of ${FRIENDS_NEEDED} friends joined`}
            >
              {Array.from({ length: FRIENDS_NEEDED }, (_, index) => (
                <span
                  key={index}
                  className={`h-2 w-14 rounded-full ${index < share.friends ? 'bg-brand' : 'bg-bg-elevated'}`}
                />
              ))}
            </div>
            <p className="mt-3 text-sm text-content-secondary">{SHARE_COPY.progress(share.friends)}</p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-5 flex min-h-12 w-full items-center justify-between gap-3 rounded-full border border-stroke-default bg-bg-surface px-5 text-sm font-semibold uppercase tracking-wide text-content-primary hover:bg-bg-hover"
              aria-label={SHARE_COPY.copy}
            >
              <span className="truncate">{shareLinkLabel(share.url)}</span>
              <span className="shrink-0 text-xs normal-case text-content-secondary" aria-live="polite">
                {copied ? SHARE_COPY.copied : SHARE_COPY.copy}
              </span>
            </button>
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <a
            href={whatsapp.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-8 text-lg font-semibold text-content-inverse transition-colors duration-fast ease-standard hover:bg-brand-hover"
          >
            {SHARE_COPY.share}
          </a>
          <div className="flex flex-wrap justify-center gap-3" aria-label="Share on">
            {targets.slice(1).map((target) => {
              const Icon = TARGET_ICONS[target.id];
              return (
                <a
                  key={target.id}
                  href={target.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Share on ${target.label}`}
                  className={iconButtonClass}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </a>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="min-h-11 text-sm text-content-secondary underline underline-offset-4"
          >
            {SHARE_COPY.signOut}
          </button>
        </div>
      </div>

      <footer className="urg-above mt-10 flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 text-sm text-content-secondary">
        <div className="flex items-center gap-4">
          {FOLLOW_ICONS.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Urganize on ${label}`}
              className="flex size-11 items-center justify-center hover:text-content-primary"
            >
              <Icon className="size-5" aria-hidden="true" />
            </a>
          ))}
          <a href="mailto:contact@urganize.app" className="min-h-11 content-center hover:text-content-primary">
            Email
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="https://urganize.app/terms" target="_blank" rel="noopener noreferrer" className="hover:text-content-primary">
            Terms
          </a>
          <a href="https://urganize.app/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-content-primary">
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}

export function HeldAccountScreen() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const [signingOut, setSigningOut] = useState(false);
  // Self-serve checkout (2026-10-22): someone who picked a plan and signed up
  // but has not paid yet. One action: finish paying.
  const [pendingCheckout, setPendingCheckout] = useState<CheckoutIntent | null>(null);
  const [share, setShare] = useState<ShareView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) router.replace('/auth');
        return;
      }
      const metadata = (data.session?.user.user_metadata || {}) as Record<string, unknown>;
      const pending = readPendingCheckout({ [PENDING_CHECKOUT_METADATA_KEY]: metadata[PENDING_CHECKOUT_METADATA_KEY] });
      if (!cancelled && pending) setPendingCheckout(pending);
      const answer = await redeemPendingAccess(token);
      // Only a real yes moves them on: a failed request must not bounce them
      // home and straight back here.
      let letIn = answer.approved;
      if (!cancelled && !pending) {
        // The place-in-line screen. A failed load keeps the plain screen below.
        try {
          const response = await fetch('/api/waitlist/share', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (response.ok) {
            const payload = (await response.json()) as ShareView & { approved?: boolean };
            if (!cancelled && payload.approved === false) setShare(payload);
            if (payload.approved === true) letIn = true;
          }
        } catch {
          // Plain screen.
        }
      }
      if (cancelled || !answer.answered || !letIn) return;
      try {
        await checkAuth({ force: true });
      } catch {
        // The next page load re-checks.
      }
      if (!cancelled) router.replace(HOME_PATH);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [checkAuth, router]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace('/auth');
    }
  };

  if (pendingCheckout) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
        <div className="urg-above flex w-full max-w-sm flex-col items-center text-center">
          <Logo />
          <h1 className="mt-10 font-display text-2xl font-bold text-content-primary">{SELF_SERVE_COPY.finishTitle}</h1>
          <p className="mt-3 text-base text-content-secondary">{finishBody(pendingCheckout.plan)}</p>
          <button
            type="button"
            onClick={() => router.push(checkoutPath(pendingCheckout))}
            className="mt-10 flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-lg font-semibold text-content-inverse hover:bg-brand-hover"
          >
            Finish setting up
          </button>
          <p className="mt-6 text-sm text-content-secondary">
            <button
              type="button"
              onClick={() => router.push(`${checkoutPath(pendingCheckout)}&change=1`)}
              className="min-h-11 underline underline-offset-4"
            >
              Change plan
            </button>
            {' · '}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="min-h-11 underline underline-offset-4"
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (share) {
    return <WaitlistShare share={share} signingOut={signingOut} onSignOut={() => void handleSignOut()} />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="urg-ground-sunburst" aria-hidden="true" />
      <div className="urg-above flex w-full max-w-sm flex-col items-center text-center">
        <Logo />
        <h1 className="mt-10 font-display text-2xl font-bold text-content-primary">{HELD_COPY.title}</h1>
        <p className="mt-3 text-base text-content-secondary">{HELD_COPY.body}</p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className={`mt-10 ${outlinePillClass}`}
        >
          {HELD_COPY.cta}
        </button>
      </div>
    </div>
  );
}
