'use client';

import Link from 'next/link';

type MetadataPreviewCardProps = {
  releaseId: string;
  metadata: {
    producerCredits: Array<Record<string, unknown>>;
    writerCredits: Array<Record<string, unknown>>;
    featuredArtistCredits: Array<Record<string, unknown>>;
    mixingCredits?: Array<Record<string, unknown>>;
    masteringCredits?: Array<Record<string, unknown>>;
    allCredits: Array<Record<string, unknown>>;
  } | null;
};

export function MetadataPreviewCard({ releaseId, metadata }: MetadataPreviewCardProps) {
  const hasCredits = Boolean(metadata && metadata.allCredits.length > 0);
  const engineerCount = (metadata?.mixingCredits?.length || 0) + (metadata?.masteringCredits?.length || 0);
  const groups: Array<[string, number]> = [
    ['Producers', metadata?.producerCredits.length || 0],
    ['Songwriters', metadata?.writerCredits.length || 0],
    ['Engineers', engineerCount],
  ];

  if ((metadata?.featuredArtistCredits.length || 0) > 0) {
    groups.push(['Featured Artists', metadata?.featuredArtistCredits.length || 0]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-content-primary">Metadata</p>
          <p className="mt-2 text-sm text-content-secondary">Structured from submitted credits and ready for review.</p>
        </div>
        <Link
          href={`/dashboard/releases/${releaseId}/metadata`}
          className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:rounded-full sm:py-2"
        >
          View Metadata
        </Link>
      </div>
      {hasCredits ? (
        <div className="space-y-3">
          {groups.map(([label, count]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4"
            >
              <p className="text-sm font-medium text-content-primary">{label}</p>
              <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-sm font-semibold text-content-primary">
                {count}
              </span>
            </div>
          ))}
          <div className="rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Total credits</p>
            <p className="mt-2 text-2xl font-semibold text-content-primary">{metadata?.allCredits.length || 0}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-stroke-default bg-bg-elevated/70 px-5 py-8 text-sm text-content-secondary">
          <p className="font-medium text-content-primary">No credits submitted yet</p>
          <p className="mt-2">Metadata structures automatically after collaborators submit their credits.</p>
        </div>
      )}
    </div>
  );
}
