'use client';

// "Suggest a channel": a team member sends a promo channel for the directory.
// It goes to admin review (/admin/promo-channels) and is listed only once an
// admin approves it, so the form says so and promises nothing else.

import { useState, type FormEvent } from 'react';
import {
  PROMO_CHANNEL_KINDS,
  PROMO_CHANNEL_KIND_LABELS,
  PROMO_COUNTRIES,
  PROMO_SUGGESTION_LIMITS,
  type PromoChannelKind,
} from '@/lib/promo-channels';

const fieldClass =
  'h-11 w-full rounded-xl border border-stroke-control bg-bg-base px-3 text-base text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';

export function SuggestPromoChannelForm({
  authHeaders,
  onDone,
}: {
  authHeaders: () => Promise<Record<string, string> | null>;
  /** Closed the form; `sent` is true when the suggestion was accepted. */
  onDone: (sent: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PromoChannelKind>('radio');
  const [country, setCountry] = useState('NG');
  const [url, setUrl] = useState('');
  const [howToSubmit, setHowToSubmit] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSending) return;
    setError('');
    setIsSending(true);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setError('Your session expired. Sign in again.');
        return;
      }
      const response = await fetch('/api/promo-channels/suggestions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, kind, country: country || null, url, howToSubmit }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || 'Could not send it. Try again.');
        return;
      }
      onDone(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="animate-enter space-y-3 rounded-2xl border border-stroke-default bg-bg-surface p-4">
      <div>
        <p className="font-display text-lg font-semibold text-content-primary">Suggest a channel</p>
        <p className="text-sm text-content-secondary">We check it before it is listed.</p>
      </div>
      <input
        aria-label="Name"
        className={fieldClass}
        value={name}
        maxLength={PROMO_SUGGESTION_LIMITS.name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <select aria-label="Type" className={fieldClass} value={kind} onChange={(event) => setKind(event.target.value as PromoChannelKind)}>
          {PROMO_CHANNEL_KINDS.map((value) => (
            <option key={value} value={value}>
              {PROMO_CHANNEL_KIND_LABELS[value]}
            </option>
          ))}
        </select>
        <select aria-label="Country" className={fieldClass} value={country} onChange={(event) => setCountry(event.target.value)}>
          {PROMO_COUNTRIES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.label}
            </option>
          ))}
          <option value="">Online / anywhere</option>
        </select>
      </div>
      <input
        aria-label="Link"
        type="url"
        inputMode="url"
        className={fieldClass}
        value={url}
        maxLength={PROMO_SUGGESTION_LIMITS.link}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://"
        required
      />
      <textarea
        aria-label="How to submit"
        rows={2}
        className="w-full resize-none rounded-xl border border-stroke-control bg-bg-base p-3 text-base text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
        value={howToSubmit}
        maxLength={PROMO_SUGGESTION_LIMITS.howToSubmit}
        onChange={(event) => setHowToSubmit(event.target.value)}
        placeholder="How to submit (optional)"
      />
      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSending}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          onClick={() => onDone(false)}
          className="inline-flex h-11 items-center rounded-xl border border-stroke-control px-4 text-sm text-content-secondary hover:text-content-primary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
