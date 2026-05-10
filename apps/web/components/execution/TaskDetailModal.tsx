'use client';

import { Calendar, Check, X } from 'lucide-react';
import type { ExecutionTask } from '@/lib/execution-types';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import {
  cleanTaskTitle,
  formatArtistName,
  formatReleaseTitle,
  getTaskCompletionBlocker,
} from '@/lib/release-execution';
import { getTaskStatusLabel, getTaskStatusTone } from '@/lib/tasks';
import { useAuthStore } from '@/lib/auth-store';
import { useTaskStore } from '@/stores/useTaskStore';
import { AlertCircle, CheckCircle2, Play } from 'lucide-react';

export function TaskDetailModal({
  task,
  allTasks,
  onClose,
  onSatisfyRequirement,
  onComplete,
}: {
  task: ExecutionTask | null;
  allTasks: ExecutionTask[];
  onClose: () => void;
  onSatisfyRequirement: (task: ExecutionTask) => void;
  onComplete: (task: ExecutionTask) => void;
}) {
  const { user } = useAuthStore();
  const { updateTaskStatus } = useTaskStore();
  if (!task) return null;

  const isAssignedToMe = user && task.assignedToUserId === user.id;

  const blocker = getTaskCompletionBlocker(task, allTasks);
  const chain = task.dependencies
    .map((id) => allTasks.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is ExecutionTask => Boolean(candidate));

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative z-[210] flex h-full w-full flex-col bg-[#0a0a0a] shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-right duration-200 ease-out sm:w-[40%] sm:border-l sm:border-white/10 overflow-hidden">
        {/* Header */}
        <header className="p-8 pb-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              {task.release ? (
                <div className="mt-1 flex flex-col gap-0.5">
                  <span className="truncate font-semibold text-white">
                    {formatReleaseTitle(task.release.title)}
                  </span>
                  <span className="truncate font-mono text-[10px] text-white/30">
                    {formatArtistName(task.release.artistName)}
                  </span>
                </div>
              ) : (
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
                  GLOBAL
                </p>
              )}
              {isAssignedToMe && (
                <div className="mt-4 inline-flex items-center gap-1.5 border border-brand/30 bg-brand/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand">
                  <div className="h-1 w-1 bg-brand animate-pulse" />
                  Assigned to you
                </div>
              )}
              <h2 className="mt-2 font-display text-3xl font-semibold leading-tight text-white">
                {cleanTaskTitle(task.title)}
              </h2>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {task.dueDate && (
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
                    <Calendar className="h-3 w-3" />
                    {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                  </div>
                )}
                <div className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest ${
                  task.status === 'in_progress' ? 'text-brand' : 
                  task.status === 'blocked' ? 'text-status-error' : 
                  task.status === 'done' ? 'text-green-400' : 'text-white/40'
                }`}>
                  <div className={`h-1.5 w-1.5 ${
                    task.status === 'in_progress' ? 'bg-brand' : 
                    task.status === 'blocked' ? 'bg-status-error' : 
                    task.status === 'done' ? 'bg-green-400' : 'bg-white/20'
                  }`} />
                  {getTaskStatusLabel(task.status)}
                </div>
              </div>
            </div>
            <button 
              type="button" 
              onClick={onClose} 
              className="ml-4 text-white/30 transition-colors duration-150 hover:text-white/70"
            >
              ×
            </button>
          </div>
          <div className="mt-4 border-b border-white/5" />
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8 pb-32 pt-2">
          {/* Description */}
          {task.description && (
            <div className="py-5">
              <p className="font-sans text-sm leading-relaxed text-white/70">
                {task.description}
              </p>
            </div>
          )}

          {/* Why it matters */}
          <div className="border-t border-white/5 py-5">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Why it matters</p>
            <p className="font-sans text-xs leading-relaxed text-white/50 italic">
              Crucial for release timing and operational alignment.
            </p>
          </div>

          {/* Measurable outcome */}
          <div className="border-t border-white/5 py-5">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Measurable outcome</p>
            <div className="border-l-2 border-green-400/40 pl-3">
              <p className="font-sans text-xs leading-relaxed text-white/70">
                Confirmed distribution assets and metadata validation.
              </p>
            </div>
          </div>

          {/* Requirement Section */}
          <div className="border-t border-white/5 py-5">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Requirement</p>
            {task.requirement ? (
              task.requirement.satisfied ? (
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-green-400/60">
                  <Check className="h-3 w-3" />
                  Done
                </div>
              ) : (
                <div className="border border-white/10 p-4">
                  <p className="font-sans text-xs leading-relaxed text-white/50">
                    {task.requirement.spec}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSatisfyRequirement(task)}
                    className="mt-4 border border-green-400/60 bg-transparent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-green-400 transition-all hover:bg-green-400/5"
                  >
                    Satisfy
                  </button>
                </div>
              )
            ) : (
              <p className="font-sans text-xs text-white/30">No specific requirements defined.</p>
            )}
          </div>

          {/* Dependencies Section */}
          <div className="border-t border-white/5 py-5">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Dependencies</p>
            {chain.length ? (
              <div className="space-y-1.5">
                {chain.map((dep) => (
                  <div key={dep.id} className="flex items-center gap-3">
                    <span className="text-white/20">·</span>
                    <span className={`text-sm font-sans ${dep.status === TASK_DONE_STATUS ? 'text-white/20 line-through' : 'text-white/40'}`}>
                      {dep.title}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-sans text-xs text-white/30">No blockers identified.</p>
            )}
          </div>

          {/* Blockers / Warnings */}
          {blocker && (
            <div className="mt-4 border border-status-error/30 bg-status-error/5 p-4 font-mono text-[10px] uppercase tracking-widest text-status-error">
              {blocker}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="sticky bottom-0 border-t border-white/5 bg-[#0a0a0a] p-6 shadow-[0_-20px_40px_rgba(0,0,0,0.4)]">
          <div className="grid grid-cols-2 gap-3 mb-4">
             {task.status !== 'in_progress' && task.status !== TASK_DONE_STATUS && (
               <button
                 type="button"
                 onClick={() => updateTaskStatus(task.id, 'in_progress')}
                 className="flex items-center justify-center gap-2 border border-brand/40 bg-transparent py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-brand hover:bg-brand/10 transition-all duration-150"
               >
                 <Play className="h-3 w-3" />
                 Start Execution
               </button>
             )}
             {task.status !== 'blocked' && task.status !== TASK_DONE_STATUS && (
               <button
                 type="button"
                 onClick={() => updateTaskStatus(task.id, 'blocked')}
                 className="flex items-center justify-center gap-2 border border-status-error/40 bg-transparent py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-status-error hover:bg-status-error/10 transition-all duration-150"
               >
                 <AlertCircle className="h-3 w-3" />
                 Mark Blocked
               </button>
             )}
          </div>
          <button
            type="button"
            onClick={() => onComplete(task)}
            disabled={Boolean(blocker) || task.status === TASK_DONE_STATUS}
            className="group w-full border border-green-400/20 bg-green-400/5 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-green-400 transition-all duration-150 hover:bg-green-400/10 disabled:cursor-not-allowed disabled:opacity-20"
          >
            {task.status === TASK_DONE_STATUS ? 'Operation Complete' : 'Mark Complete'}
          </button>
        </footer>
      </div>
    </div>
  );
}
