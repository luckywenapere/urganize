'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import {
  ASK_RELEASE_NOTE_MAX_CHARS,
  MAX_ASK_LINKS,
  WORK_REQUEST_NOTE_MAX_CHARS,
} from '@/lib/work-requests';
import { useDialogFocus } from '@/lib/use-dialog-focus';

/**
 * Asking somebody to work on a release.
 *
 * One ask, one note, and it is sent. Deliberately not a message composer: the
 * whole shape of this feature is an approach that can be answered in a tap,
 * and a bigger box invites a brief that belongs in email.
 *
 * PORTALS TO document.body. AppShell's `lazy-fade` transform breaks
 * `position: fixed` for every descendant, which is the trap DeleteReleaseDialog
 * and ArchiveReleaseDialog both carry the same fix for.
 */

export function WorkRequestSheet({
  person,
  defaultRole,
  releaseId,
  taskId = null,
  onClose,
  onSent,
}: {
  person: { userId: string; displayName: string };
  defaultRole: DirectoryRole | null;
  releaseId: string | null;
  /** The open activity this ask is for, carried in from the activity pop-up or
   *  the role gaps panel. The server derives the rollout from it. */
  taskId?: string | null;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<DirectoryRole>(defaultRole ?? 'graphic_designer');
  const [note, setNote] = useState('');
  // The artist's short structured ask (an artist asking a manager to take them
  // on): links to their music and a line about the next release.
  const [linksText, setLinksText] = useState('');
  const [nextRelease, setNextRelease] = useState('');
  const isManagerAsk = role === 'manager';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setMounted(true), []);

  // A real dialog for assistive tech: named, modal, with focus moved in and
  // returned. Focus lands on the sheet itself so the title is read first.
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(mounted, panelRef, { initialFocus: 'panel' });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError('Sign in again to send this.');
        return;
      }
      const response = await fetch('/api/directory/requests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientUserId: person.userId,
          role,
          note,
          releaseId,
          ...(isManagerAsk
            ? {
                kind: 'manager',
                askLinks: linksText.split(/\r?\n/).filter((line) => line.trim()),
                askReleaseNote: nextRelease,
              }
            : { taskId }),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not send that.');
        return;
      }
      onSent(`Sent to ${person.displayName}. You will get their answer by email.`);
      onClose();
    } catch {
      setError('Could not send that. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-t-2xl border border-stroke-default bg-bg-surface p-5 focus:outline-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-content-primary">
              Ask {person.displayName}
            </h2>
            <p className="mt-1 text-sm text-content-secondary">
              {isManagerAsk
                ? 'They see your name, your note and your links. Your next release line only after they say yes.'
                : 'They see your name, the job and your note. Nothing about the rollout.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-focus -mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-content-tertiary">What do you need</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as DirectoryRole)}
            className="h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none"
          >
            {DIRECTORY_ROLES.map((value) => (
              <option key={value} value={value}>
                {DIRECTORY_ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-content-tertiary">
            {isManagerAsk ? 'What you need' : 'Your note'} ({WORK_REQUEST_NOTE_MAX_CHARS - note.length} left)
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, WORK_REQUEST_NOTE_MAX_CHARS))}
            rows={4}
            placeholder="What the job is, and roughly when."
            className="w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary focus:border-brand focus:outline-none"
          />
        </label>

        {isManagerAsk ? (
          <>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-content-tertiary">
                Links to your music (one on each line, up to {MAX_ASK_LINKS})
              </span>
              <textarea
                value={linksText}
                onChange={(event) => setLinksText(event.target.value)}
                rows={3}
                inputMode="url"
                placeholder="open.spotify.com/artist/..."
                className="w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary focus:border-brand focus:outline-none"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-content-tertiary">
                Your next release, if you have one ({ASK_RELEASE_NOTE_MAX_CHARS - nextRelease.length} left)
              </span>
              <input
                value={nextRelease}
                onChange={(event) =>
                  setNextRelease(event.target.value.slice(0, ASK_RELEASE_NOTE_MAX_CHARS))
                }
                placeholder="A single, out in spring"
                className="h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none"
              />
            </label>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="motion-focus h-11 flex-1 rounded-lg border border-stroke-default text-sm text-content-primary hover:bg-bg-hover"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={busy || !note.trim()}
            onClick={() => void send()}
            className="motion-focus inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-content-inverse disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Send
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
