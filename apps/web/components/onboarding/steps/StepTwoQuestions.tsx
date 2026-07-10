'use client';

import type {
  OnboardingBiggestHeadache,
  OnboardingPersona,
  OnboardingReleaseProcess,
  OnboardingState,
} from '@/lib/onboarding';

const STEP_TWO_ANIMATION_STYLE = { animationDuration: '200ms' } as const;
const PERSONA_OPTIONS: Array<{ value: OnboardingPersona; label: string }> = [
  { value: 'independent_artist', label: 'Independent Artist' },
  { value: 'music_manager', label: 'Music Manager' },
  { value: 'label_ar', label: 'Label / A&R' },
  { value: 'producer_beatmaker', label: 'Producer / Beatmaker' },
  { value: 'other', label: 'Other' },
];
const RELEASE_PROCESS_OPTIONS: Array<{ value: OnboardingReleaseProcess; label: string }> = [
  { value: 'spreadsheets_or_notes', label: 'Spreadsheets or notes' },
  { value: 'group_chats_and_dms', label: 'Group chats and DMs' },
  { value: 'nothing_structured_yet', label: 'Nothing structured yet' },
  { value: 'another_tool', label: 'Another tool' },
];
const BIGGEST_HEADACHE_OPTIONS: Array<{ value: OnboardingBiggestHeadache; label: string }> = [
  { value: 'keeping_team_aligned', label: 'Keeping the team aligned' },
  { value: 'tracking_whats_done_and_whats_next', label: "Tracking what's done and what's next" },
  { value: 'collecting_credits_and_metadata', label: 'Collecting credits and metadata' },
  { value: 'managing_multiple_releases_at_once', label: 'Managing multiple releases at once' },
];

function StepQuestion<TValue extends string>({
  prompt,
  options,
  selectedValue,
  onSelect,
  disabled,
}: {
  prompt: string;
  options: Array<{ value: TValue; label: string }>;
  selectedValue: TValue | null;
  onSelect: (value: TValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="animate-in space-y-3" style={STEP_TWO_ANIMATION_STYLE}>
      <h2 className="text-[clamp(1.9rem,4vw,2.8rem)] tracking-tight text-content-primary">{prompt}</h2>
      <div className="space-y-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`w-full rounded-[24px] border px-4 py-4 text-left text-base font-medium transition hover:-translate-y-[1px] hover:bg-bg-hover disabled:opacity-60 ${
              selectedValue === option.value
                ? 'border-brand/40 bg-brand-muted text-content-primary'
                : 'border-stroke-default bg-bg-surface/90 text-content-secondary'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepTwoQuestions({
  onboarding,
  firstName,
  isSaving,
  showClosingLine,
  onSelectPersona,
  onSelectReleaseProcess,
  onSelectBiggestHeadache,
}: {
  onboarding: OnboardingState;
  firstName: string;
  isSaving: boolean;
  showClosingLine: boolean;
  onSelectPersona: (value: OnboardingPersona) => Promise<void>;
  onSelectReleaseProcess: (value: OnboardingReleaseProcess) => Promise<void>;
  onSelectBiggestHeadache: (value: OnboardingBiggestHeadache) => Promise<void>;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-1 py-8">
      <div className="w-full max-w-3xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="saas-eyebrow">Step 2 of 5</p>
          <h1 className="mt-4 text-[clamp(2.2rem,6vw,4.4rem)] tracking-tight text-content-primary">
            Let&apos;s make this feel like yours.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">
            Answer a few quick questions so Urganize can meet you where you already are.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <StepQuestion
            prompt={`Hey ${firstName}. What best describes you?`}
            options={PERSONA_OPTIONS}
            selectedValue={onboarding.onboardingPersona}
            onSelect={(value) => {
              void onSelectPersona(value);
            }}
            disabled={isSaving}
          />

          {onboarding.onboardingPersona ? (
            <StepQuestion
              prompt="How are you handling releases right now?"
              options={RELEASE_PROCESS_OPTIONS}
              selectedValue={onboarding.onboardingReleaseProcess}
              onSelect={(value) => {
                void onSelectReleaseProcess(value);
              }}
              disabled={isSaving}
            />
          ) : null}

          {onboarding.onboardingReleaseProcess ? (
            <StepQuestion
              prompt="What&apos;s your biggest headache?"
              options={BIGGEST_HEADACHE_OPTIONS}
              selectedValue={onboarding.onboardingBiggestHeadache}
              onSelect={(value) => {
                void onSelectBiggestHeadache(value);
              }}
              disabled={isSaving}
            />
          ) : null}
        </div>

        {showClosingLine ? (
          <div className="animate-in mt-10 text-center" style={STEP_TWO_ANIMATION_STYLE}>
            <p className="text-[clamp(1.3rem,3vw,1.8rem)] text-content-primary">
              Got it. Let&apos;s build your workspace.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
