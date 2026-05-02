'use client';

import { ArrowRight } from 'lucide-react';
import type { ExecutionRelease, ExecutionTask } from '@/lib/execution-types';
import { buildReleaseWarnings, cleanTaskTitle, formatArtistName, getPipelineStateLabel } from '@/lib/release-execution';
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
      <section className="panel-shell rounded-none border-t border-white/5 border-l-2 border-green-400 p-6 shadow-none">
        <h2 className="mt-3 text-2xl font-bold text-content-primary">Create your first operation</h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">Standby. Awaiting release parameters.</p>
      </section>
    );
  }

  const releaseTasks = tasks.filter((task) => task.releaseId === release.id);
  const nextTask = releaseTasks.find((task) => task.status !== 'done' && task.status !== 'cancelled');
  const warnings = buildReleaseWarnings(release, tasks);

  return (
    <section className="panel-shell rounded-sm border-t border-white/5 border-l-2 border-green-400 p-6 shadow-none">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-content-primary tracking-tight">{release.title}</h2>
          <p className="mt-1 font-mono text-xs text-content-tertiary">{formatArtistName(release.artistName)}</p>
        </div>
        <span className="border border-green-400/40 bg-transparent px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-green-400 font-mono">
          {getPipelineStateLabel(release.state)}
        </span>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-sans text-xs text-white/30">Readiness</span>
          <span className="font-mono text-xs font-bold text-brand">{release.readinessScore}%</span>
        </div>
        <ReadinessBar value={release.readinessScore} showTicks={true} />
      </div>

      {warnings.length ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <span key={warning} className="border border-status-error/30 bg-status-error/5 px-2.5 py-1 text-[10px] font-mono uppercase text-status-error">
              {warning}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-8 border-t border-white/5 pt-6">
        <p className="font-sans text-xs text-white/30 mb-2">What&apos;s next</p>
        <p className="mt-1 text-lg font-semibold text-content-primary font-display">{nextTask ? cleanTaskTitle(nextTask.title) : 'Review readiness'}</p>
      </div>

      <button
        type="button"
        onClick={() => onContinue(release)}
        className="group mt-8 inline-flex min-h-11 items-center gap-3 rounded-none border border-green-400/60 bg-brand px-6 text-xs font-bold uppercase tracking-widest text-content-inverse transition-all duration-150 hover:border-green-400 hover:text-white"
      >
        Keep going
        <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-1" />
      </button>
    </section>
  );
}
