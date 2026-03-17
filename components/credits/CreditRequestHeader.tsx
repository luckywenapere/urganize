'use client';

type CreditRequestHeaderProps = {
  releaseTitle: string;
  artistName: string;
  requestedRole: string;
};

export function CreditRequestHeader({ releaseTitle, artistName, requestedRole }: CreditRequestHeaderProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Credit Submission</p>
      <h1 className="text-[clamp(2rem,5vw,3.1rem)] tracking-tight text-content-primary">
        Help complete the credits for this song
      </h1>
      <p className="text-sm text-content-secondary">
        Please fill in your details accurately so the release team can finalize metadata and credits.
      </p>
      <div className="rounded-[24px] border border-stroke-subtle bg-bg-elevated/70 p-4 text-sm text-content-secondary">
        <p className="font-semibold text-content-primary">{releaseTitle}</p>
        <p className="mt-1">{artistName}</p>
        <p className="mt-1">Requested role: {requestedRole}</p>
      </div>
    </div>
  );
}
