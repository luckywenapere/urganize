'use client';

import type { RefObject } from 'react';

export function StepThreeFirstRelease({
  workspaceCreationName,
  stepThreePrompt,
  releaseName,
  onReleaseNameChange,
  releaseDate,
  onReleaseDateChange,
  isSaving,
  releaseInputRef,
  onCreate,
}: {
  workspaceCreationName: string;
  stepThreePrompt: string;
  releaseName: string;
  onReleaseNameChange: (value: string) => void;
  releaseDate: string;
  onReleaseDateChange: (value: string) => void;
  isSaving: boolean;
  releaseInputRef: RefObject<HTMLInputElement | null>;
  onCreate: () => Promise<void>;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-1 py-8">
      {workspaceCreationName ? (
        <div className="w-full max-w-2xl rounded-[32px] border border-stroke-default bg-bg-surface/95 p-6 text-center shadow-[0_28px_90px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-8">
          <p className="saas-eyebrow">Step 3 of 5</p>
          <h2 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-content-primary">
            Your workspace is taking shape.
          </h2>
          <div className="mt-8 flex justify-center">
            <div className="grid grid-cols-2 gap-2">
              {['delay-1', 'delay-2', 'delay-3', 'delay-4'].map((delayClass, index) => (
                <span
                  key={index}
                  className={`animate-scale-in block h-12 w-12 rounded-[16px] border border-brand/25 bg-brand/12 ${delayClass}`}
                />
              ))}
            </div>
          </div>
          <div className="animate-in delay-4 mt-8 rounded-[24px] border border-brand/25 bg-brand-muted px-4 py-4 text-left">
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Workspace name</p>
            <p className="mt-2 text-lg font-semibold text-content-primary">{workspaceCreationName}</p>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-2xl text-center">
          <p className="saas-eyebrow">Step 3 of 5</p>
          <h1 className="mt-4 text-[clamp(2.4rem,6vw,4.8rem)] tracking-tight text-content-primary">
            {stepThreePrompt}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">
            This becomes your first workspace.
          </p>

          <div className="mt-8 rounded-[32px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_28px_90px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
            <label className="block text-left">
              <span className="field-label">Release name</span>
              <input
                ref={releaseInputRef}
                value={releaseName}
                onChange={(event) => onReleaseNameChange(event.target.value)}
                placeholder="Release name"
                className="input h-14 rounded-[22px] text-lg font-semibold"
              />
            </label>

            <label className="mt-6 block text-left">
              <span className="field-label">When do you want this out?</span>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => onReleaseDateChange(e.target.value)}
                className="input h-14 rounded-[22px] text-lg font-semibold"
              />
              <p className="mt-2 text-xs text-content-tertiary">
                Even a rough date helps us plan your rollout.
              </p>
            </label>

            <p className="mt-4 text-left text-sm text-content-secondary">
              This becomes your first workspace.
            </p>

            <button
              type="button"
              onClick={() => void onCreate()}
              disabled={isSaving}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
            >
              {isSaving ? 'Creating your workspace...' : 'Create My Workspace ->'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
