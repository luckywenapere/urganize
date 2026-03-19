'use client';

import { useEffect, useState } from 'react';

type CollaboratorDraft = {
  inviteName: string;
  inviteContact: string;
  role: string;
};

type AddCollaboratorModalProps = {
  open: boolean;
  isSubmitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (items: CollaboratorDraft[]) => void;
};

const emptyCollaborator = (): CollaboratorDraft => ({
  inviteName: '',
  inviteContact: '',
  role: '',
});

export function AddCollaboratorModal({ open, isSubmitting, error, onClose, onSubmit }: AddCollaboratorModalProps) {
  const [items, setItems] = useState<CollaboratorDraft[]>([emptyCollaborator()]);

  useEffect(() => {
    if (open) setItems([emptyCollaborator()]);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-stroke-default bg-bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Add Collaborators</p>
            <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Invite collaborators to submit credits</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
          >
            Close
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4 sm:grid-cols-3">
              <input
                value={item.inviteName}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, inviteName: event.target.value } : entry))
                  )
                }
                placeholder="Collaborator name"
                className="rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
              />
              <input
                value={item.inviteContact}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, inviteContact: event.target.value } : entry))
                  )
                }
                placeholder="Email or phone"
                className="rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
              />
              <input
                value={item.role}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, role: event.target.value } : entry))
                  )
                }
                placeholder="Role"
                className="rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setItems((current) => [...current, emptyCollaborator()])}
            className="rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
          >
            Add another
          </button>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stroke-default bg-bg-elevated px-4 py-3 text-sm text-content-primary hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(items)}
            disabled={isSubmitting}
            className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
          >
            {isSubmitting ? 'Adding...' : 'Add collaborators'}
          </button>
        </div>
      </div>
    </div>
  );
}
