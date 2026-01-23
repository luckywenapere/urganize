// components/releases/RoadmapView.tsx
'use client';

import { X, Check, Clock, SkipForward, Circle } from 'lucide-react';
import type { AITask, TaskPhase, TaskStatus } from '@/types';

// =============================================
// TYPES
// =============================================

interface RoadmapViewProps {
  tasks: AITask[];
  currentPhase: TaskPhase;
  onClose: () => void;
}

// =============================================
// PHASE CONFIG
// =============================================

const PHASES: { 
  key: TaskPhase; 
  label: string; 
  icon: string;
  color: string;
  bgColor: string;
}[] = [
  { 
    key: 'pre-production', 
    label: 'Pre-Production', 
    icon: '🎯',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20'
  },
  { 
    key: 'production', 
    label: 'Production', 
    icon: '🎵',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20'
  },
  { 
    key: 'promotion', 
    label: 'Promotion', 
    icon: '📣',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20'
  },
  { 
    key: 'distribution', 
    label: 'Distribution', 
    icon: '🚀',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20'
  },
];

// =============================================
// STATUS ICON
// =============================================

function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'completed':
      return (
        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      );
    case 'in-progress':
      return (
        <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center animate-pulse">
          <Clock className="w-4 h-4 text-white" />
        </div>
      );
    default:
      return (
        <div className="w-6 h-6 rounded-full border-2 border-stroke-subtle flex items-center justify-center">
          <Circle className="w-3 h-3 text-content-tertiary" />
        </div>
      );
  }
}

// =============================================
// PHASE SECTION
// =============================================

interface PhaseSectionProps {
  phase: typeof PHASES[number];
  tasks: AITask[];
  isCurrentPhase: boolean;
  isCompleted: boolean;
}

function PhaseSection({ phase, tasks, isCurrentPhase, isCompleted }: PhaseSectionProps) {
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;

  return (
    <div className={`relative ${isCurrentPhase ? '' : 'opacity-70'}`}>
      {/* Phase Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl ${phase.bgColor} flex items-center justify-center text-xl`}>
          {phase.icon}
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold ${isCurrentPhase ? 'text-content-primary' : 'text-content-secondary'}`}>
            {phase.label}
          </h3>
          <p className="text-sm text-content-tertiary">
            {completedCount} of {totalCount} tasks
          </p>
        </div>
        {isCompleted && (
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Tasks */}
      {tasks.length > 0 && (
        <div className="ml-5 pl-5 border-l-2 border-stroke-subtle space-y-3">
          {tasks.map((task, index) => (
            <div 
              key={task.id} 
              className={`flex items-start gap-3 ${
                task.status === 'current' ? 'bg-brand/5 -ml-5 -mr-4 px-5 py-3 rounded-xl border border-brand/20' : ''
              }`}
            >
              <StatusIcon status={task.status} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${
                  task.status === 'completed' 
                    ? 'text-content-tertiary line-through' 
                    : task.status === 'current'
                      ? 'text-content-primary font-medium'
                      : 'text-content-secondary'
                }`}>
                  {task.title}
                </p>
                {task.status === 'current' && (
                  <p className="text-xs text-brand mt-1">Current task</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {tasks.length === 0 && (
        <div className="ml-5 pl-5 border-l-2 border-stroke-subtle">
          <p className="text-sm text-content-tertiary py-2">
            Tasks will be generated as you progress
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function RoadmapView({ tasks, currentPhase, onClose }: RoadmapViewProps) {
  // Group tasks by phase
  const tasksByPhase = PHASES.reduce((acc, phase) => {
    acc[phase.key] = tasks.filter(t => t.phase === phase.key);
    return acc;
  }, {} as Record<TaskPhase, AITask[]>);

  // Determine phase completion status
  const isPhaseCompleted = (phase: TaskPhase) => {
    const phaseTasks = tasksByPhase[phase];
    if (phaseTasks.length === 0) return false;
    return phaseTasks.every(t => t.status === 'completed');
  };

  // Overall progress
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalTasks = tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center sm:items-center">
      <div className="w-full max-w-lg bg-bg-surface rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stroke-subtle">
          <div>
            <h2 className="font-semibold text-content-primary">
              Campaign Roadmap
            </h2>
            <p className="text-sm text-content-tertiary">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-content-tertiary hover:text-content-primary hover:bg-bg-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-4 py-3 border-b border-stroke-subtle">
          <div className="flex items-center justify-between text-xs text-content-tertiary mb-2">
            <span>Overall Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-bg-elevated rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-brand rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Phases */}
        <div className="flex-1 overflow-y-auto p-4 space-y-8">
          {PHASES.map((phase, index) => (
            <PhaseSection
              key={phase.key}
              phase={phase}
              tasks={tasksByPhase[phase.key]}
              isCurrentPhase={phase.key === currentPhase}
              isCompleted={isPhaseCompleted(phase.key)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stroke-subtle">
          <button
            onClick={onClose}
            className="w-full py-3 border border-stroke-subtle rounded-xl text-content-secondary font-medium hover:bg-bg-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
