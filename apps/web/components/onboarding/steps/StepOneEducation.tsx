'use client';

import { EDUCATION_CARDS } from '../useOnboardingWizard';

function EducationCardPreview({
  cardIndex,
  tick,
}: {
  cardIndex: number;
  tick: number;
}) {
  if (cardIndex === 0) {
    const activePhase = tick % 3;
    return (
      <div className="relative overflow-hidden rounded-[28px] border border-stroke-default bg-bg-surface/90 p-5 shadow-[0_26px_70px_-40px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
        <div className="pointer-events-none absolute inset-x-12 top-8 h-24 rounded-full bg-brand/12 blur-3xl" />
        <div className="relative space-y-3">
          {['Pre-Release', 'Release Week', 'Post-Release'].map((phase, index) => (
            <div
              key={phase}
              className={`rounded-[24px] border px-4 py-4 transition-all duration-500 ${
                index === activePhase
                  ? 'border-brand/35 bg-brand-muted shadow-[0_18px_36px_-30px_rgb(var(--color-brand)/0.7)]'
                  : 'border-stroke-default bg-bg-elevated/85'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">{phase}</p>
                  <p className="mt-2 text-sm font-semibold text-content-primary">
                    {index === 0 ? 'Build the plan' : index === 1 ? 'Move every deadline' : 'Close the loop'}
                  </p>
                </div>
                <div
                  className={`h-3 w-3 rounded-full transition-all duration-500 ${
                    index === activePhase ? 'bg-brand shadow-[0_0_24px_rgb(var(--color-brand)/0.8)]' : 'bg-content-quaternary'
                  }`}
                />
              </div>
              <div className="mt-4 h-2 rounded-full bg-bg-overlay">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-700"
                  style={{ width: `${index < activePhase ? 100 : index === activePhase ? 72 : 22}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, blockIndex) => (
                  <div
                    key={blockIndex}
                    className={`h-8 rounded-2xl border transition-all duration-500 ${
                      blockIndex <= index
                        ? 'border-brand/25 bg-brand/12'
                        : 'border-stroke-subtle bg-bg-base/55'
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export function StepOneEducation({
  educationIndex,
  demoTick,
  isSaving,
  onAdvance,
}: {
  educationIndex: number;
  demoTick: number;
  isSaving: boolean;
  onAdvance: () => Promise<void>;
}) {
  const card = EDUCATION_CARDS[educationIndex];

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <div className="w-full max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="saas-eyebrow">Step 1 of 5</p>
          <h1 className="mt-4 text-[clamp(2.4rem,7vw,5.2rem)] tracking-tight text-content-primary">
            {card.headline}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">
            {card.copy}
          </p>
        </div>

        <div className="mt-8">
          <EducationCardPreview cardIndex={educationIndex} tick={demoTick} />
        </div>

        <div className="mt-7 flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            {EDUCATION_CARDS.map((demoCard, index) => (
              <span
                key={demoCard.label}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  index === educationIndex ? 'w-10 bg-brand' : 'w-2.5 bg-content-quaternary'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => void onAdvance()}
            disabled={isSaving}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
          >
            {isSaving
              ? 'Loading...'
              : educationIndex === EDUCATION_CARDS.length - 1
                ? "That's what we do ->"
                : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
