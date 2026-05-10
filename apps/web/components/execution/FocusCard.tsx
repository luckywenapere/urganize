'use client';

import { ArrowRight } from 'lucide-react';
import type { ExecutionRelease, ExecutionTask } from '@/lib/execution-types';
import { buildReleaseWarnings, cleanTaskTitle, formatArtistName, getPipelineStateLabel } from '@/lib/release-execution';
import { ReadinessBar } from '@/components/execution/ReadinessBar';

export function FocusCard({
  release,
  tasks,
  todaysDirective,
  onContinue,
  onSelectTask,
}: {
  release: ExecutionRelease | null;
  tasks: ExecutionTask[];
  todaysDirective?: ExecutionTask | null;
  onContinue: (release: ExecutionRelease) => void;
  onSelectTask?: (taskId: string) => void;
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
  const warnings = buildReleaseWarnings(release, tasks);
  
  let countdownText = null;
  let countdownColor = '';
  if (release.releaseDate) {
    const rDate = new Date(release.releaseDate);
    rDate.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const timeDiff = rDate.getTime() - now.getTime();
    const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    if (diffDays < 0) {
      countdownText = 'Drop date passed';
      countdownColor = 'text-red-400/40';
    } else if (diffDays <= 7) {
      countdownText = `${diffDays} days to drop`;
      countdownColor = 'text-yellow-400/60';
    } else {
      countdownText = `${diffDays} days to drop`;
      countdownColor = 'text-white/30';
    }
  }

  const isOverdue = todaysDirective?.dueDate && todaysDirective.dueDate < new Date().toISOString().slice(0, 10);
  const isDueToday = todaysDirective?.dueDate === new Date().toISOString().slice(0, 10);

  return (
    <section className="panel-shell rounded-sm border-t border-white/5 border-l-2 border-green-400 p-6 shadow-none">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-content-primary tracking-tight">{release.title}</h2>
          <p className="mt-1 font-mono text-xs text-content-tertiary">{formatArtistName(release.artistName)}</p>
          {countdownText && (
            <p className={`mt-2 font-mono text-xs ${countdownColor}`}>{countdownText}</p>
          )}
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
        {todaysDirective ? (
          <>
            <p className="font-mono text-xs text-white/30 mb-2">Today</p>
            <div className="flex items-center gap-2">
              {isOverdue && <div className="h-1 w-1 shrink-0 rounded-none bg-red-400" />}
              {!isOverdue && isDueToday && <div className="h-1 w-1 shrink-0 rounded-none bg-yellow-400" />}
              <p className="text-lg font-semibold text-white font-display">
                {cleanTaskTitle(todaysDirective.title)}
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-white font-display">You&apos;re all caught up.</p>
            <p className="mt-1 font-sans text-xs text-white/40">Add a task or wait for the AI to surface the next move.</p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          if (todaysDirective && onSelectTask) {
            onSelectTask(todaysDirective.id);
          } else {
            onContinue(release);
          }
        }}
        className="group mt-8 inline-flex min-h-11 items-center gap-3 rounded-none border border-green-400/60 bg-brand px-6 text-xs font-bold uppercase tracking-widest text-content-inverse transition-all duration-150 hover:border-green-400 hover:text-white"
      >
        Keep going
        <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-1" />
      </button>
    </section>
  );
}
