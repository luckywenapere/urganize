'use client';

import { useState } from 'react';
import { BookOpen } from '@/components/icons';
import { briefCall } from '@/components/releases/brief-shared';
import { RELEASE_BRIEF_ENABLED } from '@/lib/release-brief-flag';
import { useTaskStore } from '@/stores/useTaskStore';

/**
 * "On the brief" in an activity's details (#897 phase 3): puts any activity
 * on the brief's What we're making, or takes a playbook piece off it. The
 * owner, date and status still live on the activity; this only says whether
 * the brief lists it.
 */
export function BriefToggleRow({
  taskId,
  releaseId,
  onBrief,
  rowClassName = '',
  iconClassName = '',
  variant = 'row',
}: {
  taskId: string;
  releaseId: string | null;
  onBrief: boolean | undefined;
  rowClassName?: string;
  iconClassName?: string;
  /** 'field': the desktop pop-up's right column, label, switch and hint (#1251). */
  variant?: 'row' | 'field';
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The panel may hold its own copy of the task, so the switch keeps the
  // value it last saved for this task rather than waiting for that copy.
  const [local, setLocal] = useState<{ taskId: string; value: boolean } | null>(null);
  if (!RELEASE_BRIEF_ENABLED || !releaseId || onBrief === undefined) return null;
  const on = local?.taskId === taskId ? local.value : onBrief;

  const toggle = async () => {
    if (saving) return;
    const show = !on;
    setSaving(true);
    setError('');
    // Shown straight away; put back if the save fails.
    const set = (value: boolean) => {
      setLocal({ taskId, value });
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, onBrief: value } : task)),
      }));
    };
    set(show);
    const result = await briefCall<{ show: boolean }>(
      `/api/releases/${encodeURIComponent(releaseId)}/brief/pieces/${encodeURIComponent(taskId)}`,
      { method: 'PATCH', body: JSON.stringify({ show }) }
    );
    setSaving(false);
    if (!result.ok) {
      set(!show);
      setError(result.error);
    }
  };

  const switchButton = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Show on the brief"
      onClick={() => void toggle()}
      disabled={saving}
      className={`motion-focus relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
        on ? 'bg-brand' : 'bg-bg-hover ring-1 ring-inset ring-stroke-strong'
      } ${variant === 'row' ? 'mr-2' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );

  if (variant === 'field') {
    return (
      <div className="border-t border-stroke-subtle py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-content-primary">On the brief</span>
          {switchButton}
        </div>
        <p className="mt-1 text-xs text-content-tertiary">
          {on ? 'Shows on the rollout’s brief.' : 'Not on the rollout’s brief.'}
        </p>
        {error ? <p className="mt-1 text-xs text-status-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className={rowClassName}>
        <BookOpen className={iconClassName} aria-hidden="true" />
        <span className="flex-1 px-2 text-sm text-content-secondary">On the brief</span>
        {switchButton}
      </div>
      {error ? <p className="mt-1 pl-7 text-xs text-status-error">{error}</p> : null}
    </div>
  );
}
