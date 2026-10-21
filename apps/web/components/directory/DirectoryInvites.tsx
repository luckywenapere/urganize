'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Loader2, MessageCircle, UserPlus, X } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { InfoTip } from '@/components/shared/HelpTip';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import { PERSON_DISPLAY_NAME_MAX_CHARS } from '@/lib/person-profile';
import {
  DEFAULT_INVITE_ROLE,
  DIRECTORY_INVITE_STATUS_LABEL,
  directoryInviteSummary,
  roleLabel,
  whatsappShareHref,
  type DirectoryInviteStatus,
} from '@/lib/directory-invites';

/**
 * Directory referral invites (2026-10-11, GitHub #834).
 *
 * A row at the top of the Directory: invite the people you work with, then a
 * folded list of who you asked and who joined. Draws NOTHING until the server
 * says invites are ready (the migration is applied), so the Directory looks
 * exactly as it did before that.
 *
 * The sheet portals to document.body, the WorkRequestSheet pattern.
 */

type InviteView = {
  id: string;
  name: string;
  role: string;
  channel: 'email' | 'link';
  emailed: boolean;
  status: DirectoryInviteStatus;
  createdAt: string;
};

type ListState = { ready: false } | { ready: true; invites: InviteView[]; sentToday: number; dailyLimit: number };

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

const STATUS_CLASS: Record<DirectoryInviteStatus, string> = {
  invited: 'border-stroke-default text-content-tertiary',
  opened: 'border-stroke-default text-content-secondary',
  joined: 'border-brand/40 bg-brand/10 text-content-primary',
  listed: 'border-brand/40 bg-brand/10 text-content-primary',
};

export function DirectoryInvites() {
  const [list, setList] = useState<ListState>({ ready: false });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch('/api/directory/invites', { headers, cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as ListState | null;
      if (body && body.ready === true && Array.isArray(body.invites)) setList(body);
    } catch {
      // No row is the honest answer when the list cannot be read.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!list.ready) return null;

  return (
    <section className="mb-5 rounded-xl border border-stroke-default p-4" aria-label="Invite your people">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="text-base font-semibold text-content-primary">Invite your people</h2>
          <InfoTip
            label="Invite your people"
            text="Bring your producers, engineers and directors into the Directory. They get a profile only they can see until they publish it."
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="motion-focus inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Invite
        </button>
      </div>

      {list.invites.length > 0 ? (
        <details className="group mt-3 border-t border-stroke-default pt-3">
          <summary className="motion-focus flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm text-content-secondary">
            <span>{directoryInviteSummary(list.invites.map((invite) => invite.status))}</span>
            <span className="text-xs text-content-tertiary group-open:hidden">Show</span>
            <span className="hidden text-xs text-content-tertiary group-open:inline">Hide</span>
          </summary>
          <ul className="mt-2 divide-y divide-stroke-default">
            {list.invites.map((invite) => (
              <li key={invite.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content-primary">{invite.name}</p>
                  <p className="text-xs text-content-tertiary">
                    {roleLabel(invite.role)}
                    {invite.emailed ? ' · Emailed' : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[invite.status]}`}>
                  {DIRECTORY_INVITE_STATUS_LABEL[invite.status]}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {open ? (
        <InviteSheet
          remaining={Math.max(0, list.dailyLimit - list.sentToday)}
          onClose={() => setOpen(false)}
          onCreated={() => void load()}
        />
      ) : null}
    </section>
  );
}

type Created = { name: string; url: string; shareText: string; emailed: boolean; emailProblem: string | null };

const FIELD =
  'h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none';

function InviteSheet({
  remaining,
  onClose,
  onCreated,
}: {
  remaining: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<DirectoryRole>(DEFAULT_INVITE_ROLE);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setMounted(true), []);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(mounted, panelRef, { initialFocus: 'panel', onBackClose: onClose });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = email.trim().length > 0;

  const submit = async () => {
    setError('');
    if (!name.trim()) {
      setError('Add their name.');
      return;
    }
    setBusy(true);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setError('Sign in again to invite.');
        return;
      }
      const response = await fetch('/api/directory/invites', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, email: email.trim() || null, send }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<Created> & {
        error?: string;
        invite?: { name?: string };
      };
      if (!response.ok || !body.url) {
        setError(typeof body.error === 'string' ? body.error : 'Could not make the invite.');
        return;
      }
      setCreated({
        name: body.invite?.name || name.trim(),
        url: body.url,
        shareText: body.shareText || body.url,
        emailed: Boolean(body.emailed),
        emailProblem: typeof body.emailProblem === 'string' ? body.emailProblem : null,
      });
      onCreated();
    } catch {
      setError('Could not make the invite. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Press and hold the link to copy it.');
    }
  };

  const reset = () => {
    setCreated(null);
    setName('');
    setEmail('');
    setError('');
    setCopied(false);
  };

  if (!mounted) return null;
  const first = created?.name.split(' ')[0] || 'them';

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-stroke-default bg-bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] focus:outline-none sm:rounded-2xl sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-content-primary">
            {created ? (created.emailed ? `Sent to ${first}` : `Invite for ${first} is ready`) : 'Invite someone you work with'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hit-44 relative motion-focus -mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {created ? (
          <>
            <p className="mt-1 text-sm text-content-secondary">
              {created.emailed
                ? 'You can share the link too.'
                : created.emailProblem
                  ? 'The email did not go. Share the link instead.'
                  : 'Share the link with them.'}
            </p>
            <input
              readOnly
              value={created.url}
              aria-label="Invite link"
              onFocus={(event) => event.currentTarget.select()}
              className={`${FIELD} mt-4 font-mono text-sm`}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void copy()}
                className="motion-focus inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stroke-control text-sm font-medium text-content-primary hover:border-brand"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={whatsappShareHref(created.shareText)}
                target="_blank"
                rel="noopener noreferrer"
                className="motion-focus inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stroke-control text-sm font-medium text-content-primary hover:border-brand"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
            <button
              type="button"
              onClick={reset}
              className="motion-focus mt-3 h-11 w-full rounded-lg text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              Invite someone else
            </button>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-content-tertiary">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={PERSON_DISPLAY_NAME_MAX_CHARS}
                autoComplete="off"
                className={FIELD}
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-content-tertiary">What they do</span>
              <select value={role} onChange={(event) => setRole(event.target.value as DirectoryRole)} className={FIELD}>
                {DIRECTORY_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {DIRECTORY_ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-content-tertiary">Email (optional)</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={FIELD}
              />
            </label>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-status-error">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || remaining === 0}
              className="motion-focus mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {remaining === 0 ? 'Daily limit reached' : send ? 'Send invite' : 'Get link'}
            </button>
            {remaining <= 5 && remaining > 0 ? (
              <p className="mt-2 text-center text-xs text-content-tertiary">{remaining} left today</p>
            ) : null}
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
