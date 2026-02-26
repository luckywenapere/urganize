'use client';

type Step5ExistingStepsProps = {
  stepsText: string;
  isBusy: boolean;
  onStepsTextChange: (value: string) => void;
  onSkip: () => Promise<void>;
};

export function Step5ExistingSteps({
  stepsText,
  isBusy,
  onStepsTextChange,
  onSkip,
}: Step5ExistingStepsProps) {
  return (
    <>
      <h1 className="mt-[18vh] text-[clamp(2.4rem,5.6vw,4.4rem)] tracking-tight">Do you have steps?</h1>
      <textarea
        className="mt-10 min-h-[230px] w-full border border-white/5 bg-[#02090d] p-4 text-xl outline-none"
        value={stepsText}
        onChange={(e) => onStepsTextChange(e.target.value)}
        placeholder="Example: 1) Tease snippet for 7 days 2) Shoot 3 UGC clips 3) DM 20 micro-creators."
      />
      <button type="button" disabled={isBusy} onClick={onSkip} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)]">
        Skip..
      </button>
    </>
  );
}
