'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Loader2, MessageCircle, Plus } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/shared/ToastProvider';
import {
  COMMON_RECIPIENT_ROLES,
  MAX_RECIPIENT_NAME_LENGTH,
  MAX_RECIPIENT_ROLE_LENGTH,
  buildNudgeLink,
  describeReceipt,
  isPackExpired,
  needsNudge,
  type PackReadiness,
  type RecipientReceipt,
} from '@/lib/dj-pack';
import { formatShowDateTime } from '@/lib/events';
import { ConfirmDialog } from './ConfirmDialog';

type DjPackPanelProps = {
  setlistId: string;
  showTitle: string;
  timezone: string;
  cancelled: boolean;
  canEdit: boolean;
  /** What the set would hand over right now (describePackReadiness). */
  readiness: PackReadiness;
  /** How many people the set has been sent to, turned-off links included. */
  onSentCountChange?: (count: number) => void;
};

type Pack = { id: string; setlistId: string; expiresAt: string | null };

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
 * Send the set to the people who need the tracks, and see who has them.
 *
 * Each person gets their own link, which is what makes the receipt line mean
 * anything: one shared URL can say somebody opened it, never which somebody.
 * "Tunde downloaded, the engineer hasn't opened it" is the sentence this card
 * exists to produce.
 *
 * There is no separate "create the pack" step any more (2026-09-25): adding
 * the first person creates it. And it says, before anything goes out, when
 * songs in the set have no file yet, so a DJ is never handed a page of "No
 * file" without the sender knowing.
 */
export function DjPackPanel({
  setlistId,
  showTitle,
  timezone,
  cancelled,
  canEdit,
  readiness,
  onSentCountChange,
}: DjPackPanelProps) {
  const { pushToast } = useToast();
  const [pack, setPack] = useState<Pack | null>(null);
  const [receipts, setReceipts] = useState<RecipientReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingTurnOff, setPendingTurnOff] = useState<RecipientReceipt | null>(null);
  const [showTurnedOff, setShowTurnedOff] = useState(false);
  const rolesListId = useId();

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/setlists/${setlistId}/pack`, { headers });
      if (!response.ok) {
        setError(await readError(response, 'Couldn’t load who has the tracks.'));
        return;
      }
      const body = await response.json();
      setPack(body.pack ?? null);
      setReceipts(Array.isArray(body.receipts) ? body.receipts : []);
      setError('');
    } catch {
      setError('Couldn’t reach the server. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [setlistId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLoading) onSentCountChange?.(receipts.length);
  }, [isLoading, onSentCountChange, receipts.length]);

  const active = useMemo(() => receipts.filter((receipt) => !receipt.revokedAt), [receipts]);
  const turnedOff = useMemo(() => receipts.filter((receipt) => receipt.revokedAt), [receipts]);
  const expired = pack ? isPackExpired(pack.expiresAt) : false;

  const packUrl = (token: string) =>
    typeof window === 'undefined' ? '' : `${window.location.origin}/pack/${token}`;

  const copyLink = async (receipt: RecipientReceipt, quiet = false): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(packUrl(receipt.token));
      setCopiedId(receipt.id);
      window.setTimeout(() => setCopiedId((current) => (current === receipt.id ? null : current)), 2000);
      return true;
    } catch {
      if (!quiet) pushToast('Couldn’t copy. Press and hold the link instead.', 'error');
      return false;
    }
  };

  const ensurePack = async (headers: HeadersInit): Promise<Pack | null> => {
    if (pack) return pack;
    const response = await fetch(`/api/setlists/${setlistId}/pack`, { method: 'POST', headers });
    if (!response.ok) {
      setError(await readError(response, 'Couldn’t start sending this set.'));
      return null;
    }
    const body = await response.json();
    const created = body.pack as Pack;
    setPack(created);
    return created;
  };

  const addPerson = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    setError('');
    try {
      const target = await ensurePack(headers);
      if (!target) return;
      const response = await fetch(`/api/packs/${target.id}/recipients`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: trimmed, role: role.trim() || null }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Couldn’t add them.'));
        return;
      }
      const body = await response.json().catch(() => ({}));
      setName('');
      setRole('');
      await load();
      // Best-effort: most browsers still allow a copy this soon after the tap.
      const recipient = body?.recipient as { id?: string; token?: string } | undefined;
      const firstName = trimmed.split(/\s+/)[0];
      if (recipient?.token) {
        const copied = await copyLink(
          {
            id: String(recipient.id || ''),
            token: String(recipient.token),
          } as RecipientReceipt,
          true
        );
        pushToast(
          copied ? `${firstName}’s link is copied. Paste it to them.` : `${firstName}’s link is ready.`,
          'success'
        );
      }
    } catch {
      setError('Couldn’t reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/setlists/${setlistId}/pack`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ reopen: true }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Couldn’t open the links again.'));
        return;
      }
      const body = await response.json();
      setPack(body.pack as Pack);
      pushToast('The links work again.', 'success');
    } catch {
      setError('Couldn’t reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />;
  }

  const expiryText = pack?.expiresAt
    ? formatShowDateTime(pack.expiresAt, timezone, { includeTime: false })
    : null;

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <h3 className="font-display text-base font-semibold text-content-primary">Send the tracks</h3>
      <p className="mt-1 text-sm text-content-secondary">
        Everyone gets their own private link, so you can see who has the songs.
      </p>

      {cancelled ? (
        <p className="mt-3 rounded-lg border border-stroke-default bg-bg-base p-3 text-sm text-content-secondary">
          The show is cancelled, so these links don’t hand over any files.
        </p>
      ) : readiness.songs === 0 ? (
        <p className="mt-3 text-sm text-content-tertiary">There are no songs in this set yet.</p>
      ) : readiness.summary ? (
        <p className="mt-3 rounded-lg border border-status-warning/30 bg-status-warning/10 p-3 text-sm text-status-warning">
          {readiness.summary}
        </p>
      ) : null}

      {pack && expired ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-default bg-bg-base p-3">
          <p className="text-sm text-content-secondary">These links have expired.</p>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void reopen()}
              disabled={busy}
              className="motion-focus inline-flex h-8 items-center gap-1.5 rounded-lg border border-stroke-default px-3 text-xs font-semibold text-content-primary hover:border-brand disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Open for 3 more days
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-status-error/30 bg-status-error/10 p-2.5 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {active.length > 0 ? (
        <ul className="mt-3 divide-y divide-stroke-subtle rounded-lg border border-stroke-default">
          {active.map((receipt) => (
            <li key={receipt.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-content-primary">
                  {receipt.name}
                  {receipt.role ? (
                    <span className="ml-1.5 font-normal text-content-tertiary">{receipt.role}</span>
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
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void copyLink(receipt)}
                  aria-label={`Copy ${receipt.name}’s link`}
                  title="Copy link"
                  className="motion-focus grid h-9 w-9 place-items-center rounded-md text-content-tertiary hover:text-content-primary"
                >
                  {copiedId === receipt.id ? (
                    <Check className="h-4 w-4 text-brand" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                </button>
                {/* WhatsApp, because that is the channel this industry runs
                    on. Only while they have not downloaded: chasing a DJ who
                    already has the tracks is noise. */}
                {needsNudge(receipt) ? (
                  <a
                    href={buildNudgeLink({ recipientName: receipt.name, showTitle, packUrl: packUrl(receipt.token) })}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Send ${receipt.name} the link on WhatsApp`}
                    title="Send on WhatsApp"
                    className="motion-focus grid h-9 w-9 place-items-center rounded-md text-content-tertiary hover:text-brand"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                  </a>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setPendingTurnOff(receipt)}
                    disabled={busy}
                    className="motion-focus h-9 rounded-md px-2 text-xs font-semibold text-content-tertiary hover:text-status-error disabled:opacity-40"
                  >
                    Turn off
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {turnedOff.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowTurnedOff((open) => !open)}
            aria-expanded={showTurnedOff}
            className="motion-focus inline-flex items-center gap-1 text-xs font-semibold text-content-tertiary hover:text-content-primary"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTurnedOff ? '' : '-rotate-90'}`} aria-hidden />
            Turned off ({turnedOff.length})
          </button>
          {showTurnedOff ? (
            <ul className="mt-1 space-y-1 pl-5">
              {turnedOff.map((receipt) => (
                <li key={receipt.id} className="text-xs text-content-tertiary">
                  {receipt.name}
                  {receipt.role ? ` · ${receipt.role}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {pack && expiryText && !expired ? (
        <p className="mt-3 text-xs text-content-tertiary">Links work until {expiryText}.</p>
      ) : null}

      {canEdit ? (
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void addPerson();
          }}
        >
          <input
            value={name}
            maxLength={MAX_RECIPIENT_NAME_LENGTH}
            onChange={(changeEvent) => setName(changeEvent.target.value)}
            placeholder={active.length === 0 ? 'Who gets the tracks? Start with the DJ' : 'Add someone'}
            aria-label="Name"
            className="h-10 min-w-0 flex-[2] basis-48 rounded-lg border border-stroke-default bg-bg-base px-3 text-content-primary outline-none focus:border-brand"
          />
          <input
            value={role}
            maxLength={MAX_RECIPIENT_ROLE_LENGTH}
            onChange={(changeEvent) => setRole(changeEvent.target.value)}
            placeholder="Role"
            aria-label="Role"
            list={rolesListId}
            className="h-10 min-w-0 flex-1 basis-28 rounded-lg border border-stroke-default bg-bg-base px-3 text-content-primary outline-none focus:border-brand"
          />
          <datalist id={rolesListId}>
            {COMMON_RECIPIENT_ROLES.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={busy || !name.trim() || expired}
            className="motion-focus motion-press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Add
          </button>
        </form>
      ) : null}

      <ConfirmDialog
        open={pendingTurnOff !== null}
        title={`Turn off ${pendingTurnOff?.name ?? 'this'}’s link?`}
        body="It stops working straight away. You can add them again for a new link."
        confirmLabel="Turn off link"
        onClose={() => setPendingTurnOff(null)}
        onConfirm={async () => {
          const receipt = pendingTurnOff;
          if (!receipt || !pack) return;
          const headers = await authHeaders();
          if (!headers) throw new Error('You’re signed out. Sign in and try again.');
          let response: Response;
          try {
            response = await fetch(`/api/packs/${pack.id}/recipients/${receipt.id}`, {
              method: 'DELETE',
              headers,
            });
          } catch {
            throw new Error('Couldn’t reach the server. Check your connection.');
          }
          if (!response.ok) throw new Error(await readError(response, 'Couldn’t turn that link off.'));
          setPendingTurnOff(null);
          await load();
        }}
      />
    </section>
  );
}
