'use client';

import { useOnboardingWizard } from './useOnboardingWizard';
import { StepOneEducation } from './steps/StepOneEducation';
import { StepTwoQuestions } from './steps/StepTwoQuestions';
import { StepThreeFirstRelease } from './steps/StepThreeFirstRelease';
import { StepFourComparison } from './steps/StepFourComparison';
import { StepFiveFinish } from './steps/StepFiveFinish';

export function FirstTimeOnboardingGate() {
  const wizard = useOnboardingWizard();
  const { onboarding } = wizard;

  if (!wizard.shouldRender || !onboarding) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9998] overflow-y-auto bg-bg-base/98 text-content-primary">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-12 h-56 w-56 rounded-full bg-brand/12 blur-[90px]" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-status-info/8 blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-brand/8 blur-[120px]" />
      </div>

      <div className="relative flex min-h-screen flex-col px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface/90 text-sm font-semibold text-content-primary">
              U
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">New Workspace</p>
              <p className="brand-mark text-lg text-content-primary">Urganize</p>
            </div>
          </div>

          {wizard.canGoBack ? (
            <button
              type="button"
              onClick={() => void wizard.handleGoBack()}
              disabled={wizard.isSaving}
              className="inline-flex min-h-11 items-center rounded-full border border-stroke-default bg-bg-surface/90 px-4 text-sm font-medium text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
            >
              Back
            </button>
          ) : (
            <span className="rounded-full border border-stroke-default bg-bg-surface/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-content-secondary">
              Step {wizard.visibleStep} of 5
            </span>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                index + 1 <= wizard.visibleStep ? 'bg-brand' : 'bg-content-quaternary'
              }`}
            />
          ))}
        </div>

        {wizard.schemaSql ? (
          <div className="mt-5 rounded-[24px] border border-status-warning/35 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
            Onboarding profile columns still need to be added before this flow can run. See
            {' '}
            <span className="font-semibold">apps/web/docs/DB_MIGRATION_ONBOARDING.md</span>.
          </div>
        ) : null}

        {wizard.error ? (
          <div className="mt-5 rounded-[24px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {wizard.error}
          </div>
        ) : null}

        {wizard.visibleStep === 1 ? (
          <StepOneEducation
            educationIndex={wizard.educationIndex}
            demoTick={wizard.demoTick}
            isSaving={wizard.isSaving}
            onAdvance={wizard.handleAdvanceFromEducation}
          />
        ) : null}

        {wizard.visibleStep === 2 ? (
          <StepTwoQuestions
            onboarding={onboarding}
            firstName={wizard.firstName}
            isSaving={wizard.isSaving}
            showClosingLine={wizard.showStepTwoClosingLine}
            onSelectPersona={wizard.handleSelectPersona}
            onSelectReleaseProcess={wizard.handleSelectReleaseProcess}
            onSelectBiggestHeadache={wizard.handleSelectBiggestHeadache}
          />
        ) : null}

        {wizard.visibleStep === 3 ? (
          <StepThreeFirstRelease
            workspaceCreationName={wizard.workspaceCreationName}
            stepThreePrompt={wizard.stepThreePrompt}
            releaseName={wizard.releaseName}
            onReleaseNameChange={wizard.setReleaseName}
            releaseDate={wizard.releaseDate}
            onReleaseDateChange={wizard.setReleaseDate}
            isSaving={wizard.isSaving}
            releaseInputRef={wizard.releaseInputRef}
            onCreate={wizard.handleCreateFirstRelease}
          />
        ) : null}

        {wizard.visibleStep === 4 ? (
          <StepFourComparison
            isSaving={wizard.isSaving}
            onContinue={wizard.handleAdvanceFromComparison}
          />
        ) : null}

        {wizard.visibleStep === 5 ? (
          <StepFiveFinish
            isSaving={wizard.isSaving}
            onFinish={wizard.handleFinishOnboarding}
          />
        ) : null}
      </div>
    </div>
  );
}
