'use client';

import React, { useState } from 'react';
import { useTaskStore } from '@/lib/task-store';
import { Card } from '@/components/ui/Card';
import type { Task, TaskPhase } from '@/types';
import { Check, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface TaskListProps {
  releaseId: string;
}

const PHASES: { key: TaskPhase; label: string; icon: string; color: string }[] = [
  { key: 'pre-production', label: 'Pre-Production', icon: '🎯', color: 'text-phase-preproduction' },
  { key: 'production', label: 'Production', icon: '🎵', color: 'text-phase-production' },
  { key: 'promotion', label: 'Promotion', icon: '📣', color: 'text-phase-promotion' },
  { key: 'distribution', label: 'Distribution', icon: '🚀', color: 'text-phase-distribution' },
];

export const TaskList: React.FC<TaskListProps> = ({ releaseId }) => {
  const { getTasksByPhase, toggleTaskStatus } = useTaskStore();
  const [expandedPhases, setExpandedPhases] = useState<Set<TaskPhase>>(
    new Set(['pre-production', 'production', 'promotion', 'distribution'])
  );

  const togglePhase = (phase: TaskPhase) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      next.has(phase) ? next.delete(phase) : next.add(phase);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {PHASES.map((phase) => {
        const tasks = getTasksByPhase(releaseId, phase.key);
        const completedCount = tasks.filter(t => t.status === 'completed').length;
        const isExpanded = expandedPhases.has(phase.key);
        const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

        if (tasks.length === 0) return null;

        return (
          <Card key={phase.key} padding="none" className="overflow-hidden">
            {/* Phase Header */}
            <button
              onClick={() => togglePhase(phase.key)}
              className="w-full flex items-center justify-between p-4 hover:bg-bg-hover transition-colors duration-fast"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{phase.icon}</span>
                <div className="text-left">
                  <h3 className={`font-semibold ${phase.color}`}>{phase.label}</h3>
                  <p className="text-xs text-content-tertiary">{completedCount}/{tasks.length} complete</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Mini progress */}
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-20 h-1 bg-bg-overlay rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-brand rounded-full transition-all duration-slower"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-content-tertiary tabular-nums w-8">{progress}%</span>
                </div>
                
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-content-tertiary" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-content-tertiary" />
                )}
              </div>
            </button>

            {/* Tasks */}
            {isExpanded && (
              <div className="border-t border-stroke-subtle">
                {tasks.map((task, i) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTaskStatus(task.id)}
                    isLast={i === tasks.length - 1}
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

interface TaskItemProps {
  task: Task;
  onToggle: () => void;
  isLast?: boolean;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, onToggle, isLast }) => {
  const isCompleted = task.status === 'completed';
  const daysUntilDue = task.dueDate ? differenceInDays(new Date(task.dueDate), new Date()) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0 && !isCompleted;

  const getDueText = () => {
    if (!task.dueDate) return null;
    if (isCompleted) return 'Done';
    if (daysUntilDue === null) return null;
    if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d overdue`;
    if (daysUntilDue === 0) return 'Today';
    if (daysUntilDue === 1) return 'Tomorrow';
    return `${daysUntilDue}d`;
  };

  return (
    <div className={`flex items-start gap-3 p-4 transition-colors duration-fast ${
      !isLast ? 'border-b border-stroke-subtle' : ''
    } ${isCompleted ? 'bg-bg-base/50' : 'hover:bg-bg-hover'}`}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-all duration-fast flex items-center justify-center mt-0.5 ${
          isCompleted
            ? 'bg-brand border-brand'
            : 'border-content-tertiary hover:border-brand'
        }`}
      >
        {isCompleted && <Check className="w-3 h-3 text-content-inverse" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium transition-colors ${
          isCompleted ? 'line-through text-content-tertiary' : 'text-content-primary'
        }`}>
          {task.title}
        </p>
        
        {task.description && (
          <p className={`text-xs mt-0.5 ${isCompleted ? 'text-content-quaternary' : 'text-content-tertiary'}`}>
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-2">
          {task.dueDate && (
            <span className={`flex items-center gap-1 text-xs ${
              isCompleted ? 'text-content-quaternary' :
              isOverdue ? 'text-status-error' :
              daysUntilDue !== null && daysUntilDue <= 3 ? 'text-status-warning' :
              'text-content-tertiary'
            }`}>
              <Clock className="w-3 h-3" />
              {getDueText()}
            </span>
          )}
          
          {task.isSystemGenerated && (
            <span className="text-xs text-content-quaternary px-1.5 py-0.5 rounded bg-bg-elevated">
              Auto
            </span>
          )}
        </div>
      </div>

      {/* Overdue indicator */}
      {isOverdue && (
        <span className="w-2 h-2 rounded-full bg-status-error animate-pulse-glow flex-shrink-0 mt-1.5" />
      )}
    </div>
  );
};
