'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

// Emails the owners of teams the founder comped or gave a trial extension
// before those emails existed. Counts first, then sends one run per press.
// Pressing again sends the rest: a change already emailed is skipped by its
// dedupe key on the server, so pressing twice never sends twice.

type Counts = {
  emailConfigured: boolean;
  toSend: number;
  alreadySent: number;
  noOwner: number;
};

type RunResult = { sent: number; skipped: number; failed: number; remaining: number };

export function TeamNoticesPanel() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch('/api/admin/teams/notices', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => ({}))) as Partial<Counts> & { error?: string };
      if (!response.ok) {
        setError(body.error || 'Could not count the notices.');
        return;
      }
      setCounts({
        emailConfigured: Boolean(body.emailConfigured),
        toSend: body.toSend ?? 0,
        alreadySent: body.alreadySent ?? 0,
        noOwner: body.noOwner ?? 0,
      });
    } catch {
      setError('Could not count the notices.');
    }
  }, [getToken]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const send = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Session expired.');
      const response = await fetch('/api/admin/teams/notices', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as Partial<RunResult> & { error?: string };
      if (!response.ok) throw new Error(body.error || 'The notices did not send.');
      setResult({
        sent: body.sent ?? 0,
        skipped: body.skipped ?? 0,
        failed: body.failed ?? 0,
        remaining: body.remaining ?? 0,
      });
      await loadCounts();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The notices did not send.');
    } finally {
      setBusy(false);
    }
  }, [getToken, loadCounts]);

  if (!counts) return null;

  return (
    <section className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-4">
      <h2 className="font-display text-lg font-semibold text-content-primary">Past changes</h2>
      <p className="mt-1 text-sm leading-6 text-content-secondary">
        Team owners get an email for every comp and trial extension now. Changes made before that
        have not been emailed yet.
      </p>

      {counts.toSend === 0 ? (
        <p className="mt-3 text-sm text-content-secondary">Every past change has been emailed.</p>
      ) : (
        <p className="mt-3 text-sm text-content-primary">
          {counts.toSend} past {counts.toSend === 1 ? 'change' : 'changes'} still to email.
        </p>
      )}

      {counts.noOwner > 0 ? (
        <p className="mt-1 text-xs text-content-tertiary">
          {counts.noOwner} {counts.noOwner === 1 ? 'change has' : 'changes have'} no owner to email.
        </p>
      ) : null}

      {!counts.emailConfigured ? (
        <p className="mt-3 text-sm text-status-warning">
          Email is not configured on this environment, so nothing can be sent here.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void send()}
        disabled={busy || counts.toSend === 0 || !counts.emailConfigured}
        className="mt-4 inline-flex h-10 items-center rounded-full bg-brand px-4 text-sm font-semibold text-content-inverse disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Sending…' : `Email ${counts.toSend} ${counts.toSend === 1 ? 'owner' : 'owners'}`}
      </button>

      {result ? (
        <p role="status" className="mt-3 text-sm text-content-secondary">
          Sent {result.sent}. {result.skipped > 0 ? `Skipped ${result.skipped}. ` : ''}
          {result.failed > 0 ? `${result.failed} did not send and will be tried again. ` : ''}
          {result.remaining > 0 ? `Press again to send the other ${result.remaining}.` : ''}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
