'use client';

import { ArrowRight } from 'lucide-react';
import type { ExecutionRelease, ExecutionTask } from '@/lib/execution-types';
import { buildReleaseWarnings, getPipelineStateLabel } from '@/lib/release-execution';
import { ReadinessBar } from '@/components/execution/ReadinessBar';

export function FocusCard({
  release,
  tasks,
  onContinue,
}: {
  release: ExecutionRelease | null;
  tasks: ExecutionTask[];
  onContinue: (release: ExecutionRelease) => void;
}) {
  if (!release) {
    return (
      <section className="panel-shell p-5">
        <p className="saas-eyebrow">Active Release Focus</p>
        <h2 className="mt-3 text-2xl text-content-primary">Create your first release</h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">Your Command Center will auto-select the most urgent incomplete release once one exists.</p>
      </section>
    );
  }

  const releaseTasks = tasks.filter((task) => task.releaseId === release.id);
  const nextTask = releaseTasks.find((task) => task.status !== 'done' && task.status !== 'cancelled');
  const warnings = buildReleaseWarnings(release, tasks);

  return (
    <section className="panel-shell p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="saas-eyebrow">Active Release Focus</p>
          <h2 className="mt-3 text-3xl text-content-primary">{release.title}</h2>
          <p className="mt-1 text-sm text-content-secondary">{release.artistName}</p>
        </div>
        <span className="rounded-full border border-brand/25 bg-brand-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
          {getPipelineStateLabel(release.state)}
        </span>
      </div>

      <div className="mt-5">
        <ReadinessBar value={release.readinessScore} />
      </div>

      {warnings.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <span key={warning} className="rounded-full border border-status-error/25 bg-status-error/10 px-3 py-1 text-xs text-status-error">
              {warning}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 rounded-[18px] border border-stroke-subtle bg-bg-elevated p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Next action</p>
        <p className="mt-2 text-sm font-semibold text-content-primary">{nextTask?.title || 'Review release readiness'}</p>
      </div>

      <button
        type="button"
        onClick={() => onContinue(release)}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
      >
        Continue Execution
        <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
