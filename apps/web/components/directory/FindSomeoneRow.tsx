'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { roleNeededForTask } from '@/lib/directory-roles';
import { describeFindSomeone, findSomeoneHref, type TaskAsk } from '@/lib/find-someone';

const REQUESTS_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_DIRECTORY_REQUESTS === 'true';

/**
 * One quiet line on an open activity that needs a person: "Find graphic
 * designer", which opens the directory already filtered to that job and tied to
 * this activity. Once somebody has been asked it reads as their state instead,
 * so the manager does not search twice.
 *
 * It renders nothing for an activity with no job behind it, a finished one, a
 * rollout we cannot name, or with the feature off. The job comes from the
 * playbook step (roleNeededForTask), the same map the role gaps panel reads, so
 * the two always agree about which activities need somebody.
 */
export function FindSomeoneRow({
  taskId,
  releaseId,
  templateTaskId,
  status,
  rowClassName,
  iconClassName,
}: {
  taskId: string;
  releaseId: string | null;
  templateTaskId: string | null;
  status: string;
  rowClassName: string;
  iconClassName: string;
}) {
  const role = roleNeededForTask(templateTaskId);
  const live =
    REQUESTS_ENABLED &&
    Boolean(role) &&
    Boolean(releaseId) &&
    status !== 'done' &&
    status !== 'cancelled';
  const [asks, setAsks] = useState<TaskAsk[]>([]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch(
          `/api/directory/requests?box=sent&taskId=${encodeURIComponent(taskId)}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
        );
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setAsks(Array.isArray(body.requests) ? body.requests : []);
      } catch {
        // Quiet: the row falls back to offering the search.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live, taskId]);

  if (!live || !role || !releaseId) return null;
  const view = describeFindSomeone(role, asks);

  return (
    <div className={rowClassName}>
      <Users className={iconClassName} aria-hidden="true" />
      {view.kind === 'find' ? (
        <Link
          href={findSomeoneHref({ role, releaseId, taskId })}
          className="motion-focus -mx-2 min-h-11 flex-1 rounded-lg px-2 py-2.5 text-left text-sm text-brand hover:bg-bg-hover"
        >
          {view.label}
        </Link>
      ) : (
        <span className="-mx-2 flex-1 px-2 text-sm text-content-secondary">{view.text}</span>
      )}
    </div>
  );
}
