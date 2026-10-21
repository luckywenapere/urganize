'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Gift } from '@/components/icons';
import { isReferralsEnabled } from '@/lib/referrals';
import { isReferralCreditsEnabled, type ReferralStats } from '@/lib/referral-credits';
import { getAccessToken } from './getAccessToken';
import { panelClass } from './panelClass';

// "Invite another team" (referral credits, flag-off). Sits at the bottom of
// Settings -> Team: first the people on this team, then the keys for people not
// on it, then the link that brings in a whole other team.
//
// It draws NOTHING unless it has something true to say: both switches off, a
// person who does not own a team (the code belongs to the team's owner), or a
// load that failed. A settings page full of empty placeholders is worse than a
// section that is simply not there, and an error here is not worth interrupting
// anyone's settings for.

type Mine = {
  code: string;
  link: string;
  stats: ReferralStats;
  reward: { credits: number; cap: number };
};

const number = new Intl.NumberFormat('en');

export function ReferralInviteSection() {
  const enabled = isReferralsEnabled() && isReferralCreditsEnabled();
  const [mine, setMine] = useState<Mine | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch('/api/referrals/mine', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as (Partial<Mine> & { available?: boolean }) | null;
        if (cancelled || !body?.available || !body.code || !body.link || !body.stats || !body.reward) return;
        setMine({ code: body.code, link: body.link, stats: body.stats, reward: body.reward });
      } catch {
        // Nothing to show; the section stays out of the way.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  if (!enabled || !mine) return null;

  const copy = async () => {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(mine.link);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  };

  const { stats, reward } = mine;

  return (
    <section id="invite-another-team" className={`${panelClass} scroll-mt-24`}>
      <h2 className="mb-1 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        <Gift className="h-3.5 w-3.5" aria-hidden="true" />
        Invite another team
      </h2>
      <p className="mb-5 max-w-prose text-sm leading-6 text-content-secondary">
        Share this link with a manager or an artist who runs their own team. When they sign up and make
        their first payment, you get {number.format(reward.credits)} credits. You can earn this up to{' '}
        {reward.cap} times.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <label className="sr-only" htmlFor="referral-link">
          Your invite link
        </label>
        <input
          id="referral-link"
          readOnly
          value={mine.link}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 rounded-lg border border-stroke-control bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none hover:border-content-secondary focus:border-brand"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="hit-44 relative motion-focus inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-content-secondary">
        {failed ? 'Could not copy. Select the link and copy it by hand.' : ''}
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-3 sm:max-w-md">
        <Stat label="Teams invited" value={String(stats.invited)} />
        <Stat label="Subscribed" value={String(stats.rewarded)} />
        <Stat label="Credits earned" value={number.format(stats.creditsEarned)} />
      </dl>

      {stats.capReached ? (
        <p className="mt-3 text-sm text-content-secondary">
          You have earned the most you can from invites. The link still works for your friends.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-content-tertiary">{label}</dt>
      <dd className="mt-0.5 text-base text-content-primary">{value}</dd>
    </div>
  );
}
