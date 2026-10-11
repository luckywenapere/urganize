'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import { describeRequestStatus, revealsContact, type WorkRequestStatus } from '@/lib/work-requests';

/**
 * What came back from the people you asked.
 *
 * WHY THIS EXISTS. The answer was reaching the asker by email and nowhere
 * else: the API served their side from the day requests were built and
 * nothing called it, so deleting the message deleted the answer. This is the
 * other half of the loop the role gaps panel opens.
 *
 * THE CONTACT IS THE POINT OF THE ROW. Our sending address is always the
 * verified Urganize one, so a name and a yes leave somebody with no way to
 * proceed. An interested answer carries a mailto; a pass carries nothing, and
 * that asymmetry is the consent model rather than a display choice
 * (revealsContact in lib/work-requests.ts). The server decides what to send
 * here, so a row can only show what it was given.
 *
 * Renders nothing until there is something to say, the rule every prompt in
 * this column follows.
 */

type SentRequest = {
  id: string;
  role: DirectoryRole;
  note: string;
  status: WorkRequestStatus;
  reply: string | null;
  release_id: string | null;
  kind?: 'crew' | 'manager';
  task_id?: string | null;
  accepted_release_id?: string | null;
  assigned_at?: string | null;
  recipient_name: string;
  recipient_slug: string;
  contact_email: string;
  created_at: string;
};

type Variant = 'settings' | 'release';

export function SentRequestsList({
  releaseId,
  variant = 'settings',
}: {
  /** Narrows to one release. Absent means every request this account sent. */
  releaseId?: string;
  variant?: Variant;
}) {
  const [requests, setRequests] = useState<SentRequest[]>([]);
  const [loaded, setLoaded] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const response = await fetch('/api/directory/requests?box=sent', {
          headers,
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setRequests(Array.isArray(body.requests) ? body.requests : []);
      } catch {
        // Quiet. A list that could not load is not worth an error box next to
        // the release work somebody actually opened this page to do; the email
        // still carried the answer.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  // Filtered here rather than by the server: the whole list is one small page
  // and the settings mount needs all of it, so a release param would be a
  // second query shape for no gain. The useNotesStore reasoning.
  const shown = releaseId
    ? requests.filter((request) => request.release_id === releaseId)
    : requests;

  if (!loaded || shown.length === 0) return null;

  // A request that closed after seven days with no reply is not an answer: it
  // is neither a yes nor a no, and counting it would tell the sender somebody
  // had replied when they had not.
  const answered = shown.filter(
    (request) => request.status !== 'new' && request.status !== 'expired'
  );
  const heading =
    answered.length > 0
      ? `${answered.length} of ${shown.length} ${shown.length === 1 ? 'person has' : 'people have'} answered`
      : shown.length === 1
        ? 'You asked one person'
        : `You asked ${shown.length} people`;

  const rows = (
    <ul className={variant === 'release' ? 'mt-3 space-y-2' : 'mt-3 space-y-3'}>
      {shown.map((request) => {
        const contact = revealsContact(request.status) ? request.contact_email : '';
        return (
          <li key={request.id} className="rounded-lg border border-stroke-subtle p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-content-primary">
                {request.recipient_name}
              </span>
              <span className="text-xs text-content-tertiary">
                {DIRECTORY_ROLE_LABELS[request.role] || request.role} ·{' '}
                <span className={request.status === 'interested' ? 'text-brand' : undefined}>
                  {describeRequestStatus(request.status)}
                </span>
              </span>
            </div>

            {request.reply ? (
              <p className="mt-2 text-sm text-content-secondary">{request.reply}</p>
            ) : null}

            {request.status === 'expired' ? (
              <p className="mt-2 text-sm text-content-tertiary">
                No answer in 7 days, so this one closed. You can ask again.
              </p>
            ) : null}

            {request.accepted_release_id ? (
              <p className="mt-2 text-sm text-content-primary">
                You are on their team now.{' '}
                <Link
                  href={`/dashboard?release=${request.accepted_release_id}`}
                  className="motion-focus font-medium text-brand hover:underline"
                >
                  Open the shared rollout
                </Link>
              </p>
            ) : null}

            {request.assigned_at ? (
              <p className="mt-2 text-sm text-content-primary">They are down for this activity.</p>
            ) : null}

            {contact ? (
              <p className="mt-2 text-sm">
                <a
                  href={`mailto:${contact}`}
                  className="motion-focus font-medium text-brand hover:underline"
                >
                  {contact}
                </a>
                {request.recipient_slug ? (
                  <>
                    <span className="text-content-tertiary"> · </span>
                    <Link
                      href={`/p/${request.recipient_slug}`}
                      className="motion-focus text-content-secondary hover:underline"
                    >
                      What they have delivered
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  if (variant === 'release') {
    return (
      <section className="rounded-xl border border-stroke-default p-4">
        <h3 className="text-sm font-semibold text-content-primary">{heading}</h3>
        <p className="mt-1 text-sm text-content-secondary">
          Anyone who says they are interested comes with a way to reach them.
        </p>
        {rows}
      </section>
    );
  }

  return (
    <div className="mt-6 border-t border-stroke-subtle pt-5">
      <h3 className="text-sm font-semibold text-content-primary">{heading}</h3>
      {rows}
    </div>
  );
}
