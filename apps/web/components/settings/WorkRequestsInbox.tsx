'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import {
  WORK_REQUEST_REPLY_MAX_CHARS,
  describeRequestStatus,
  type WorkRequestStatus,
} from '@/lib/work-requests';

/**
 * Requests waiting for you, inside the directory record you already manage.
 *
 * IT LIVES HERE RATHER THAN IN ITS OWN NAV ENTRY on purpose. This is where a
 * person already manages being listed, it is reachable on a phone through the
 * one route to Settings, and the mobile bar is full — an inbox that most
 * accounts never receive anything in should not be the thing that forces an
 * overflow sheet. The email is what actually reaches somebody; this is where
 * they answer.
 *
 * NOT GATED ON A TIER. Searching is Manager and up; being listed and answering
 * are free on every plan, which is the supply-free/demand-paid rule. Gating
 * the answer would make the directory unusable for the people it needs most.
 */

type IncomingRequest = {
  id: string;
  role: DirectoryRole;
  note: string;
  status: WorkRequestStatus;
  reply: string | null;
  sender_name: string;
  sender_team: string | null;
  created_at: string;
};

export function WorkRequestsInbox() {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const response = await fetch('/api/directory/requests?box=received', {
          headers,
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setRequests(Array.isArray(body.requests) ? body.requests : []);
      } catch {
        // Quiet: an unreadable inbox is not worth an error box on a settings
        // page somebody opened to do something else. Answering reports.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const answer = async (id: string, status: 'interested' | 'passed') => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusyId(id);
    setError('');
    try {
      const response = await fetch(`/api/directory/requests/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status, reply: replies[id] || '' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not save that.');
        return;
      }
      setRequests((current) =>
        current.map((request) =>
          request.id === id
            ? { ...request, status, reply: replies[id] || null }
            : request
        )
      );
    } catch {
      setError('Could not save that. Check your connection.');
    } finally {
      setBusyId('');
    }
  };

  // Nothing to say until there is something waiting. A permanently visible
  // "no requests yet" box on a settings page is noise for every account that
  // never receives one.
  if (!loaded || requests.length === 0) return null;

  const waiting = requests.filter((request) => request.status === 'new');

  return (
    <div className="mt-6 border-t border-stroke-subtle pt-5">
      <h3 className="text-sm font-semibold text-content-primary">
        {waiting.length > 0
          ? `${waiting.length} ${waiting.length === 1 ? 'person is' : 'people are'} asking about work`
          : 'People who asked about work'}
      </h3>

      {error ? <p role="alert" className="mt-2 text-sm text-status-error">{error}</p> : null}

      <ul className="mt-3 space-y-3">
        {requests.map((request) => (
          <li key={request.id} className="rounded-xl border border-stroke-default p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-content-primary">
                {request.sender_name}
                {request.sender_team ? (
                  <span className="text-content-tertiary"> · {request.sender_team}</span>
                ) : null}
              </span>
              <span className="text-xs text-content-tertiary">
                {DIRECTORY_ROLE_LABELS[request.role] || request.role} ·{' '}
                {describeRequestStatus(request.status)}
              </span>
            </div>

            <p className="mt-2 text-sm text-content-secondary">{request.note}</p>

            {request.status === 'new' ? (
              <>
                <input
                  value={replies[request.id] ?? ''}
                  onChange={(event) =>
                    setReplies((current) => ({
                      ...current,
                      [request.id]: event.target.value.slice(0, WORK_REQUEST_REPLY_MAX_CHARS),
                    }))
                  }
                  placeholder="A line back, if you want (optional)"
                  className="mt-3 h-11 w-full rounded-lg border border-stroke-default bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => void answer(request.id, 'passed')}
                    className="motion-focus h-10 flex-1 rounded-lg border border-stroke-default text-sm text-content-primary hover:bg-bg-hover disabled:opacity-60"
                  >
                    Pass
                  </button>
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => void answer(request.id, 'interested')}
                    className="motion-focus inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-content-inverse disabled:opacity-60"
                  >
                    {busyId === request.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    Interested
                  </button>
                </div>
              </>
            ) : request.reply ? (
              <p className="mt-2 text-xs text-content-tertiary">You said: {request.reply}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
