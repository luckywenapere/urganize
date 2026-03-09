'use client';

type ProofType = 'none' | 'screenshot' | 'video' | 'link' | 'text';

type FeedbackSubmitStepProps = {
  isBusy: boolean;
  canSubmitFeedback: boolean;
  hasFeedbackDraftContent: boolean;
  draftSavedTimeLabel: string;
  selectedProof: ProofType;
  proofLink: string;
  proofText: string;
  whatYouTried: string;
  whatHappened: string;
  resultsMode: 'tracked' | 'not-tracked';
  resultsMetrics: string;
  blockersNext: string;
  taskTitle: string;
  taskOutcome: string;
  onLogout: () => Promise<void>;
  onSeeTaskAgain: () => Promise<void>;
  onSelectProof: (proofType: ProofType) => void;
  onProofFileChange: (file: File | null) => void;
  onProofLinkChange: (value: string) => void;
  onProofTextChange: (value: string) => void;
  onWhatYouTriedChange: (value: string) => void;
  onWhatHappenedChange: (value: string) => void;
  onResultsModeChange: (mode: 'tracked' | 'not-tracked') => void;
  onResultsMetricsChange: (value: string) => void;
  onBlockersNextChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  onGoToDashboard: () => void;
};

export function FeedbackSubmitStep({
  isBusy,
  canSubmitFeedback,
  hasFeedbackDraftContent,
  draftSavedTimeLabel,
  selectedProof,
  proofLink,
  proofText,
  whatYouTried,
  whatHappened,
  resultsMode,
  resultsMetrics,
  blockersNext,
  taskTitle,
  taskOutcome,
  onLogout,
  onSeeTaskAgain,
  onSelectProof,
  onProofFileChange,
  onProofLinkChange,
  onProofTextChange,
  onWhatYouTriedChange,
  onWhatHappenedChange,
  onResultsModeChange,
  onResultsMetricsChange,
  onBlockersNextChange,
  onSubmit,
  onGoToDashboard,
}: FeedbackSubmitStepProps) {
  return (
    <div className="mx-auto mt-16 w-full max-w-[820px] rounded-2xl border border-stroke-default bg-bg-surface p-6 sm:p-8">
      <div className="rounded-2xl border border-stroke-default bg-bg-elevated p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Task recap</p>
            <span className="rounded-full border border-brand/35 bg-brand-muted px-2 py-1 text-[11px] font-medium text-brand">
              Task complete
            </span>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onSeeTaskAgain}
            className="rounded-lg border border-stroke-default bg-bg-overlay px-3 py-1.5 text-xs font-medium text-content-primary transition hover:bg-bg-hover disabled:opacity-40"
          >
            See the task again
          </button>
        </div>
        <p className="mt-3 text-lg font-semibold text-content-primary">{taskTitle}</p>
        <p className="mt-1 text-sm text-content-secondary">{taskOutcome}</p>
      </div>

      <h1 className="mt-8 text-[clamp(2rem,4.5vw,3.2rem)] tracking-tight">Submit..</h1>
      <p className="mt-2 text-sm text-content-secondary">
        Share what happened so the next task quality gets sharper. Proof is optional, but detailed feedback is required.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stroke-default bg-bg-elevated px-3 py-2 text-xs text-content-secondary">
        <span>Draft auto-saves on this device.</span>
        <span className={hasFeedbackDraftContent && draftSavedTimeLabel ? 'text-brand' : 'text-content-tertiary'}>
          {hasFeedbackDraftContent && draftSavedTimeLabel ? `Saved at ${draftSavedTimeLabel}` : 'Start typing to save'}
        </span>
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <p className="mb-3 text-xs uppercase tracking-wide text-content-tertiary">Proof (Optional)</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectProof('none')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'none'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              No proof
            </button>
            <button
              type="button"
              onClick={() => onSelectProof('screenshot')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'screenshot'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              Screenshot
            </button>
            <button
              type="button"
              onClick={() => onSelectProof('video')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'video'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              Video
            </button>
            <button
              type="button"
              onClick={() => onSelectProof('link')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'link'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              Link
            </button>
            <button
              type="button"
              onClick={() => onSelectProof('text')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'text'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              Notes
            </button>
          </div>
        </div>

        {selectedProof === 'screenshot' && (
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onProofFileChange(e.target.files?.[0] || null)}
            className="block w-full text-sm text-content-secondary"
          />
        )}
        {selectedProof === 'video' && (
          <input
            type="file"
            accept="video/*"
            onChange={(e) => onProofFileChange(e.target.files?.[0] || null)}
            className="block w-full text-sm text-content-secondary"
          />
        )}
        {selectedProof === 'link' && (
          <input
            type="url"
            className="w-full rounded-lg border border-stroke-subtle bg-bg-overlay px-3 py-2 text-lg text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
            placeholder="https://example.com/proof"
            value={proofLink}
            onChange={(e) => onProofLinkChange(e.target.value)}
          />
        )}
        {selectedProof === 'text' && (
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-stroke-subtle bg-bg-overlay p-4 text-base text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
            placeholder="Paste short proof notes or excerpt here."
            value={proofText}
            onChange={(e) => onProofTextChange(e.target.value)}
          />
        )}

        <div className="space-y-2">
          <label className="text-sm text-content-secondary">What you tried *</label>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-stroke-subtle bg-bg-overlay p-4 text-base text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
            placeholder="Example: I posted 3 teaser clips to TikTok and 2 to Reels using the same hook."
            value={whatYouTried}
            onChange={(e) => onWhatYouTriedChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-content-secondary">What happened *</label>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-stroke-subtle bg-bg-overlay p-4 text-base text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
            placeholder="Describe audience response and what worked or did not work."
            value={whatHappened}
            onChange={(e) => onWhatHappenedChange(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm text-content-secondary">Results / metrics *</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onResultsModeChange('tracked')}
              className={`rounded-full border px-3 py-1 text-sm ${
                resultsMode === 'tracked'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              I tracked results
            </button>
            <button
              type="button"
              onClick={() => onResultsModeChange('not-tracked')}
              className={`rounded-full border px-3 py-1 text-sm ${
                resultsMode === 'not-tracked'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              Not tracked
            </button>
          </div>
          {resultsMode === 'tracked' && (
            <textarea
              className="min-h-[110px] w-full rounded-lg border border-stroke-subtle bg-bg-overlay p-4 text-base text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
              placeholder="Example: 12,420 views, 410 saves, CTR 3.4%, 98 pre-saves."
              value={resultsMetrics}
              onChange={(e) => onResultsMetricsChange(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm text-content-secondary">What blocked you / improve next *</label>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-stroke-subtle bg-bg-overlay p-4 text-base text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
            placeholder="Example: Posting late reduced reach. Next time I will schedule uploads before peak hours."
            value={blockersNext}
            onChange={(e) => onBlockersNextChange(e.target.value)}
          />
        </div>
      </div>

      {!canSubmitFeedback && (
        <p className="mt-4 text-xs text-content-secondary">
          Tap Submit review & generate next step and we will show exactly what is missing.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isBusy}
          onClick={onSubmit}
          className="rounded-xl border border-brand/35 bg-brand-muted px-6 py-3 text-base font-semibold text-content-primary transition hover:bg-brand/20 disabled:opacity-40"
        >
          Submit review & generate next step
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onGoToDashboard}
          className="rounded-xl border border-stroke-default bg-bg-overlay px-5 py-3 text-sm font-medium text-content-primary transition hover:bg-bg-hover disabled:opacity-40"
        >
          Go to Dashboard
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onLogout}
          className="text-sm text-content-secondary transition hover:text-content-primary disabled:opacity-40"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
