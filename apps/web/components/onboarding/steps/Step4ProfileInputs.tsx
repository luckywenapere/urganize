'use client';

import type { KeyboardEvent } from 'react';

type StageOption = { value: 'emerging' | 'growing' | 'established'; label: string };

type Step4ProfileInputsProps = {
  fieldClass: string;
  stage: string;
  stageOptions: StageOption[];
  audienceSize: string;
  audienceSizeOptions: string[];
  listenerPlatforms: string[];
  platformInput: string;
  listenerPlatformOptions: string[];
  budget: string;
  budgetIsValid: boolean;
  minBudget: number;
  maxBudget: number;
  deadlineDate: string;
  timeline: string;
  timelineOptions: string[];
  minDate: string;
  profileFieldsReady: boolean;
  isBusy: boolean;
  onStageChange: (value: string) => void;
  onAudienceSizeChange: (value: string) => void;
  onRemoveListenerPlatform: (value: string) => void;
  onPlatformInputChange: (value: string) => void;
  onCommitPlatformInput: () => void;
  onBudgetChange: (value: string) => void;
  onDeadlineDateChange: (value: string) => void;
  onTimelineChange: (value: string) => void;
  onApplyTimelinePreset: (days: number | null, label: string) => void;
  onSubmit: () => Promise<void>;
};

export function Step4ProfileInputs({
  fieldClass,
  stage,
  stageOptions,
  audienceSize,
  audienceSizeOptions,
  listenerPlatforms,
  platformInput,
  listenerPlatformOptions,
  budget,
  budgetIsValid,
  minBudget,
  maxBudget,
  deadlineDate,
  timeline,
  timelineOptions,
  minDate,
  profileFieldsReady,
  isBusy,
  onStageChange,
  onAudienceSizeChange,
  onRemoveListenerPlatform,
  onPlatformInputChange,
  onCommitPlatformInput,
  onBudgetChange,
  onDeadlineDateChange,
  onTimelineChange,
  onApplyTimelinePreset,
  onSubmit,
}: Step4ProfileInputsProps) {
  const handlePlatformKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      onCommitPlatformInput();
    }
  };

  return (
    <>
      <div className="mx-auto mt-[17vh] grid w-full max-w-[720px] grid-cols-1 gap-5">
        <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Stage</label>
        <select
          className={fieldClass}
          value={stage || 'emerging'}
          onChange={(e) => onStageChange(e.target.value)}
        >
          {stageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Audience Size</label>
        <div>
          <input
            className={fieldClass}
            value={audienceSize}
            onChange={(e) => onAudienceSizeChange(e.target.value)}
            list="audience-size-options"
            placeholder="Combined audience (e.g. 5,001 - 20,000)"
            autoComplete="off"
          />
          <datalist id="audience-size-options">
            {audienceSizeOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <p className="mt-2 text-xs text-content-tertiary">Use your estimated combined audience across all channels.</p>
        </div>
        <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Platforms</label>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {listenerPlatforms.map((platform) => (
              <span
                key={platform}
                className="inline-flex items-center gap-2 rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-sm text-content-primary"
              >
                {platform}
                <button
                  type="button"
                  onClick={() => onRemoveListenerPlatform(platform)}
                  className="text-content-tertiary hover:text-content-primary"
                  aria-label={`Remove ${platform}`}
                >
                  x
                </button>
              </span>
            ))}
            {listenerPlatforms.length === 0 && (
              <p className="text-sm text-content-tertiary">No platforms added yet.</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              className={fieldClass}
              value={platformInput}
              onChange={(e) => onPlatformInputChange(e.target.value)}
              onBlur={onCommitPlatformInput}
              onKeyDown={handlePlatformKeyDown}
              list="listener-platform-options"
              placeholder="Type platform and press Enter"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={onCommitPlatformInput}
              className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
            >
              Add
            </button>
          </div>
          <datalist id="listener-platform-options">
            {listenerPlatformOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <p className="text-xs text-content-tertiary">Pick from suggestions or type custom channels.</p>
        </div>
        <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Budget</label>
        <input
          className={fieldClass}
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          value={budget}
          onChange={(e) => onBudgetChange(e.target.value)}
          placeholder="e.g. 100000"
        />
        <p className={`mt-2 text-xs ${budget.trim().length > 0 && !budgetIsValid ? 'text-status-error' : 'text-content-tertiary'}`}>
          Enter a realistic budget between {minBudget} and {maxBudget}.
        </p>
        <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Timeline</label>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              className={fieldClass}
              type="date"
              min={minDate}
              value={deadlineDate}
              onChange={(e) => onDeadlineDateChange(e.target.value)}
            />
            <input
              className={fieldClass}
              value={timeline}
              onChange={(e) => onTimelineChange(e.target.value)}
              list="timeline-options"
              placeholder="Optional context (e.g. before summer campaign)"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApplyTimelinePreset(14, 'ASAP (within 2 weeks)')}
              className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-sm text-content-primary hover:bg-bg-hover"
            >
              2 weeks
            </button>
            <button
              type="button"
              onClick={() => onApplyTimelinePreset(30, 'Within 1 month')}
              className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-sm text-content-primary hover:bg-bg-hover"
            >
              30 days
            </button>
            <button
              type="button"
              onClick={() => onApplyTimelinePreset(90, 'In 2-3 months')}
              className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-sm text-content-primary hover:bg-bg-hover"
            >
              90 days
            </button>
            <button
              type="button"
              onClick={() => onApplyTimelinePreset(null, 'No fixed deadline')}
              className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-sm text-content-primary hover:bg-bg-hover"
            >
              No deadline
            </button>
          </div>
          <datalist id="timeline-options">
            {timelineOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>
      {!profileFieldsReady && (
        <p className="mx-auto mt-4 w-full max-w-[720px] text-sm text-content-secondary">
          Complete audience size, platform list, budget, and timeline to continue.
        </p>
      )}
      <button type="button" disabled={isBusy || !profileFieldsReady} onClick={onSubmit} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)] text-content-primary disabled:opacity-40">
        Submit..
      </button>
    </>
  );
}
