'use client';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { CollaboratorStatusCard } from './CollaboratorStatusCard';

type CollaboratorStatusTableProps = {
  collaborators: Array<{
    id: string;
    inviteName: string;
    role: string;
    inviteContact: string;
    status: 'pending' | 'submitted';
    submittedAt?: string | null;
  }>;
  onCopyLink: (id: string) => void;
  onRemind: (id: string) => void;
  onViewSubmission: (id: string) => void;
};

const formatSubmittedAt = (value?: string | null) => {
  if (!value) return 'Waiting on credits';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Credits received';
  return `Credits received ${date.toLocaleDateString()}`;
};

export function CollaboratorStatusTable({
  collaborators,
  onCopyLink,
  onRemind,
  onViewSubmission,
}: CollaboratorStatusTableProps) {
  return (
    <>
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-[24px] border border-stroke-default bg-bg-surface/95">
          <table className="min-w-full divide-y divide-stroke-default text-sm">
            <thead className="bg-bg-elevated/80 text-left text-content-tertiary">
              <tr>
                <th className="px-5 py-3 font-medium">Credit</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-default">
              {collaborators.map((collaborator) => (
                <tr key={collaborator.id} className="transition hover:bg-bg-hover/45">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-content-primary">{collaborator.inviteName}</p>
                  </td>
                  <td className="px-5 py-4 text-content-secondary">{collaborator.role}</td>
                  <td className="px-5 py-4">
                    <p className="break-all text-content-secondary">{collaborator.inviteContact}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-2">
                      <StatusBadge
                        label={collaborator.status === 'submitted' ? 'Credits received' : 'Waiting on credits'}
                        tone={collaborator.status === 'submitted' ? 'success' : 'warning'}
                        size="sm"
                      />
                      <p className="text-xs text-content-tertiary">{formatSubmittedAt(collaborator.submittedAt)}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onCopyLink(collaborator.id)}
                        className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
                      >
                        Copy Credit Link
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemind(collaborator.id)}
                        className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
                      >
                        Remind
                      </button>
                      {collaborator.status === 'submitted' ? (
                        <button
                          type="button"
                          onClick={() => onViewSubmission(collaborator.id)}
                          className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
                        >
                          View Credit
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {collaborators.map((collaborator) => (
          <CollaboratorStatusCard
            key={collaborator.id}
            collaborator={collaborator}
            onCopyLink={onCopyLink}
            onRemind={onRemind}
            onViewSubmission={onViewSubmission}
          />
        ))}
      </div>
    </>
  );
}
