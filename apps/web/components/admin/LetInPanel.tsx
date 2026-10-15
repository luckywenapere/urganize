'use client';

// Closed sign-up (2026-10-15): the founder's let-in tools, shown on
// /admin/waitlist. Three things, all through /api/admin/access:
//   - "Let in by email": mints a single-use /start/<code> link (14 days) and
//     pre-approves the email, so signing up with it lets them in even without
//     the link. Blank email = a link anyone can use once.
//   - The result: the link to copy, and a WhatsApp button with the message
//     written (opens their chat when a phone number is known).
//   - "Held accounts": people who signed up without an invite, one tap to let in.
// The waitlist rows' own "Let in" buttons call the same createLetInInvite.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, MessageCircle } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { openExternalUrl } from '@/lib/external-link';

export type LetInRequest = {
  email?: string;
  name?: string;
  phone?: string;
  waitlistId?: number;
};

export type LetInResult = {
  url: string;
  message: string;
  whatsappUrl: string;
  approvedExisting: boolean;
  forLabel: string;
};

type HeldAccount = { id: string; email: string | null; name: string | null; role: string | null; createdAt: string };

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

export async function postLetIn(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch('/api/admin/access', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error || 'Something went wrong.'));
  return payload;
}

export async function createLetInInvite(request: LetInRequest): Promise<LetInResult> {
  const payload = await postLetIn({ action: 'invite', ...request });
  return {
    url: String(payload.url || ''),
    message: String(payload.message || ''),
    whatsappUrl: String(payload.whatsappUrl || ''),
    approvedExisting: payload.approvedExisting === true,
    forLabel: request.name || request.email || 'anyone (single use)',
  };
}

function formatShort(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return '';
  }
}

const inputClass =
  'motion-focus h-10 min-w-0 flex-1 rounded-lg border border-stroke-control bg-bg-elevated px-3 text-sm text-content-primary placeholder:text-content-tertiary hover:border-content-secondary focus:border-brand';
const buttonClass =
  'motion-focus inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-stroke-default bg-bg-surface px-4 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60';
const primaryButtonClass =
  'motion-focus inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60';

export function LetInResultCard({ result, onClose }: { result: LetInResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is selectable below.
    }
  };
  return (
    <div className="mt-6 rounded-lg border border-brand/40 bg-brand/8 p-4" role="status">
      <p className="text-sm font-semibold text-content-primary">
        Invite ready for {result.forLabel}
        {result.approvedExisting ? '. Their account is let in already.' : '.'}
      </p>
      <p className="mt-1 text-xs text-content-secondary">Works once, for 14 days. Send it on WhatsApp or copy it.</p>
      <input
        readOnly
        value={result.url}
        aria-label="Invite link"
        onFocus={(event) => event.currentTarget.select()}
        className={`${inputClass} mt-3 w-full font-mono text-xs`}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={buttonClass}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => void openExternalUrl(result.whatsappUrl)}
          className={primaryButtonClass}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Send on WhatsApp
        </button>
        <button type="button" onClick={onClose} className={buttonClass}>
          Done
        </button>
      </div>
    </div>
  );
}

export function LetInPanel({
  result,
  onResult,
}: {
  result: LetInResult | null;
  onResult: (result: LetInResult | null) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [held, setHeld] = useState<HeldAccount[] | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadHeld = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/access', {
        headers: { Authorization: `Bearer ${await token()}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as { held?: HeldAccount[]; error?: string };
      if (!response.ok) {
        setError(payload.error || 'Could not load held accounts.');
        return;
      }
      setHeld(payload.held || []);
    } catch {
      setError('Could not load held accounts.');
    }
  }, []);

  useEffect(() => {
    void loadHeld();
  }, [loadHeld]);

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await createLetInInvite({
        email: email.trim() || undefined,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      onResult(created);
      setEmail('');
      setName('');
      setPhone('');
      if (created.approvedExisting) void loadHeld();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invite.');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (account: HeldAccount) => {
    setApprovingId(account.id);
    setError('');
    try {
      await postLetIn({ action: 'approve', userId: account.id });
      setHeld((current) => (current || []).filter((row) => row.id !== account.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not let them in.');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <section className="mt-8 rounded-lg border border-stroke-default bg-bg-surface p-5">
      <h2 className="font-display text-xl font-semibold text-content-primary">Let people in</h2>
      <p className="mt-1 max-w-2xl text-sm text-content-secondary">
        Urganize is invite-only. Let in someone you spoke to: they get a link that works once, and
        signing up with their email lets them in too.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleInvite} className="mt-4">
        <p className="text-sm font-medium text-content-primary">Let in by email</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email (blank = link only)"
            aria-label="Email to let in"
            className={inputClass}
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name (optional)"
            aria-label="Their name"
            className={inputClass}
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="WhatsApp number (optional)"
            aria-label="Their WhatsApp number"
            className={inputClass}
          />
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Let in
          </button>
        </div>
      </form>

      {result ? <LetInResultCard result={result} onClose={() => onResult(null)} /> : null}

      <div className="mt-6">
        <p className="text-sm font-medium text-content-primary">
          Held accounts{held ? ` (${held.length})` : ''}
        </p>
        <p className="mt-1 text-xs text-content-secondary">Signed up without an invite and waiting.</p>
        {held === null ? (
          <p className="mt-2 text-sm text-content-tertiary">Loading…</p>
        ) : held.length === 0 ? (
          <p className="mt-2 text-sm text-content-tertiary">Nobody is waiting.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stroke-subtle rounded-lg border border-stroke-default">
            {held.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-content-primary">{account.name || account.email || account.id}</p>
                  <p className="truncate text-xs text-content-tertiary">
                    {account.email}
                    {account.createdAt ? ` · ${formatShort(account.createdAt)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={approvingId === account.id}
                  onClick={() => void handleApprove(account)}
                  className={buttonClass}
                >
                  {approvingId === account.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Let in
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
