'use client';

type CollaboratorStatusCardProps = {
  collaborator: {
    id: string;
    inviteName: string;
    role: string;
    inviteContact: string;
    status: 'pending' | 'submitted';
  };
  onCopyLink: (id: string) => void;
  onRemind: (id: string) => void;
  onViewSubmission: (id: string) => void;
};

export function CollaboratorStatusCard({
  collaborator,
  onCopyLink,
  onRemind,
  onViewSubmission,
}: CollaboratorStatusCardProps) {
  return (
    <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-content-primary">{collaborator.inviteName}</p>
          <p className="mt-1 text-sm text-content-secondary">{collaborator.role}</p>
          <p className="mt-1 text-sm text-content-secondary">{collaborator.inviteContact}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
            collaborator.status === 'submitted'
              ? 'bg-brand-muted text-content-primary'
              : 'border border-stroke-default bg-bg-surface text-content-secondary'
          }`}
        >
          {collaborator.status}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCopyLink(collaborator.id)}
          className="rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
        >
          Copy Link
        </button>
        <button
          type="button"
          onClick={() => onRemind(collaborator.id)}
          className="rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
        >
          Remind
        </button>
        {collaborator.status === 'submitted' ? (
          <button
            type="button"
            onClick={() => onViewSubmission(collaborator.id)}
            className="rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
          >
            View Submission
          </button>
        ) : null}
      </div>
    </div>
  );
}
