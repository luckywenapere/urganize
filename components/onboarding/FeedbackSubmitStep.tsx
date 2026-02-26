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
    <div className="mx-auto mt-16 w-full max-w-[820px] rounded-2xl border border-white/10 bg-[#02090d] p-6 sm:p-8">
      <button
        type="button"
        onClick={onLogout}
        className="absolute right-6 top-8 text-sm text-white/70 hover:text-white"
      >
        Logout
      </button>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-white/55">Task recap</p>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-200">
              Task complete
            </span>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onSeeTaskAgain}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-40"
          >
            See the task again
          </button>
        </div>
        <p className="mt-3 text-lg font-semibold text-white">{taskTitle}</p>
        <p className="mt-1 text-sm text-white/75">{taskOutcome}</p>
      </div>

      <h1 className="mt-8 text-[clamp(2rem,4.5vw,3.2rem)] tracking-tight">Submit..</h1>
      <p className="mt-2 text-sm text-white/65">
        Share what happened so the next task quality gets sharper. Proof is optional, but detailed feedback is required.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
        <span>Draft auto-saves on this device.</span>
        <span className={hasFeedbackDraftContent && draftSavedTimeLabel ? 'text-emerald-300' : 'text-white/45'}>
          {hasFeedbackDraftContent && draftSavedTimeLabel ? `Saved at ${draftSavedTimeLabel}` : 'Start typing to save'}
        </span>
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <p className="mb-3 text-xs uppercase tracking-wide text-white/55">Proof (Optional)</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectProof('none')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'none' ? 'border-white/40 bg-white/10 text-white' : 'border-white/15 text-white/70 hover:bg-white/10'
              }`}
            >
              No proof
            </button>
            <button
              type="button"
              onClick={() => onSelectProof('screenshot')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'screenshot' ? 'border-white/40 bg-white/10 text-white' : 'border-white/15 text-white/70 hover:bg-white/10'
              }`}
            >
              Screenshot
            </button>
            <button
              type="button"
              onClick={() => onSelectProof('video')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'video' ? 'border-white/40 bg-white/10 text-white' : 'border-white/15 text-white/70 hover:bg-white/10'
              }`}
            >
              Video
            </button>
            <button
              type="button"
              onClick={() => onSelectProof('link')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'link' ? 'border-white/40 bg-white/10 text-white' : 'border-white/15 text-white/70 hover:bg-white/10'
              }`}
            >
              Link
            </button>
            <button
              type="button"
              onClick={() => onSelectProof('text')}
              className={`rounded-full border px-3 py-1 text-sm ${
                selectedProof === 'text' ? 'border-white/40 bg-white/10 text-white' : 'border-white/15 text-white/70 hover:bg-white/10'
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
            className="block w-full text-sm text-white/80"
          />
        )}
        {selectedProof === 'video' && (
          <input
            type="file"
            accept="video/*"
            onChange={(e) => onProofFileChange(e.target.files?.[0] || null)}
            className="block w-full text-sm text-white/80"
          />
        )}
        {selectedProof === 'link' && (
          <input
            type="url"
            className="w-full rounded-none border border-white/5 bg-[#02090d] px-3 py-2 text-lg text-white/90 outline-none placeholder:text-white/20"
            placeholder="https://example.com/proof"
            value={proofLink}
            onChange={(e) => onProofLinkChange(e.target.value)}
          />
        )}
        {selectedProof === 'text' && (
          <textarea
            className="min-h-[120px] w-full border border-white/5 bg-[#02090d] p-4 text-base text-white/90 outline-none placeholder:text-white/25"
            placeholder="Paste short proof notes or excerpt here."
            value={proofText}
            onChange={(e) => onProofTextChange(e.target.value)}
          />
        )}

        <div className="space-y-2">
          <label className="text-sm text-white/80">What you tried *</label>
          <textarea
            className="min-h-[120px] w-full border border-white/5 bg-[#02090d] p-4 text-base text-white/90 outline-none placeholder:text-white/25"
            placeholder="Example: I posted 3 teaser clips to TikTok and 2 to Reels using the same hook."
            value={whatYouTried}
            onChange={(e) => onWhatYouTriedChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-white/80">What happened *</label>
          <textarea
            className="min-h-[120px] w-full border border-white/5 bg-[#02090d] p-4 text-base text-white/90 outline-none placeholder:text-white/25"
            placeholder="Describe audience response and what worked or did not work."
            value={whatHappened}
            onChange={(e) => onWhatHappenedChange(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm text-white/80">Results / metrics *</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onResultsModeChange('tracked')}
              className={`rounded-full border px-3 py-1 text-sm ${
                resultsMode === 'tracked' ? 'border-white/40 bg-white/10 text-white' : 'border-white/15 text-white/70 hover:bg-white/10'
              }`}
            >
              I tracked results
            </button>
            <button
              type="button"
              onClick={() => onResultsModeChange('not-tracked')}
              className={`rounded-full border px-3 py-1 text-sm ${
                resultsMode === 'not-tracked' ? 'border-white/40 bg-white/10 text-white' : 'border-white/15 text-white/70 hover:bg-white/10'
              }`}
            >
              Not tracked
            </button>
          </div>
          {resultsMode === 'tracked' && (
            <textarea
              className="min-h-[110px] w-full border border-white/5 bg-[#02090d] p-4 text-base text-white/90 outline-none placeholder:text-white/25"
              placeholder="Example: 12,420 views, 410 saves, CTR 3.4%, 98 pre-saves."
              value={resultsMetrics}
              onChange={(e) => onResultsMetricsChange(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm text-white/80">What blocked you / improve next *</label>
          <textarea
            className="min-h-[120px] w-full border border-white/5 bg-[#02090d] p-4 text-base text-white/90 outline-none placeholder:text-white/25"
            placeholder="Example: Posting late reduced reach. Next time I will schedule uploads before peak hours."
            value={blockersNext}
            onChange={(e) => onBlockersNextChange(e.target.value)}
          />
        </div>
      </div>

      {!canSubmitFeedback && (
        <p className="mt-4 text-xs text-white/60">
          Tap Submit.. and we will show exactly what is missing.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isBusy}
          onClick={onSubmit}
          className="rounded-xl border border-emerald-400/35 bg-emerald-500/20 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-500/30 disabled:opacity-40"
        >
          Submit..
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onGoToDashboard}
          className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-40"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
