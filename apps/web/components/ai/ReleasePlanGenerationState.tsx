'use client';

import { AiRecoveryActions } from '@urganize/ui';

type ReleasePlanGenerationStateProps = {
  isGenerating: boolean;
  error: string;
  onRetry: () => void;
  onBackToInputs: () => void;
  onSaveDraft?: () => void;
  saveDraftBusy?: boolean;
};

export function ReleasePlanGenerationState({
  isGenerating,
  error,
  onRetry,
  onBackToInputs,
  onSaveDraft,
  saveDraftBusy = false,
}: ReleasePlanGenerationStateProps) {
  return (
    <section className="rounded-3xl border border-stroke-default bg-bg-elevated/75 p-8 text-center">
      <p className="text-[clamp(2rem,5vw,3.6rem)] text-content-primary">
        {isGenerating ? 'Generating release plan...' : 'Release plan generation unavailable'}
      </p>
      {error ? (
        <div className="mx-auto mt-4 max-w-xl text-left">
          <AiRecoveryActions
            message={error}
            helperText="Retry will send the request through the AI gateway again when the service is available."
            onRetry={onRetry}
            onBack={onBackToInputs}
            onSaveDraft={onSaveDraft}
            saveDraftBusy={saveDraftBusy}
          />
        </div>
      ) : null}
    </section>
  );
}

