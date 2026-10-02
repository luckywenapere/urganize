'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { Copy, RefreshCw } from '@/components/icons';
import { formatNaira } from '@/lib/pitch-payments';
import type { PartnerOverview } from '@/lib/referrals-server';

// /admin/referrals — referral partners and what each is owed.
//
// The terms are in the strategy doc (section 10): a partner's code tags the
// teams that sign up with it, and the partner earns 10% of those teams'
// subscription payments for each team's first 12 months, paid monthly by the
// 10th on payments that cleared the month before. This page shows that worked
// out fresh from the payments we recorded, lets the founder record a payout,
// and keeps a refunded payment out of the sum.
//
// Same gate as /admin/scoreboard: authLoading -> no user -> /auth, and the
// backing route's 401 or 403 is the real check.

/** What the page sends. The server parses it (parseAdminRequest), so this
 *  is the wire shape: a payout goes up in naira and the server makes it kobo. */
type AdminRequest = { type: string } & Record<string, unknown>;

const FIELD =
  'h-9 w-full rounded-lg border border-stroke-control bg-bg-surface px-3 text-sm text-content-primary placeholder:text-content-tertiary hover:border-content-secondary';
const BUTTON =
  'motion-focus inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm text-content-secondary transition-colors hover:bg-bg-hover disabled:opacity-60';
const PRIMARY =
  'motion-focus inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand px-3 text-sm font-medium text-content-inverse transition-colors hover:bg-brand/90 disabled:opacity-60';

function longDate(iso: string | null): string {
  if (!iso) return 'not yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'not yet';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
}

export default function ReferralsAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [partners, setPartners] = useState<PartnerOverview[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), 6000);
  }, []);

  const tokenOrNull = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      setLoading(true);
      try {
        const token = await tokenOrNull();
        if (!token) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const response = await fetch('/api/admin/referrals', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { partners?: PartnerOverview[]; error?: string };
        if (!response.ok || !body.partners) {
          setError(body.error || 'Could not load referral partners.');
          setChecked(true);
          return;
        }
        setPartners(body.partners);
        setChecked(true);
      } catch {
        setError('Could not load referral partners.');
        setChecked(true);
      } finally {
        setLoading(false);
      }
    },
    [router, tokenOrNull]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, user, router, load]);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    []
  );

  /** Runs one action, says what happened, and reloads. Returns whether it worked. */
  const run = useCallback(
    async (action: AdminRequest): Promise<boolean> => {
      setBusy(true);
      try {
        const token = await tokenOrNull();
        if (!token) {
          announce('You are signed out. Sign in again.');
          return false;
        }
        const response = await fetch('/api/admin/referrals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(action),
        });
        const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
        if (!response.ok) {
          announce(body.error || 'That did not work.');
          return false;
        }
        announce(body.message || 'Done.');
        await load();
        return true;
      } catch {
        announce('That did not work. Try again.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [announce, load, tokenOrNull]
  );

  if (authLoading || !checked) {
    return <AdminPageSkeleton titleWidth="w-40" descriptionLines={2} table={{ columns: 6, rows: 4 }} />;
  }

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-content-tertiary">Admin</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-content-primary">Referrals</h1>
        <button type="button" onClick={() => void load()} disabled={loading} className={BUTTON}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {loading ? 'Loading' : 'Refresh'}
        </button>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        A partner&rsquo;s code tags the teams that sign up through their link. They earn 10% of those
        teams&rsquo; subscription payments for each team&rsquo;s first 12 months, paid by the 10th of the next
        month. Credits, distribution and refunded payments earn nothing.
      </p>

      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-content-secondary">
        {status}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error"
        >
          {error}
        </p>
      ) : null}

      <AddPartnerForm busy={busy} onAdd={run} />

      <div className="mt-6 space-y-6">
        {(partners ?? []).length === 0 && !error ? (
          <p className="text-sm text-content-secondary">No partners yet. Add the first one above.</p>
        ) : null}
        {(partners ?? []).map((partner) => (
          <PartnerCard key={partner.id} partner={partner} busy={busy} onAction={run} announce={announce} />
        ))}
      </div>
    </div>
  );
}

function AddPartnerForm({ busy, onAdd }: { busy: boolean; onAdd: (action: AdminRequest) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await onAdd({ type: 'create_partner', name, code, contactEmail: email.trim() || null });
    if (ok) {
      setName('');
      setCode('');
      setEmail('');
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-stroke-default bg-bg-surface p-4">
      <h2 className="text-sm font-medium text-content-primary">Add a partner</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-content-secondary">
          Name
          <input
            className={`${FIELD} mt-1`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sound Wave Spotlight"
            maxLength={120}
            required
          />
        </label>
        <label className="text-xs text-content-secondary">
          Code
          <input
            className={`${FIELD} mt-1 uppercase`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="SOUNDWAVE"
            maxLength={40}
            required
          />
        </label>
        <label className="text-xs text-content-secondary">
          Contact email (optional)
          <input
            className={`${FIELD} mt-1`}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            maxLength={200}
          />
        </label>
      </div>
      <button type="submit" disabled={busy || !name.trim() || !code.trim()} className={`${PRIMARY} mt-3`}>
        Add partner
      </button>
    </form>
  );
}

function PartnerCard({
  partner,
  busy,
  onAction,
  announce,
}: {
  partner: PartnerOverview;
  busy: boolean;
  onAction: (action: AdminRequest) => Promise<boolean>;
  announce: (message: string) => void;
}) {
  const { statement } = partner;
  const [attachEmail, setAttachEmail] = useState('');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(partner.link);
      announce('Link copied.');
    } catch {
      announce('Could not copy. Select the link and copy it by hand.');
    }
  };

  return (
    <section
      aria-label={partner.name}
      className="rounded-xl border border-stroke-default bg-bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-content-primary">
            {partner.name}{' '}
            <span className="ml-1 rounded-md border border-stroke-default px-1.5 py-0.5 font-mono text-xs font-normal text-content-secondary">
              {partner.code}
            </span>
            {!partner.active ? (
              <span className="ml-2 text-xs font-normal text-status-warning">Switched off</span>
            ) : null}
          </h2>
          <p className="mt-1 text-xs text-content-tertiary">
            {partner.commissionBps / 100}% for {partner.commissionMonths} months
            {partner.contactEmail ? ` · ${partner.contactEmail}` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAction({ type: 'set_partner_active', partnerId: partner.id, active: !partner.active })}
          className={BUTTON}
        >
          {partner.active ? 'Switch off' : 'Switch on'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-stroke-default bg-bg-base px-3 py-2 text-xs text-content-secondary">
          {partner.link}
        </code>
        <button type="button" onClick={() => void copyLink()} className={BUTTON}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy link
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Teams tagged" value={String(partner.teamCount)} />
        <Stat label="Earned so far" value={formatNaira(statement.totalCommissionKobo)} />
        <Stat label="Paid" value={formatNaira(statement.totalPaidKobo)} />
        <Stat label="Still owed" value={formatNaira(statement.totalOutstandingKobo)} strong={statement.totalOutstandingKobo > 0} />
      </dl>

      <h3 className="mt-5 text-sm font-medium text-content-primary">By month</h3>
      {statement.months.length === 0 ? (
        <p className="mt-1 text-sm text-content-secondary">No payments from this partner&rsquo;s teams yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-content-tertiary">
              <tr>
                <th className="py-1 pr-3 font-normal">Month</th>
                <th className="py-1 pr-3 font-normal">Payments</th>
                <th className="py-1 pr-3 font-normal">Teams paid</th>
                <th className="py-1 pr-3 font-normal">Commission</th>
                <th className="py-1 pr-3 font-normal">Due by</th>
                <th className="py-1 font-normal">Payout</th>
              </tr>
            </thead>
            <tbody>
              {statement.months.map((line) => (
                <tr key={line.month} className="border-t border-stroke-default align-top">
                  <td className="py-2 pr-3 text-content-primary">{line.month}</td>
                  <td className="py-2 pr-3 text-content-secondary">{line.chargeCount}</td>
                  <td className="py-2 pr-3 text-content-secondary">{formatNaira(line.baseKobo)}</td>
                  <td className="py-2 pr-3 text-content-primary">{formatNaira(line.commissionKobo)}</td>
                  <td className="py-2 pr-3 text-content-secondary">{longDate(`${line.dueOn}T12:00:00+01:00`)}</td>
                  <td className="py-2">
                    <PayoutCell partnerId={partner.id} line={line} busy={busy} onAction={onAction} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-5 text-sm font-medium text-content-primary">Teams</h3>
      {statement.teams.length === 0 ? (
        <p className="mt-1 text-sm text-content-secondary">No teams tagged yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-content-tertiary">
              <tr>
                <th className="py-1 pr-3 font-normal">Team</th>
                <th className="py-1 pr-3 font-normal">Tagged</th>
                <th className="py-1 pr-3 font-normal">First payment</th>
                <th className="py-1 pr-3 font-normal">Earns until</th>
                <th className="py-1 font-normal">Commission</th>
              </tr>
            </thead>
            <tbody>
              {statement.teams.map((team) => (
                <tr key={team.workspaceId} className="border-t border-stroke-default">
                  <td className="py-2 pr-3 text-content-primary">{team.name || 'Unnamed team'}</td>
                  <td className="py-2 pr-3 text-content-secondary">{longDate(team.attachedAt)}</td>
                  <td className="py-2 pr-3 text-content-secondary">{longDate(team.firstChargeAt)}</td>
                  <td className="py-2 pr-3 text-content-secondary">
                    {team.windowEndsAt ? longDate(team.windowEndsAt) : 'Starts at first payment'}
                  </td>
                  <td className="py-2 text-content-primary">{formatNaira(team.commissionKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const ok = await onAction({ type: 'attach_team', code: partner.code, ownerEmail: attachEmail });
          if (ok) setAttachEmail('');
        }}
      >
        <label className="min-w-[14rem] flex-1 text-xs text-content-secondary">
          Tag a team that missed the link (owner&rsquo;s email)
          <input
            className={`${FIELD} mt-1`}
            type="email"
            value={attachEmail}
            onChange={(event) => setAttachEmail(event.target.value)}
            placeholder="owner@team.com"
            required
          />
        </label>
        <button type="submit" disabled={busy || !attachEmail.trim()} className={BUTTON}>
          Tag team
        </button>
      </form>

      <h3 className="mt-5 text-sm font-medium text-content-primary">Recent payments</h3>
      <p className="mt-1 text-xs text-content-tertiary">
        If a customer was refunded, exclude that payment so it stops earning commission.
      </p>
      {partner.recentCharges.length === 0 ? (
        <p className="mt-1 text-sm text-content-secondary">None yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-stroke-default">
          {partner.recentCharges.map((charge) => (
            <ChargeLine key={charge.reference} charge={charge} busy={busy} onAction={onAction} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-stroke-default bg-bg-base px-3 py-2">
      <dt className="text-xs text-content-tertiary">{label}</dt>
      <dd className={`mt-0.5 text-base ${strong ? 'font-semibold text-content-primary' : 'text-content-primary'}`}>
        {value}
      </dd>
    </div>
  );
}

function PayoutCell({
  partnerId,
  line,
  busy,
  onAction,
}: {
  partnerId: string;
  line: PartnerOverview['statement']['months'][number];
  busy: boolean;
  onAction: (action: AdminRequest) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');

  if (open) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const ok = await onAction({
            type: 'record_payout',
            partnerId,
            month: line.month,
            amountNaira: Number(amount),
            note: null,
          });
          if (ok) setOpen(false);
        }}
      >
        <label className="sr-only" htmlFor={`payout-${partnerId}-${line.month}`}>
          Amount paid for {line.month}, in naira
        </label>
        <input
          id={`payout-${partnerId}-${line.month}`}
          className={`${FIELD} w-32`}
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Naira"
          required
        />
        <button type="submit" disabled={busy || !amount.trim()} className={PRIMARY}>
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className={BUTTON}>
          Cancel
        </button>
      </form>
    );
  }

  const prefill = () => {
    // What is still owed, or what was paid when editing a settled month.
    const kobo = line.paidKobo !== null && line.outstandingKobo === 0 ? line.paidKobo : line.outstandingKobo || line.commissionKobo;
    setAmount(String(kobo / 100));
    setOpen(true);
  };

  if (line.paidKobo !== null && line.outstandingKobo === 0) {
    return (
      <div className="text-content-secondary">
        <span>
          Paid {formatNaira(line.paidKobo)} on {longDate(line.paidAt)}
        </span>
        {line.overpaidKobo > 0 ? (
          <span className="block text-status-warning">
            Overpaid by {formatNaira(line.overpaidKobo)} after a refund.
          </span>
        ) : null}
        <button type="button" onClick={prefill} className="mt-1 block text-xs underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      {line.paidKobo !== null ? (
        <span className="block text-content-secondary">Part paid: {formatNaira(line.paidKobo)}</span>
      ) : null}
      <span className={`block ${line.overdue ? 'text-status-error' : 'text-content-primary'}`}>
        {formatNaira(line.outstandingKobo)} owed{line.overdue ? ' (late)' : ''}
      </span>
      {line.commissionKobo > 0 || line.paidKobo !== null ? (
        <button type="button" onClick={prefill} disabled={busy} className="mt-1 text-xs underline">
          Record payment
        </button>
      ) : null}
    </div>
  );
}

function ChargeLine({
  charge,
  busy,
  onAction,
}: {
  charge: PartnerOverview['recentCharges'][number];
  busy: boolean;
  onAction: (action: AdminRequest) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={charge.excluded ? 'text-content-tertiary line-through' : 'text-content-primary'}>
          {charge.workspaceName || 'Unnamed team'} · {formatNaira(charge.amountKobo)}
          <span className="ml-2 text-xs text-content-tertiary no-underline">
            {charge.source.replace('_', ' ')} · {longDate(charge.chargedAt)}
          </span>
        </div>
        {charge.excluded ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAction({ type: 'restore_charge', reference: charge.reference })}
            className={BUTTON}
          >
            Restore
          </button>
        ) : (
          <button type="button" onClick={() => setAsking((value) => !value)} className={BUTTON}>
            Exclude
          </button>
        )}
      </div>
      {charge.excluded && charge.excludedReason ? (
        <p className="mt-1 text-xs text-content-tertiary">Excluded: {charge.excludedReason}</p>
      ) : null}
      {asking && !charge.excluded ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await onAction({ type: 'exclude_charge', reference: charge.reference, reason });
            if (ok) {
              setAsking(false);
              setReason('');
            }
          }}
        >
          <label className="sr-only" htmlFor={`why-${charge.reference}`}>
            Why this payment should not earn commission
          </label>
          <input
            id={`why-${charge.reference}`}
            className={`${FIELD} min-w-[14rem] flex-1`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why? For example: refunded on 12 Nov"
            maxLength={300}
            required
          />
          <button type="submit" disabled={busy || !reason.trim()} className={PRIMARY}>
            Exclude payment
          </button>
        </form>
      ) : null}
    </li>
  );
}
