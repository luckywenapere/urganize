'use client';

import { StatusBadge } from '@/components/shared/StatusBadge';

type CollaboratorStatusCardProps = {
  collaborator: {
    id: string;
    inviteName: string;
    role: string;
    inviteContact: string;
    status: 'pending' | 'submitted';
    submittedAt?: string | null;
  };
  onCopyLink: (id: string) => void;
  onRemind: (id: string) => void;
  onViewSubmission: (id: string) => void;
};

const formatSubmittedAt = (value?: string | null) => {
  if (!value) return 'Awaiting response';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Submitted';
  return `Submitted ${date.toLocaleDateString()}`;
};

export function CollaboratorStatusCard({
  collaborator,
  onCopyLink,
  onRemind,
  onViewSubmission,
}: CollaboratorStatusCardProps) {
  return (
    <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/70 p-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.3)]">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-content-primary">{collaborator.inviteName}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.12em] text-content-tertiary">Collaborator</p>
          </div>
          <StatusBadge
            label={collaborator.status === 'submitted' ? 'Submitted' : 'Pending'}
            tone={collaborator.status === 'submitted' ? 'success' : 'warning'}
            size="sm"
          />
        </div>

        <div className="grid gap-3">
          <div className="rounded-[18px] border border-stroke-default bg-bg-surface/90 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-content-tertiary">Role</p>
            <p className="mt-1.5 text-sm leading-6 text-content-secondary">{collaborator.role}</p>
          </div>

          <div className="rounded-[18px] border border-stroke-default bg-bg-surface/90 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-content-tertiary">Contact</p>
            <p className="mt-1.5 break-all text-sm leading-6 text-content-secondary">{collaborator.inviteContact}</p>
          </div>
        </div>

        <div className="rounded-[18px] border border-stroke-subtle bg-bg-surface/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-content-tertiary">Submission</p>
          <p className="mt-1.5 text-sm text-content-secondary">{formatSubmittedAt(collaborator.submittedAt)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5">
        <button
          type="button"
          onClick={() => onCopyLink(collaborator.id)}
          className="min-h-11 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm font-semibold text-content-primary hover:bg-bg-hover"
        >
          Copy Link
        </button>
        <button
          type="button"
          onClick={() => onRemind(collaborator.id)}
          className="min-h-11 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm font-semibold text-content-primary hover:bg-bg-hover"
        >
          Remind
        </button>
        {collaborator.status === 'submitted' ? (
          <button
            type="button"
            onClick={() => onViewSubmission(collaborator.id)}
            className="min-h-11 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm font-semibold text-content-primary hover:bg-bg-hover"
          >
            View
          </button>
        ) : null}
      </div>
    </div>
  );
}
