'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from '@/components/icons';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { supabase } from '@/lib/supabase/client';
import { DIRECTORY_ROLE_LABELS, roleNeededForTask } from '@/lib/directory-roles';
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
  rowClassName = '',
  iconClassName = '',
  variant = 'row',
}: {
  taskId: string;
  releaseId: string | null;
  templateTaskId: string | null;
  status: string;
  rowClassName?: string;
  iconClassName?: string;
  /** 'card': the desktop pop-up's short card (#1251). No count of open people
   *  is shown: the directory has no cheap count to read here. */
  variant?: 'row' | 'card';
}) {
  const role = roleNeededForTask(templateTaskId);
  const live =
    REQUESTS_ENABLED &&
    Boolean(role) &&
    Boolean(releaseId) &&
    status !== 'done' &&
    status !== 'cancelled';
  const { closeTask } = useTaskUI();
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

  if (variant === 'card') {
    const roleName = DIRECTORY_ROLE_LABELS[role].toLowerCase();
    return (
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-stroke-strong p-3.5">
        <Users className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
        {view.kind === 'find' ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-content-primary">No {roleName} yet?</p>
              <p className="text-[13px] text-content-secondary">Find one in the Directory who is open to work.</p>
            </div>
            <Link
              href={findSomeoneHref({ role, releaseId, taskId })}
              onClick={closeTask}
              className="motion-focus motion-press inline-flex h-8 shrink-0 items-center rounded-full border border-stroke-strong px-3 text-[13px] font-medium text-content-primary transition-colors [@media(hover:hover)]:hover:bg-bg-hover"
            >
              Find one
            </Link>
          </>
        ) : (
          <p className="min-w-0 flex-1 text-sm text-content-secondary">{view.text}</p>
        )}
      </div>
    );
  }

  return (
    <div className={rowClassName}>
      <Users className={iconClassName} aria-hidden="true" />
      {view.kind === 'find' ? (
        <Link
          href={findSomeoneHref({ role, releaseId, taskId })}
          // The pop-up is app-wide and survives a route change, so it has to
          // close or it stays open over the directory.
          onClick={closeTask}
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
