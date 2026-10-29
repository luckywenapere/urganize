'use client';

// Closed sign-up (2026-10-15). What a signed-out visitor with no invite reads on
// /auth and /onboarding, before any wizard: plain and short, founder copy.

import Link from 'next/link';
import { INVITE_ONLY_COPY, WAITLIST_URL } from '@/lib/access-gate';
import { openExternalUrl } from '@/lib/external-link';

const primaryPillClass =
  'flex w-full items-center justify-center rounded-full bg-brand px-5 py-3.5 text-lg font-semibold text-content-inverse transition-colors duration-fast ease-standard hover:bg-brand-hover';

type Props = {
  /** Where "Sign in." goes. Defaults to /auth. */
  signInHref?: string;
  /** Used instead of the link when the notice sits on /auth itself. */
  onSignIn?: () => void;
  className?: string;
};

export function InviteOnlyNotice({ signInHref = '/auth', onSignIn, className = '' }: Props) {
  return (
    <div role="status" className={`w-full text-center ${className}`}>
      <h2 className="font-display text-2xl font-normal text-content-primary">{INVITE_ONLY_COPY.title}</h2>
      <p className="mt-3 text-base text-content-secondary">{INVITE_ONLY_COPY.body}</p>
      <button
        type="button"
        onClick={() => {
          void openExternalUrl(WAITLIST_URL);
        }}
        className={`mt-8 ${primaryPillClass}`}
      >
        {INVITE_ONLY_COPY.cta}
      </button>
      <p className="mt-5 text-base text-content-secondary">
        {INVITE_ONLY_COPY.signInLead}{' '}
        {onSignIn ? (
          <button
            type="button"
            onClick={onSignIn}
            className="font-semibold text-brand underline underline-offset-2"
          >
            {INVITE_ONLY_COPY.signInLink}
          </button>
        ) : (
          <Link href={signInHref} className="font-semibold text-brand underline underline-offset-2">
            {INVITE_ONLY_COPY.signInLink}
          </Link>
        )}
      </p>
    </div>
  );
}
