'use client';

import { useState } from 'react';
import { Loader2 } from '@/components/icons';
import { TeamLoginsSection } from '@/components/team/TeamLoginsSection';
import type { TeamPageResponse } from '@/lib/team-page';

const box = 'rounded-2xl border border-stroke-default bg-bg-surface p-4 sm:p-5';

/**
 * The Workspace part of the Team tab (issue #853): its name, seats, invite
 * links, and leaving. Everything that was in Settings → Team lives here now.
 * Handing the workspace to someone else is its own job (#856).
 */
export function WorkspacePanel({
  data,
  onRename,
  onLeave,
}: {
  data: TeamPageResponse;
  onRename: (name: string) => Promise<string | null>;
  onLeave: () => Promise<string | null>;
}) {
  const { workspace, viewer, seatLimit, seatsUsed } = data;
  const [name, setName] = useState(workspace.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const dirty = name.trim() !== workspace.name && name.trim().length > 0;
  const percent = seatLimit ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100)) : 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    const failure = await onRename(name.trim());
    setSaving(false);
    if (failure) setError(failure);
    else setSaved(true);
  };

  const leave = async () => {
    setLeaving(true);
    setLeaveError(null);
    const failure = await onLeave();
    setLeaving(false);
    if (failure) setLeaveError(failure);
  };

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {viewer.canManage ? (
        <section className={box}>
          <h2 className="text-sm font-semibold text-content-primary">Team name</h2>
          <p className="mt-1 text-[13px] text-content-secondary">What your team sees at the top of the app and in invites.</p>
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Team name"
              value={name}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              className="motion-focus h-11 min-w-0 flex-1 rounded-xl border border-stroke-control bg-bg-base px-3 text-sm text-content-primary"
            />
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="motion-focus motion-press inline-flex h-11 items-center gap-2 rounded-xl border border-stroke-control px-4 text-sm font-semibold text-content-primary disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Save
            </button>
          </div>
          {error ? <p role="alert" className="mt-2 text-[13px] text-status-error">{error}</p> : null}
          {saved && !dirty ? <p role="status" className="mt-2 text-[13px] text-content-secondary">Saved.</p> : null}
        </section>
      ) : (
        <section className={box}>
          <h2 className="text-sm font-semibold text-content-primary">{workspace.name}</h2>
          <p className="mt-1 text-[13px] text-content-secondary">
            Owned by {workspace.ownerName}. You are {viewer.role === 'viewer' ? 'a viewer' : viewer.role === 'artist' ? 'an artist' : 'a team member'}.
          </p>
        </section>
      )}

      <section className={box}>
        <h2 className="text-sm font-semibold text-content-primary">Seats</h2>
        <p className="mt-1 text-[13px] text-content-secondary">Waiting invites take a seat too.</p>
        {seatLimit ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-hover" aria-hidden="true">
            <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
        <p className="mt-2 text-[13px] text-content-primary">
          <span className="font-mono tabular-nums">{seatLimit ? `${seatsUsed} of ${seatLimit}` : seatsUsed}</span>{' '}
          {seatLimit ? 'used' : seatsUsed === 1 ? 'person' : 'people'}
        </p>
      </section>

      {viewer.canManage ? (
        <section className={`${box} md:col-span-2 [&_section]:py-0 [&_section]:before:hidden [&_section]:after:hidden`}>
          <TeamLoginsSection />
        </section>
      ) : null}

      {!viewer.isOwner ? (
        <section className={`${box} border-status-error/20 md:col-span-2`}>
          <h2 className="text-sm font-semibold text-content-primary">Leave this team</h2>
          <p className="mt-1 text-[13px] text-content-secondary">
            You lose access to its rollouts. Your open tasks go back to {workspace.ownerName}.
          </p>
          {confirmLeave ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={leave}
                disabled={leaving}
                className="motion-focus motion-press inline-flex h-10 items-center gap-2 rounded-xl bg-status-error px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {leaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Yes, leave {workspace.name}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="motion-focus inline-flex h-10 items-center rounded-xl px-3 text-sm text-content-secondary"
              >
                Stay
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="motion-focus motion-press mt-3 inline-flex h-10 items-center rounded-xl border border-status-error/35 px-4 text-sm font-semibold text-status-error"
            >
              Leave {workspace.name}
            </button>
          )}
          {leaveError ? <p role="alert" className="mt-2 text-[13px] text-status-error">{leaveError}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
