'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, MessageCircle, Plus, X } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  COMMON_RECIPIENT_ROLES,
  buildNudgeLink,
  describeReceipt,
  needsNudge,
  type RecipientReceipt,
} from '@/lib/dj-pack';

type DjPackPanelProps = {
  setlistId: string;
  showTitle: string;
};

type Pack = { id: string; expiresAt: string | null; passcode: string | null };

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* non-JSON */
  }
  return fallback;
}

/**
 * Send the set to the people who need the tracks, and see who actually has
 * them.
 *
 * Each recipient gets their own link, which is what makes the receipt column
 * mean anything: one shared URL can tell you somebody opened it, never which
 * somebody. "Tunde downloaded, the engineer has not opened it" is the sentence
 * this whole panel exists to produce.
 */
export function DjPackPanel({ setlistId, showTitle }: DjPackPanelProps) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [receipts, setReceipts] = useState<RecipientReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(COMMON_RECIPIENT_ROLES[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/setlists/${setlistId}/pack`, { headers });
      if (!response.ok) {
        setError(await readError(response, 'Could not load the pack.'));
        return;
      }
      const body = await response.json();
      setPack(body.pack);
      setReceipts(Array.isArray(body.receipts) ? body.receipts : []);
      setError('');
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [setlistId]);

  useEffect(() => {
    void load();
  }, [load]);

  const packUrl = (token: string) =>
    typeof window === 'undefined' ? '' : `${window.location.origin}/pack/${token}`;

  const createPack = async () => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/setlists/${setlistId}/pack`, { method: 'POST', headers });
      if (!response.ok) {
        setError(await readError(response, 'Could not create the pack.'));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const addRecipient = async () => {
    if (!pack || !name.trim()) return;
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/packs/${pack.id}/recipients`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim(), role }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not add them.'));
        return;
      }
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (recipientId: string) => {
    if (!pack) return;
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/packs/${pack.id}/recipients/${recipientId}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not revoke that link.'));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (receipt: RecipientReceipt) => {
    try {
      await navigator.clipboard.writeText(packUrl(receipt.token));
      setCopiedId(receipt.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Could not copy. Long-press the link instead.');
    }
  };

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />;
  }

  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <h3 className="font-display text-base font-semibold text-content-primary">Send the tracks</h3>

      {error ? (
        <p className="mt-2 rounded-lg border border-status-error/30 bg-status-error/10 p-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {!pack ? (
        <>
          <p className="mt-1 text-sm text-content-secondary">
            One link each, so you can see who actually has the songs.
          </p>
          <button
            type="button"
            onClick={() => void createPack()}
            disabled={busy}
            className="motion-focus motion-press mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Create the pack
          </button>
        </>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {receipts.length === 0 ? (
              <li className="rounded-lg border border-dashed border-stroke-default p-4 text-center text-sm text-content-secondary">
                Nobody added yet. Add the DJ first.
              </li>
            ) : (
              receipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-stroke-default p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-content-primary">
                      {receipt.name}
                      {receipt.role ? (
                        <span className="ml-1.5 font-normal text-content-tertiary">
                          {receipt.role}
                        </span>
                      ) : null}
                    </p>
                    <p
                      className={`mt-0.5 text-xs ${
                        needsNudge(receipt) ? 'text-status-warning' : 'text-content-tertiary'
                      }`}
                    >
                      {describeReceipt(receipt)}
                    </p>
                  </div>

                  {!receipt.revokedAt ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void copy(receipt)}
                        aria-label={`Copy ${receipt.name}'s link`}
                        className="motion-focus grid h-8 w-8 place-items-center rounded-md text-content-tertiary hover:text-content-primary"
                      >
                        {copiedId === receipt.id ? (
                          <Check className="h-4 w-4 text-brand" aria-hidden />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden />
                        )}
                      </button>

                      {/* WhatsApp, because that is the channel this industry
                          actually runs on — the same reasoning behind the
                          founder support link. Only offered for someone who
                          has not downloaded: chasing a DJ who already has the
                          tracks is noise. */}
                      {needsNudge(receipt) ? (
                        <a
                          href={buildNudgeLink({
                            recipientName: receipt.name,
                            showTitle,
                            packUrl: packUrl(receipt.token),
                          })}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Nudge ${receipt.name} on WhatsApp`}
                          className="motion-focus grid h-8 w-8 place-items-center rounded-md text-content-tertiary hover:text-brand"
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden />
                        </a>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void revoke(receipt.id)}
                        disabled={busy}
                        aria-label={`Revoke ${receipt.name}'s link`}
                        className="motion-focus grid h-8 w-8 place-items-center rounded-md text-content-tertiary hover:text-status-error disabled:opacity-40"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              placeholder="Who is it for?"
              className="h-9 min-w-0 flex-1 rounded-lg border border-stroke-default bg-bg-base px-3 text-content-primary outline-none focus:border-brand"
            />
            <select
              value={role}
              onChange={(changeEvent) => setRole(changeEvent.target.value)}
              className="h-9 shrink-0 rounded-lg border border-stroke-default bg-bg-base px-2 text-content-primary outline-none focus:border-brand"
            >
              {COMMON_RECIPIENT_ROLES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void addRecipient()}
              disabled={busy || !name.trim()}
              className="motion-focus motion-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}
