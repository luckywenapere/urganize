// components/releases/SkippedTasksPanel.tsx
'use client';

import { useState } from 'react';
import { 
  X, 
  SkipForward, 
  Clock, 
  ChevronRight,
  Check
} from 'lucide-react';
import type { AITask, TaskPhase } from '@/types';

// =============================================
// TYPES
// =============================================

interface SkippedTasksPanelProps {
  tasks: AITask[];
  onClose: () => void;
  onCompleteTask: (taskId: string, userInput: string) => Promise<void>;
}

// =============================================
// PHASE CONFIG
// =============================================

const PHASE_LABELS: Record<TaskPhase, string> = {
  'pre-production': 'Pre-Production',
  'production': 'Production',
  'promotion': 'Promotion',
  'distribution': 'Distribution',
};

// =============================================
// SKIPPED TASK ITEM
// =============================================

interface SkippedTaskItemProps {
  task: AITask;
  onComplete: (userInput: string) => Promise<void>;
}

function SkippedTaskItem({ task, onComplete }: SkippedTaskItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = async () => {
    if (!inputValue.trim() && task.inputType !== 'confirm') return;
    
    setIsCompleting(true);
    try {
      await onComplete(task.inputType === 'confirm' ? 'confirmed' : inputValue);
      setIsExpanded(false);
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="bg-bg-elevated rounded-xl border border-stroke-subtle overflow-hidden">
      {/* Task Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-start gap-3 text-left hover:bg-bg-hover transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-status-warning/20 flex items-center justify-center flex-shrink-0">
          <SkipForward className="w-4 h-4 text-status-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-content-primary truncate">
            {task.title}
          </h4>
          <p className="text-sm text-content-tertiary mt-0.5">
            {PHASE_LABELS[task.phase]}
            {task.estimatedTime && ` • ${task.estimatedTime}`}
          </p>
        </div>
        <ChevronRight 
          className={`w-5 h-5 text-content-tertiary transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`} 
        />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-stroke-subtle">
          {/* Description */}
          <p className="text-sm text-content-secondary py-3 whitespace-pre-wrap">
            {task.description}
          </p>

          {/* Input */}
          <div className="space-y-3">
            {task.inputType === 'confirm' ? (
              <button
                onClick={() => setInputValue(inputValue === 'confirmed' ? '' : 'confirmed')}
                className={`w-full flex items-center justify-center gap-3 p-3 rounded-xl border transition-all ${
                  inputValue === 'confirmed'
                    ? 'border-brand bg-brand/10'
                    : 'border-stroke-subtle bg-bg-surface hover:border-stroke-default'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  inputValue === 'confirmed' ? 'border-brand bg-brand' : 'border-content-tertiary'
                }`}>
                  {inputValue === 'confirmed' && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className={inputValue === 'confirmed' ? 'text-brand font-medium' : 'text-content-primary'}>
                  {task.inputPlaceholder || 'I have completed this task'}
                </span>
              </button>
            ) : task.inputType === 'url' ? (
              <input
                type="url"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={task.inputPlaceholder || 'https://...'}
                className="w-full px-4 py-3 bg-bg-surface border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand"
              />
            ) : (
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={task.inputPlaceholder || 'Enter your response...'}
                rows={3}
                className="w-full px-4 py-3 bg-bg-surface border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand resize-none"
              />
            )}

            {/* Complete Button */}
            <button
              onClick={handleComplete}
              disabled={
                isCompleting || 
                (task.inputType !== 'confirm' && !inputValue.trim())
              }
              className="w-full py-3 bg-brand text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCompleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Complete Task
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function SkippedTasksPanel({ 
  tasks, 
  onClose, 
  onCompleteTask 
}: SkippedTasksPanelProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center sm:items-center">
      <div className="w-full max-w-lg bg-bg-surface rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stroke-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-status-warning/20 flex items-center justify-center">
              <SkipForward className="w-5 h-5 text-status-warning" />
            </div>
            <div>
              <h2 className="font-semibold text-content-primary">
                Skipped Tasks
              </h2>
              <p className="text-sm text-content-tertiary">
                {tasks.length} task{tasks.length !== 1 ? 's' : ''} to complete
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-content-tertiary hover:text-content-primary hover:bg-bg-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tasks.length === 0 ? (
            <div className="text-center py-8">
              <Check className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-content-secondary">
                No skipped tasks. Great job!
              </p>
            </div>
          ) : (
            tasks.map((task) => (
              <SkippedTaskItem
                key={task.id}
                task={task}
                onComplete={(userInput) => onCompleteTask(task.id, userInput)}
              />
            ))
          )}
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
