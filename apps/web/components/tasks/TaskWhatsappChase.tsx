'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';

// Chase by number on one activity (2026-11-08, #1119; mock:
// docs/mocks/chase-by-number). A manager gives the activity to someone with
// just a name and a WhatsApp number; Urganize chases them there and they never
// sign up. Shown only to teams with WhatsApp reminders switched on.

type ChasePerson = { personId: string; name: string; phone: string; status: 'pending' | 'opted_in' | 'stopped' };
type TrailItem = { at: string; direction: 'in' | 'out'; kind: string; body: string; status: string };
type ChaseState = { available: boolean; person: ChasePerson | null; trail: TrailItem[] };

const EMPTY: ChaseState = { available: false, person: null, trail: [] };

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Session expired. Please sign in again.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export function useTaskWhatsappChase(taskId: string | null) {
  const [state, setState] = useState<ChaseState>(EMPTY);

  const reload = useCallback(async () => {
    if (!taskId) return;
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/whatsapp`, {
        headers: await authHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) return;
      const payload = (await response.json()) as ChaseState;
      setState({ available: payload.available === true, person: payload.person ?? null, trail: payload.trail ?? [] });
    } catch {
      // Quietly absent: this is an extra, never a reason the activity fails to open.
    }
  }, [taskId]);

  useEffect(() => {
    setState(EMPTY);
    void reload();
  }, [reload]);

  const give = useCallback(
    async (name: string, phone: string): Promise<{ error: string } | { warning: string | null }> => {
      if (!taskId) return { error: 'Activity not found.' };
      try {
        const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/whatsapp`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ name, phone }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string; warning?: string | null };
        if (!response.ok) return { error: payload.error || 'Could not give this task.' };
        await reload();
        return { warning: payload.warning ?? null };
      } catch (err) {
        return { error: errorMessage(err, 'Could not give this task.') };
      }
    },
    [taskId, reload]
  );

  const takeBack = useCallback(async () => {
    if (!taskId) return;
    try {
      await fetch(`/api/tasks/${encodeURIComponent(taskId)}/whatsapp`, { method: 'DELETE', headers: await authHeaders() });
    } finally {
      setState((current) => ({ ...current, person: null }));
    }
  }, [taskId]);

  return { ...state, give, takeBack, reload };
}

/** The "Someone not on Urganize" choice at the bottom of the assignee menu. */
export function ChaseByNumberForm({
  onGive,
}: {
  onGive: (name: string, phone: string) => Promise<{ error: string } | { warning: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="motion-focus flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-sm text-content-secondary transition-colors [@media(hover:hover)]:hover:bg-bg-hover [@media(hover:hover)]:hover:text-content-primary"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-stroke-default text-content-tertiary">
          +
        </span>
        <span className="min-w-0 flex-1">
          <span className="block">Someone not on Urganize</span>
          <span className="block text-xs text-content-tertiary">We chase them on WhatsApp</span>
        </span>
      </button>
    );
  }

  const fieldClass =
    'motion-focus h-9 w-full rounded-lg border border-stroke-control bg-bg-elevated px-2 text-sm text-content-primary transition-colors focus:border-brand';

  return (
    <form
      className="space-y-2 p-1"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        const result = await onGive(name, phone);
        setBusy(false);
        if ('error' in result) {
          setError(result.error);
          return;
        }
        if (result.warning) {
          setError(result.warning);
          return;
        }
        setName('');
        setPhone('');
        setOpen(false);
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-content-secondary">Their name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Kemi" className={fieldClass} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-content-secondary">Their WhatsApp number</span>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0803 123 4567"
          className={fieldClass}
        />
      </label>
      <p className="rounded-lg bg-brand/10 px-2 py-1.5 text-xs text-brand">
        We send {name.trim().split(/\s+/)[0] || 'them'} one message asking if it&apos;s OK to remind them there. Nothing else
        goes out until they say YES.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-status-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !name.trim() || !phone.trim()}
        className="motion-focus motion-press h-9 w-full rounded-lg bg-brand px-3 text-sm font-semibold text-content-inverse transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Saving…' : `Give to ${name.trim().split(/\s+/)[0] || 'them'}`}
      </button>
    </form>
  );
}

function trailLine(item: TrailItem, name: string): string {
  if (item.direction === 'in') return `${name}: ${item.body || '(a voice note or photo)'}`;
  const seen = item.status === 'read' ? ', read' : item.status === 'delivered' ? ', delivered' : item.status === 'failed' ? ', did not send' : '';
  if (item.kind === 'opt_in') return `Asked ${name} on WhatsApp if reminders are OK${seen}`;
  if (item.kind === 'reply') return `Urganize: ${item.body}`;
  return `Chased on WhatsApp${seen}`;
}

function when(at: string): string {
  const date = new Date(at);
  return date.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
}

/** A short trail of the chase, under the assignee row. */
export function TaskChaseTrail({ person, trail }: { person: ChasePerson | null; trail: TrailItem[] }) {
  if (!person && trail.length === 0) return null;
  const name = person?.name.split(/\s+/)[0] || 'They';
  const statusLine =
    person?.status === 'opted_in'
      ? `${name} said YES to reminders`
      : person?.status === 'stopped'
        ? `${name} turned reminders off`
        : person
          ? `Waiting for ${name} to say YES`
          : null;
  const recent = trail.slice(-6);
  return (
    <div className="ml-7 space-y-1.5 border-l border-stroke-subtle pl-3 text-xs text-content-secondary">
      {person ? (
        <p>
          WhatsApp <span className="text-content-tertiary">{person.phone}</span>
          {statusLine ? <span className="text-content-tertiary"> · {statusLine}</span> : null}
        </p>
      ) : null}
      {recent.map((item, index) => (
        <p key={`${item.at}-${index}`}>
          {trailLine(item, name)} <span className="text-content-tertiary">· {when(item.at)}</span>
        </p>
      ))}
    </div>
  );
}
