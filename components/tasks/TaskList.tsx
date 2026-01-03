import React from 'react';
import { useTaskStore } from '@/lib/task-store';
import type { Task, TaskPhase } from '@/types';
import { Check, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TaskListProps {
  releaseId: string;
}

const PHASES: { key: TaskPhase; label: string }[] = [
  { key: 'pre-production', label: 'Pre-Production' },
  { key: 'production', label: 'Production' },
  { key: 'promotion', label: 'Promotion' },
  { key: 'distribution', label: 'Distribution' },
];

export const TaskList: React.FC<TaskListProps> = ({ releaseId }) => {
  const { getTasksByPhase, toggleTaskStatus } = useTaskStore();

  const handleToggle = (taskId: string) => {
    toggleTaskStatus(taskId);
  };

  return (
    <div className="space-y-8">
      {PHASES.map((phase) => {
        const tasks = getTasksByPhase(releaseId, phase.key);
        const completedCount = tasks.filter(t => t.status === 'completed').length;

        if (tasks.length === 0) return null;

        return (
          <div key={phase.key}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold uppercase tracking-wider text-slate-400">
                {phase.label}
              </h3>
              <span className="text-sm text-slate-500">
                {completedCount}/{tasks.length} complete
              </span>
            </div>

            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={() => handleToggle(task.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface TaskItemProps {
  task: Task;
  onToggle: () => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, onToggle }) => {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';

  return (
    <div
      className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
        task.status === 'completed'
          ? 'bg-slate-900/30 border-slate-800/50 opacity-60'
          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
      }`}
    >
      <button
        onClick={onToggle}
        className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 transition-all ${
          task.status === 'completed'
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-slate-600 hover:border-emerald-500'
        }`}
      >
        {task.status === 'completed' && <Check className="w-full h-full text-black p-1" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          className={`font-medium mb-1 ${
            task.status === 'completed' ? 'line-through text-slate-500' : ''
          }`}
        >
          {task.title}
        </div>
        
        {task.description && (
          <p className="text-sm text-slate-400 mb-2">{task.description}</p>
        )}

        <div className="flex items-center gap-4 text-xs">
          {task.dueDate && (
            <div
              className={`flex items-center gap-1 ${
                isOverdue
                  ? 'text-red-400'
                  : task.status === 'completed'
                  ? 'text-slate-600'
                  : 'text-slate-400'
              }`}
            >
              <Clock className="w-3 h-3" />
              {task.status === 'completed' ? (
                'Completed'
              ) : isOverdue ? (
                'Overdue'
              ) : (
                `Due ${formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}`
              )}
            </div>
          )}
          
          {task.isSystemGenerated && (
            <span className="text-slate-600">Auto-generated</span>
          )}
        </div>
      </div>
    </div>
  );
};
