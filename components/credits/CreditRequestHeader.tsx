'use client';

type CreditRequestHeaderProps = {
  inviteName?: string;
  submissionMode?: 'invite' | 'public';
};

export function CreditRequestHeader({
  inviteName = '',
  submissionMode = 'invite',
}: CreditRequestHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border border-stroke-default bg-bg-elevated px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-content-tertiary">
        No login required
      </div>
      <div>
        <h1 className="text-[clamp(2.2rem,6vw,3.4rem)] tracking-tight text-content-primary">Submit your credits</h1>
        <p className="mt-3 max-w-[36rem] text-sm leading-6 text-content-secondary">
          {submissionMode === 'public'
            ? 'Submit your credits for this release'
            : 'You&apos;ve been added as a collaborator on this release'}
        </p>
        {inviteName ? <p className="mt-2 text-sm text-content-tertiary">Requested from: {inviteName}</p> : null}
      </div>
    </div>
  );
}
