'use client';

type SubmissionSuccessStateProps = {
  releaseTitle: string;
};

export function SubmissionSuccessState({ releaseTitle }: SubmissionSuccessStateProps) {
  return (
    <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.35)]">
      <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Credits submitted successfully</p>
      <h2 className="mt-2 text-3xl tracking-tight text-content-primary">Thanks. Your details are in.</h2>
      <p className="mt-3 text-sm text-content-secondary">
        The release team can now use your information to finalize the metadata for {releaseTitle}.
      </p>
    </div>
  );
}
