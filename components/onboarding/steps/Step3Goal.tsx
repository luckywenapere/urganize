'use client';

type Step3GoalProps = {
  heading?: string;
  goalText: string;
  canContinueGoal: boolean;
  isBusy: boolean;
  onGoalTextChange: (value: string) => void;
  onContinue: () => Promise<void>;
};

export function Step3Goal({
  heading,
  goalText,
  canContinueGoal,
  isBusy,
  onGoalTextChange,
  onContinue,
}: Step3GoalProps) {
  return (
    <div className="mx-auto mt-[12vh] w-full max-w-[860px] rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl sm:p-8">
      <h1 className="text-[clamp(2.4rem,5.6vw,4.4rem)] tracking-tight">{heading || 'What do you want to achieve?'}</h1>
      <textarea
        className="mt-8 min-h-[230px] w-full rounded-2xl border border-stroke-subtle bg-bg-elevated/70 p-4 text-xl text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
        value={goalText}
        onChange={(e) => onGoalTextChange(e.target.value)}
        placeholder="Example: Grow monthly listeners from 5k to 15k before my next single drops."
      />
      <p className="mt-3 text-sm text-content-secondary">Any amount of detail is fine. Add as much context as you have.</p>
      <button type="button" disabled={!canContinueGoal || isBusy} onClick={onContinue} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)] text-content-primary disabled:opacity-40">
        Next..
      </button>
    </div>
  );
}
