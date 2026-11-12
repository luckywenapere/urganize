'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/components/press-kits/press-kit-client';
import { recallLast } from '@/lib/last-seen';
import { isCreditsEnabled } from '@/lib/credits/config';
import { seatMeter, type TeamPageResponse } from '@/lib/team-page';
import { deskHref } from '@/lib/settings-desk';

type CapRead = { eligible: boolean; allowance: number; balance: number | null; card: string | null };

/**
 * The rows under the plan on the computer's Plan and billing page (#1226):
 * seats, AI credits and the card, each linking where you change it. A row
 * shows only when we have its number; there is no receipts page, so there is
 * no Receipts row.
 */
export function PlanRows() {
  const [team, setTeam] = useState<TeamPageResponse | null>(() => recallLast<TeamPageResponse>('team', 'mine'));
  const [cap, setCap] = useState<CapRead | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const headers = await authHeaders();
      if (!headers) return;
      const [teamBody, capBody] = await Promise.all([
        fetch('/api/team', { headers, cache: 'no-store' })
          .then((response) => (response.ok ? (response.json() as Promise<TeamPageResponse>) : null))
          .catch(() => null),
        isCreditsEnabled()
          ? fetch('/api/billing/credit-cap', { headers, cache: 'no-store' })
              .then((response) => (response.ok ? (response.json() as Promise<CapRead>) : null))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!live) return;
      if (teamBody) setTeam(teamBody);
      if (capBody) setCap(capBody);
    })();
    return () => {
      live = false;
    };
  }, []);

  const rows: { key: string; label: string; value: string; href: string; link: string }[] = [];
  if (team) {
    const seats = seatMeter(team.seatsUsed, team.seatLimit);
    rows.push({
      key: 'seats',
      label: 'Seats',
      value: team.seatLimit === null ? seats.line : `${team.seatsUsed} of ${team.seatLimit} used`,
      href: deskHref('team'),
      link: 'Team',
    });
  }
  if (cap && cap.eligible && cap.allowance > 0) {
    rows.push({
      key: 'credits',
      label: 'AI credits',
      value: `${Math.max(0, cap.balance ?? 0).toLocaleString('en')} of ${cap.allowance.toLocaleString('en')} left this month`,
      href: deskHref('credits'),
      link: 'AI credits',
    });
  }
  if (cap?.card) {
    // The saved card pays for credits past the month; nothing here changes it.
    rows.push({ key: 'card', label: 'Card', value: cap.card, href: '', link: '' });
  }
  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-stroke-default bg-bg-surface">
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[180px_minmax(0,1fr)_auto] items-center gap-4 border-t border-stroke-default px-5 py-3.5 first:border-t-0"
        >
          <span className="text-sm text-content-secondary">{row.label}</span>
          <span className="truncate text-sm font-medium text-content-primary">{row.value}</span>
          {row.href ? (
            <Link href={row.href} className="motion-focus text-sm font-semibold text-brand hover:underline">
              {row.link}
            </Link>
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}
