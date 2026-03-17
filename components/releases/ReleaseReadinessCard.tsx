'use client';

import { ProgressBar } from '@/components/shared/ProgressBar';

type ReleaseReadinessCardProps = {
  readiness: {
    completionPercent: number;
    creditsCollected: boolean;
    metadataComplete: boolean;
    readyForDistribution: boolean;
    nextStep: string;
  };
};

export function ReleaseReadinessCard({ readiness }: ReleaseReadinessCardProps) {
  const checklist: Array<[string, boolean]> = [
    ['Credits collected', readiness.creditsCollected],
    ['Metadata complete', readiness.metadataComplete],
    ['Ready for distribution', readiness.readyForDistribution],
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-content-primary">Release readiness</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-content-primary">
            {readiness.completionPercent}% complete
          </p>
        </div>
        <p className="max-w-sm text-right text-sm text-content-secondary">{readiness.nextStep}</p>
      </div>
      <div className="mt-4">
        <ProgressBar value={readiness.completionPercent} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {checklist.map(([label, complete]) => (
          <div key={label} className="rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">{label}</p>
            <p className="mt-2 text-sm font-semibold text-content-primary">{complete ? 'Done' : 'Not yet'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
