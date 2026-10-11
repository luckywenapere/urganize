'use client';

import { useCallback, useEffect, useState } from 'react';
import { InfoTip } from '@/components/shared/HelpTip';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { firstNameFrom } from '@/lib/email/format';
import { whatsappShareHref } from '@/lib/claim-copy';
import type { CreditClaimRow } from '@/lib/claim-owner-server';

// Under the credits a rollout collected: the credited people who now have a
// page they can claim, and a way to send each one the link.
//
// Nothing sends on its own. "Email" sends one email from the owner, and "Share
// link" makes a link the owner pastes into WhatsApp or anywhere else. People
// with no email on the credit only get the second.

const TIP =
  'When a rollout is out, each credited person gets a page. Send them a link so they can claim it and add their own details.';

type Shared = { name: string; url: string; whatsappText: string; message: string | null };

const when = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function statusText(row: CreditClaimRow): string {
  if (row.personStatus === 'claimed') return 'Claimed';
  if (!row.invite) return 'Not sent yet';
  if (row.invite.state === 'used') return 'Claimed';
  if (row.invite.state === 'expired') return 'Link ran out';
  if (row.invite.state === 'locked') return 'Link locked';
  if (row.invite.state === 'revoked') return 'Link turned off';
  if (row.invite.channel === 'email' && row.invite.sentAt) return `Emailed ${when(row.invite.sentAt)}`;
  return 'Link made';
}

export function CreditClaimInvites({ releaseId, refreshKey }: { releaseId: string; refreshKey: number }) {
  const [rows, setRows] = useState<CreditClaimRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/releases/${releaseId}/credit-claims`, {
        headers: { authorization: `Bearer ${await getAccessToken()}` },
      });
      if (!response.ok) return;
      const body = (await response.json()) as { credits?: CreditClaimRow[] };
      setRows(body.credits ?? []);
    } catch {
      // The section simply does not show. Credits above are unaffected.
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function send(row: CreditClaimRow, channel: 'email' | 'link') {
    setBusyId(row.submissionId);
    setError(null);
    setShared(null);
    try {
      const response = await fetch(`/api/releases/${releaseId}/credit-claims`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ submissionId: row.submissionId, channel }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        url?: string;
        emailed?: boolean;
        whatsappText?: string;
        reason?: string;
        error?: string;
      };
      if (!response.ok || !body.url) {
        setError(body.error || 'Could not make the link. Try again.');
        return;
      }
      if (channel === 'email' && body.emailed) {
        setShared({ name: row.name, url: body.url, whatsappText: body.whatsappText || '', message: `Emailed ${firstNameFrom(row.name) || row.name}.` });
      } else {
        const why =
          channel === 'email'
            ? 'We could not email it, so share the link yourself.'
            : null;
        setShared({ name: row.name, url: body.url, whatsappText: body.whatsappText || '', message: why });
      }
      void load();
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setShared((current) => (current ? { ...current, message: 'Copied.' } : current));
    } catch {
      setError('Could not copy. Select the link and copy it yourself.');
    }
  }

  const open = (rows ?? []).filter((row) => row.personStatus === 'unclaimed' || row.personStatus === 'claimed');
  if (open.length === 0) return null;

  return (
    <section className="mt-6" aria-label="Claim pages">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-content-primary">Claim pages</h4>
        <InfoTip label="About claim pages" text={TIP} />
      </div>
      <ul className="mt-3 space-y-2">
        {open.map((row) => {
          const first = firstNameFrom(row.name) || row.name;
          const claimed = row.personStatus === 'claimed' || row.invite?.state === 'used';
          return (
            <li
              key={row.submissionId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stroke-default bg-bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-content-primary">{row.name}</p>
                <p className="text-xs text-content-secondary">{statusText(row)}</p>
              </div>
              {claimed ? null : (
                <div className="flex flex-wrap gap-2">
                  {row.hasEmail ? (
                    <button
                      type="button"
                      disabled={busyId === row.submissionId}
                      onClick={() => void send(row, 'email')}
                      className="min-h-11 rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary disabled:opacity-60"
                    >
                      Email {first}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === row.submissionId}
                    onClick={() => void send(row, 'link')}
                    className="min-h-11 rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary disabled:opacity-60"
                  >
                    Share with {first}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {shared ? (
        <div className="mt-3 rounded-xl border border-stroke-default bg-bg-elevated p-4" role="status">
          {shared.message ? <p className="text-sm text-content-primary">{shared.message}</p> : null}
          <p className="mt-2 break-all text-sm text-content-secondary">{shared.url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy(shared.url)}
              className="min-h-11 rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary"
            >
              Copy link
            </button>
            {shared.whatsappText ? (
              <a
                href={whatsappShareHref(shared.whatsappText)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary"
              >
                Send on WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      <p role="alert" className="mt-2 min-h-5 text-sm text-status-error">
        {error}
      </p>
    </section>
  );
}
