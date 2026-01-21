// =============================================
// URGANIZE - CURRENT TASK CARD
// =============================================
// components/releases/CurrentTaskCard.tsx

'use client';

import { useState } from 'react';
import { 
  Instagram, 
  Music2, 
  Twitter, 
  Youtube,
  Globe,
  Clock,
  ChevronLeft,
  RefreshCw,
  SkipForward,
  Check,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { AITask, TaskInputType, TaskPlatform } from '@/types/ai-tasks';

// =============================================
// TYPES
// =============================================

interface CurrentTaskCardProps {
  task: AITask;
  taskNumber: number;
  totalTasks: number;
  variantsRemaining: number;
  isCompleting: boolean;
  isGeneratingVariant: boolean;
  onComplete: (userInput: string, inputData?: any) => Promise<void>;
  onSkip: () => void;
  onGoBack: () => void;
  onRequestVariant: () => void;
  canGoBack: boolean;
}

// =============================================
// PLATFORM ICONS & COLORS
// =============================================

const platformConfig: Record<TaskPlatform | string, { 
  icon: React.ElementType; 
  color: string;
  bgColor: string;
  label: string;
}> = {
  instagram: { 
    icon: Instagram, 
    color: 'text-pink-400', 
    bgColor: 'bg-pink-500/20',
    label: 'Instagram'
  },
  tiktok: { 
    icon: Music2, 
    color: 'text-cyan-400', 
    bgColor: 'bg-cyan-500/20',
    label: 'TikTok'
  },
  twitter: { 
    icon: Twitter, 
    color: 'text-blue-400', 
    bgColor: 'bg-blue-500/20',
    label: 'Twitter / X'
  },
  youtube: { 
    icon: Youtube, 
    color: 'text-red-400', 
    bgColor: 'bg-red-500/20',
    label: 'YouTube'
  },
  spotify: { 
    icon: Music2, 
    color: 'text-green-400', 
    bgColor: 'bg-green-500/20',
    label: 'Spotify'
  },
  apple_music: { 
    icon: Music2, 
    color: 'text-pink-400', 
    bgColor: 'bg-pink-500/20',
    label: 'Apple Music'
  },
  general: { 
    icon: Globe, 
    color: 'text-brand', 
    bgColor: 'bg-brand/20',
    label: 'General'
  },
  email: { 
    icon: Globe, 
    color: 'text-amber-400', 
    bgColor: 'bg-amber-500/20',
    label: 'Email'
  },
  whatsapp: { 
    icon: Globe, 
    color: 'text-green-400', 
    bgColor: 'bg-green-500/20',
    label: 'WhatsApp'
  },
};

// =============================================
// TASK INPUT COMPONENT
// =============================================

interface TaskInputProps {
  type: TaskInputType;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  options?: { value: string; label: string }[];
}

function TaskInput({ type, value, onChange, placeholder, label, options }: TaskInputProps) {
  switch (type) {
    case 'text':
      return (
        <div className="space-y-2">
          {label && (
            <label className="block text-sm font-medium text-content-secondary">
              {label}
            </label>
          )}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Enter your response...'}
            rows={4}
            className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors resize-none"
          />
        </div>
      );

    case 'url':
      return (
        <div className="space-y-2">
          {label && (
            <label className="block text-sm font-medium text-content-secondary">
              {label}
            </label>
          )}
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'https://...'}
            className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
          />
        </div>
      );

    case 'number':
      return (
        <div className="space-y-2">
          {label && (
            <label className="block text-sm font-medium text-content-secondary">
              {label}
            </label>
          )}
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || '0'}
            className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
          />
        </div>
      );

    case 'select':
      return (
        <div className="space-y-2">
          {label && (
            <label className="block text-sm font-medium text-content-secondary">
              {label}
            </label>
          )}
          <div className="space-y-2">
            {options?.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  value === option.value
                    ? 'border-brand bg-brand/10'
                    : 'border-stroke-subtle bg-bg-elevated hover:border-stroke-default'
                }`}
              >
                <span className={value === option.value ? 'text-brand' : 'text-content-primary'}>
                  {option.label}
                </span>
                {value === option.value && <Check className="w-5 h-5 text-brand" />}
              </button>
            ))}
          </div>
        </div>
      );

    case 'confirm':
      return (
        <div className="space-y-2">
          {label && (
            <label className="block text-sm font-medium text-content-secondary">
              {label}
            </label>
          )}
          <button
            type="button"
            onClick={() => onChange(value === 'confirmed' ? '' : 'confirmed')}
            className={`w-full flex items-center justify-center gap-3 p-4 rounded-xl border transition-all ${
              value === 'confirmed'
                ? 'border-brand bg-brand/10'
                : 'border-stroke-subtle bg-bg-elevated hover:border-stroke-default'
            }`}
          >
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              value === 'confirmed' ? 'border-brand bg-brand' : 'border-content-tertiary'
            }`}>
              {value === 'confirmed' && <Check className="w-4 h-4 text-white" />}
            </div>
            <span className={value === 'confirmed' ? 'text-brand font-medium' : 'text-content-primary'}>
              {placeholder || 'I have completed this task'}
            </span>
          </button>
        </div>
      );

    case 'date':
      return (
        <div className="space-y-2">
          {label && (
            <label className="block text-sm font-medium text-content-secondary">
              {label}
            </label>
          )}
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary focus:outline-none focus:border-brand transition-colors"
          />
        </div>
      );

    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
        />
      );
  }
}

// =============================================
// MAIN COMPONENT
// =============================================

export function CurrentTaskCard({
  task,
  taskNumber,
  totalTasks,
  variantsRemaining,
  isCompleting,
  isGeneratingVariant,
  onComplete,
  onSkip,
  onGoBack,
  onRequestVariant,
  canGoBack,
}: CurrentTaskCardProps) {
  const [inputValue, setInputValue] = useState(task.userInput || '');
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const platform = platformConfig[task.platform || 'general'] || platformConfig.general;
  const PlatformIcon = platform.icon;

  const canComplete = () => {
    switch (task.inputType) {
      case 'confirm':
        return inputValue === 'confirmed';
      case 'url':
        return inputValue.startsWith('http');
      case 'text':
      case 'number':
        return inputValue.trim().length > 0;
      case 'select':
        return inputValue.length > 0;
      default:
        return true;
    }
  };

  const handleComplete = async () => {
    if (canComplete()) {
      await onComplete(inputValue);
    }
  };

  return (
    <div className="bg-bg-surface border border-stroke-subtle rounded-2xl overflow-hidden">
      {/* Task Header */}
      <div className="p-4 border-b border-stroke-subtle">
        <div className="flex items-center justify-between mb-3">
          {/* Platform Badge */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${platform.bgColor}`}>
            <PlatformIcon className={`w-4 h-4 ${platform.color}`} />
            <span className={`text-sm font-medium ${platform.color}`}>
              {platform.label}
            </span>
          </div>
          
          {/* Time Estimate */}
          {task.estimatedTime && (
            <div className="flex items-center gap-1.5 text-content-tertiary">
              <Clock className="w-4 h-4" />
              <span className="text-sm">~{task.estimatedTime}</span>
            </div>
          )}
        </div>

        {/* Task Number */}
        <p className="text-xs text-content-tertiary mb-1">
          Task {taskNumber} of ~{totalTasks}
        </p>

        {/* Task Title */}
        <h2 className="text-xl font-bold text-content-primary">
          {task.title}
        </h2>
      </div>

      {/* Task Description */}
      <div className="p-4 border-b border-stroke-subtle">
        <p className="text-content-secondary whitespace-pre-wrap leading-relaxed">
          {task.description}
        </p>
      </div>

      {/* Why It Matters */}
      {task.whyItMatters && (
        <div className="p-4 bg-brand/5 border-b border-stroke-subtle">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-brand" />
            </div>
            <div>
              <p className="text-sm font-medium text-brand mb-1">Why this matters</p>
              <p className="text-sm text-content-secondary">{task.whyItMatters}</p>
            </div>
          </div>
        </div>
      )}

      {/* Task Input */}
      <div className="p-4 border-b border-stroke-subtle">
        <TaskInput
          type={task.inputType}
          value={inputValue}
          onChange={setInputValue}
          placeholder={task.inputPlaceholder}
          label={task.inputLabel}
          options={task.inputOptions}
        />
      </div>

      {/* Action Buttons */}
      <div className="p-4 space-y-3">
        {/* Primary Action */}
        <button
          onClick={handleComplete}
          disabled={!canComplete() || isCompleting}
          className="w-full py-4 px-6 bg-brand text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all hover:bg-brand/90 active:scale-[0.98]"
        >
          {isCompleting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Complete Task
            </>
          )}
        </button>

        {/* Secondary Actions */}
        <div className="flex gap-2">
          {/* Go Back */}
          <button
            onClick={onGoBack}
            disabled={!canGoBack || isCompleting}
            className="flex-1 py-3 px-4 border border-stroke-subtle rounded-xl text-content-secondary font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-bg-hover transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {/* Get Variant */}
          <button
            onClick={onRequestVariant}
            disabled={variantsRemaining <= 0 || isGeneratingVariant || isCompleting}
            className="flex-1 py-3 px-4 border border-stroke-subtle rounded-xl text-content-secondary font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-bg-hover transition-colors"
          >
            {isGeneratingVariant ? (
              <div className="w-4 h-4 border-2 border-content-tertiary/30 border-t-content-tertiary rounded-full animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Variant
            {variantsRemaining > 0 && (
              <span className="text-xs text-content-tertiary">({variantsRemaining})</span>
            )}
          </button>
        </div>

        {/* Skip Task */}
        {!showSkipConfirm ? (
          <button
            onClick={() => setShowSkipConfirm(true)}
            disabled={isCompleting}
            className="w-full py-2 text-content-tertiary text-sm hover:text-content-secondary transition-colors"
          >
            Skip this task
          </button>
        ) : (
          <div className="p-4 bg-status-warning/10 border border-status-warning/20 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-status-warning">Skip this task?</p>
                <p className="text-sm text-content-secondary mt-1">
                  Skipping tasks may affect your campaign results. You can complete it later from the skipped tasks panel.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSkipConfirm(false)}
                className="flex-1 py-2 px-4 border border-stroke-subtle rounded-lg text-content-secondary text-sm font-medium hover:bg-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSkipConfirm(false);
                  onSkip();
                }}
                className="flex-1 py-2 px-4 bg-status-warning/20 text-status-warning rounded-lg text-sm font-medium hover:bg-status-warning/30 transition-colors"
              >
                Skip anyway
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
