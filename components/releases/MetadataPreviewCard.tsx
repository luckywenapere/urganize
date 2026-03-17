'use client';

import Link from 'next/link';

type MetadataPreviewCardProps = {
  releaseId: string;
  metadata: {
    producerCredits: Array<Record<string, unknown>>;
    writerCredits: Array<Record<string, unknown>>;
    featuredArtistCredits: Array<Record<string, unknown>>;
    allCredits: Array<Record<string, unknown>>;
  } | null;
};

export function MetadataPreviewCard({ releaseId, metadata }: MetadataPreviewCardProps) {
  const hasCredits = Boolean(metadata && metadata.allCredits.length > 0);
  const groups: Array<[string, number]> = [
    ['Producers', metadata?.producerCredits.length || 0],
    ['Writers', metadata?.writerCredits.length || 0],
    ['Featured artists', metadata?.featuredArtistCredits.length || 0],
    ['All credits', metadata?.allCredits.length || 0],
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-content-primary">Metadata preview</p>
          <p className="mt-2 text-sm text-content-secondary">
            Structured from the credit submissions already received.
          </p>
        </div>
        <Link
          href={`/dashboard/releases/${releaseId}/metadata`}
          className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
        >
          View full metadata
        </Link>
      </div>
      {hasCredits ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {groups.map(([label, count]) => (
            <div key={label} className="rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">{label}</p>
              <p className="mt-2 text-xl font-semibold text-content-primary">{count}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-dashed border-stroke-default bg-bg-elevated/70 px-5 py-8 text-sm text-content-secondary">
          <p className="font-medium text-content-primary">No credits submitted yet</p>
          <p className="mt-2">Metadata structures automatically after collaborators submit their credits.</p>
        </div>
      )}
    </div>
  );
}
