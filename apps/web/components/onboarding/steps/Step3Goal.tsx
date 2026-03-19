'use client';

type Step3GoalProps = {
  heading?: string;
  goalText: string;
  goalRemainingChars: number;
  canContinueGoal: boolean;
  isBusy: boolean;
  onGoalTextChange: (value: string) => void;
  onContinue: () => Promise<void>;
};

export function Step3Goal({
  heading,
  goalText,
  goalRemainingChars,
  canContinueGoal,
  isBusy,
  onGoalTextChange,
  onContinue,
}: Step3GoalProps) {
  return (
    <>
      <h1 className="mt-[18vh] text-[clamp(2.4rem,5.6vw,4.4rem)] tracking-tight">{heading || 'What do you want to achieve?'}</h1>
      <textarea
        className="mt-10 min-h-[230px] w-full rounded-lg border border-stroke-subtle bg-bg-surface p-4 text-xl text-content-primary outline-none placeholder:text-content-quaternary"
        value={goalText}
        onChange={(e) => onGoalTextChange(e.target.value)}
        placeholder="Example: Grow monthly listeners from 5k to 15k before my next single drops."
      />
      <p className={`mt-3 text-sm ${goalRemainingChars === 0 ? 'text-brand' : 'text-content-secondary'}`}>
        {goalRemainingChars === 0
          ? 'Looks good. We can generate better tasks with this level of detail.'
          : `Add ${goalRemainingChars} more characters for a higher-quality plan.`}
      </p>
      <button type="button" disabled={!canContinueGoal || isBusy} onClick={onContinue} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)] text-content-primary disabled:opacity-40">
        Next..
      </button>
    </>
  );
}
