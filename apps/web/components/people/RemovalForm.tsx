'use client';

import { useId, useState } from 'react';
import { REMOVAL_COPY } from '@/lib/claim-copy';

// The public "Remove this profile" form on an unclaimed page. No sign-in: the
// person has no account. It answers the same whether the page exists or not,
// so it never says anything about the handle, only that the request went in.
// Styled with the page's own dark-locked palette, not the app's theme tokens.

const FAINT = 'var(--kit-text-faint)';
const MUTED = 'var(--kit-text-muted)';
const STROKE = 'var(--kit-border)';
const ACCENT = 'var(--kit-accent)';
const SURFACE = 'var(--kit-surface)';
const CREAM = 'var(--kit-text)';

export function RemovalForm({ slug }: { slug: string }) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      const response = await fetch('/api/person-removal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, contact, note }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Something went wrong. Try again.');
        setState('idle');
        return;
      }
      setState('done');
    } catch {
      setError('Could not reach us. Check your connection and try again.');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <p role="status" className="mt-10 text-sm" style={{ color: MUTED }}>
        {REMOVAL_COPY.done}
      </p>
    );
  }

  return (
    <div className="mt-12">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 text-sm underline underline-offset-4"
          style={{ color: MUTED }}
        >
          {REMOVAL_COPY.link}
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-4 rounded-xl p-4" style={{ backgroundColor: SURFACE, border: `1px solid ${STROKE}` }}>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
            {REMOVAL_COPY.heading}
          </h2>
          <p className="text-sm" style={{ color: MUTED }}>
            {REMOVAL_COPY.intro}
          </p>
          <div>
            <label htmlFor={`${fieldId}-contact`} className="block text-sm" style={{ color: CREAM }}>
              {REMOVAL_COPY.contactLabel}
            </label>
            <input
              id={`${fieldId}-contact`}
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              required
              autoComplete="email"
              className="mt-1 h-11 w-full rounded-lg bg-transparent px-3 text-[16px]"
              style={{ border: `1px solid ${FAINT}`, color: CREAM }}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-note`} className="block text-sm" style={{ color: CREAM }}>
              {REMOVAL_COPY.noteLabel}
            </label>
            <textarea
              id={`${fieldId}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-lg bg-transparent px-3 py-2 text-[16px]"
              style={{ border: `1px solid ${FAINT}`, color: CREAM }}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm" style={{ color: ACCENT }}>
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={state === 'sending' || !contact.trim()}
            className="min-h-11 rounded-full px-5 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: ACCENT, color: 'var(--kit-ground)' }}
          >
            {REMOVAL_COPY.button}
          </button>
        </form>
      )}
    </div>
  );
}
