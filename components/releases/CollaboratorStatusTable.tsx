'use client';

import { CollaboratorStatusCard } from './CollaboratorStatusCard';

type CollaboratorStatusTableProps = {
  collaborators: Array<{
    id: string;
    inviteName: string;
    role: string;
    inviteContact: string;
    status: 'pending' | 'submitted';
  }>;
  onCopyLink: (id: string) => void;
  onRemind: (id: string) => void;
  onViewSubmission: (id: string) => void;
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
                <th className="px-4 py-3 font-medium">Collaborator</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-default">
              {collaborators.map((collaborator) => (
                <tr key={collaborator.id}>
                  <td className="px-4 py-3 font-medium text-content-primary">{collaborator.inviteName}</td>
                  <td className="px-4 py-3 text-content-secondary">{collaborator.role}</td>
                  <td className="px-4 py-3 text-content-secondary">{collaborator.inviteContact}</td>
                  <td className="px-4 py-3 text-content-secondary">{collaborator.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onCopyLink(collaborator.id)}
                        className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-xs font-semibold text-content-primary hover:bg-bg-hover"
                      >
                        Copy Link
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
                          View Submission
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
