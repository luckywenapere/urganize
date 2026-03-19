'use client';

type Step0IntroProps = {
  onContinue: () => void;
};

export function Step0Intro({ onContinue }: Step0IntroProps) {
  return (
    <button
      type="button"
      onClick={onContinue}
      className="mt-[44vh] self-center text-[clamp(2.2rem,5.5vw,3.8rem)] text-content-primary"
    >
      Tap to Continue
    </button>
  );
}
