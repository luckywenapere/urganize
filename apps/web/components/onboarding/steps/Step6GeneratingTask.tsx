'use client';

import { AiRecoveryActions } from '@urganize/ui';

type Step6GeneratingTaskProps = {
  isGenerating: boolean;
  generationError: string;
  onRetryGeneration: () => void;
  onBackToInputs: () => void;
};

export function Step6GeneratingTask({
  isGenerating,
  generationError,
  onRetryGeneration,
  onBackToInputs,
}: Step6GeneratingTaskProps) {
  return (
    <>
      <div className="mx-auto mt-[16vh] w-full max-w-[860px] rounded-3xl border border-stroke-default bg-bg-surface/95 p-8 text-center shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl">
        <p className="text-[clamp(2rem,5vw,3.6rem)] text-content-primary">
          {isGenerating ? 'Generating task...' : 'Task generation unavailable'}
        </p>
        {generationError && (
          <div className="mx-auto mt-4 max-w-xl text-left">
            <AiRecoveryActions
              message={generationError}
              helperText="Retry will send the request through the AI gateway again when the service is available."
              onRetry={onRetryGeneration}
              onBack={onBackToInputs}
            />
          </div>
        )}
      </div>
    </>
  );
}
