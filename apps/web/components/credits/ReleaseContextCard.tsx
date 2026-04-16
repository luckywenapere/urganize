'use client';

type ReleaseContextCardProps = {
  releaseTitle: string;
  artistName: string;
  requestedRole?: string;
};

export function ReleaseContextCard({
  releaseTitle,
  artistName,
  requestedRole = '',
}: ReleaseContextCardProps) {
  const releaseSummary = [releaseTitle, artistName].filter(Boolean).join(' • ');

  return (
    <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/75 p-5 shadow-[0_18px_44px_-32px_rgba(0,0,0,0.28)]">
      <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Release</p>
      <p className="mt-3 text-xl font-semibold tracking-tight text-content-primary sm:text-2xl">
        {releaseSummary || 'Release details'}
      </p>
      {requestedRole ? (
        <div className="mt-4 inline-flex rounded-full border border-stroke-default bg-bg-surface px-3 py-1.5 text-sm text-content-secondary">
          Requested role: <span className="ml-1 font-semibold text-content-primary">{requestedRole}</span>
        </div>
      ) : null}
    </div>
  );
}
