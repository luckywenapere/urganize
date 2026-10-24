'use client';

// /curator/apply (2026-10-24, founder approved mocks v2-apply and v2-sent).
//
// One form in two grouped cards, "Your playlist" and "How we reach you", then
// the sent screen with a summary card and an "In review" pill. Posts to
// POST /api/curator/apply, which checks every field again and runs the spam
// guard (hidden "website" field, fill time, per-network and per-contact
// limits).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Logo } from '@urganize/ui';
import { Check, Clock, Globe, LinkIcon, ListMusic, MessageSquare, Music, Users } from '@/components/icons';
import {
  CURATOR_APPLICATION_GENRES,
  CURATOR_APPLICATION_GENRE_LABELS,
  HONEYPOT_FIELD,
  applicationSummaryLine,
  parseCuratorApplication,
  type CuratorApplicationField,
  type CuratorApplicationGenre,
  type CuratorApplicationReceipt,
} from '@/lib/curator-applications';

const REQUIREMENTS: Array<{ label: string; icon: typeof Users }> = [
  { label: 'Public playlist', icon: ListMusic },
  { label: 'Real listeners', icon: Users },
  { label: 'Clear genre', icon: Music },
];

const fieldInputClass =
  'mt-1.5 w-full border border-transparent bg-transparent p-0 text-lg text-content-primary outline-none placeholder:text-content-tertiary';

export function CuratorApplyPageClient() {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [followers, setFollowers] = useState('');
  const [genre, setGenre] = useState<CuratorApplicationGenre | ''>('');
  const [country, setCountry] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [trap, setTrap] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ field: CuratorApplicationField | null; message: string } | null>(null);
  const [sent, setSent] = useState<CuratorApplicationReceipt | null>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const submit = async () => {
    if (sending) return;
    const body = {
      playlistUrl,
      followers,
      genre,
      country,
      contact,
      note,
      [HONEYPOT_FIELD]: trap,
      startedAt: startedAt.current,
    };
    const parsed = parseCuratorApplication(body);
    if (!parsed.ok) {
      setError({ field: parsed.field, message: parsed.error });
      return;
    }
    setError(null);
    setSending(true);
    try {
      const response = await fetch('/api/curator/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        application?: CuratorApplicationReceipt;
        error?: string;
        field?: CuratorApplicationField;
      };
      if (!response.ok || !payload.application) {
        setError({ field: payload.field ?? null, message: payload.error || 'We could not send that. Please try again.' });
        return;
      }
      setSent(payload.application);
      window.scrollTo({ top: 0 });
    } catch {
      setError({ field: null, message: 'We could not send that. Check your connection and try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen text-content-primary">
      <header className="px-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] sm:px-8 sm:pt-8">
        <Logo size="md" priority />
      </header>

      <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-12 sm:pt-16">
        {sent ? <SentState receipt={sent} /> : (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="text-center">
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Curate for Urganize</h1>
              <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-content-secondary">
                Put new music from real artists on your playlist. We read every application and reply within a week.
              </p>
              <ul className="mt-5 flex flex-wrap justify-center gap-2">
                {REQUIREMENTS.map(({ label, icon: Icon }) => (
                  <li
                    key={label}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-stroke-default px-3.5 text-sm text-content-secondary"
                  >
                    <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <Group label="Your playlist" className="mt-10">
              <Field
                id="apply-playlist"
                icon={LinkIcon}
                label="Playlist link"
                helper="Spotify, Apple Music, Audiomack or Boomplay"
                error={error?.field === 'playlistUrl' ? error.message : null}
              >
                <input
                  id="apply-playlist"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="open.spotify.com/playlist/..."
                  value={playlistUrl}
                  onChange={(event) => setPlaylistUrl(event.target.value)}
                  aria-invalid={error?.field === 'playlistUrl' || undefined}
                  className={fieldInputClass}
                />
              </Field>
              <Field
                id="apply-followers"
                icon={Users}
                label="Followers"
                error={error?.field === 'followers' ? error.message : null}
              >
                <input
                  id="apply-followers"
                  type="text"
                  inputMode="numeric"
                  placeholder="2,500"
                  value={followers}
                  onChange={(event) => setFollowers(event.target.value.replace(/[^\d,\s]/g, ''))}
                  aria-invalid={error?.field === 'followers' || undefined}
                  className={fieldInputClass}
                />
              </Field>
              <Field
                id="apply-genre"
                icon={Music}
                label="Main genre"
                error={error?.field === 'genre' ? error.message : null}
                asGroup
              >
                <div role="radiogroup" aria-labelledby="apply-genre-label" className="mt-2.5 flex flex-wrap gap-2">
                  {CURATOR_APPLICATION_GENRES.map((value) => {
                    const on = genre === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setGenre(value)}
                        className={`motion-focus h-9 rounded-full border px-3.5 text-sm transition-colors ${
                          on
                            ? 'border-brand/60 bg-brand/10 text-brand'
                            : 'border-stroke-default text-content-secondary hover:text-content-primary'
                        }`}
                      >
                        {CURATOR_APPLICATION_GENRE_LABELS[value]}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </Group>

            <Group label="How we reach you" className="mt-8">
              <Field id="apply-country" icon={Globe} label="Country" error={error?.field === 'country' ? error.message : null}>
                <input
                  id="apply-country"
                  type="text"
                  autoComplete="country-name"
                  placeholder="Nigeria"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  aria-invalid={error?.field === 'country' || undefined}
                  className={fieldInputClass}
                />
              </Field>
              <Field
                id="apply-contact"
                icon={MessageSquare}
                label="Email or WhatsApp"
                helper="We only use this to reply to you"
                error={error?.field === 'contact' ? error.message : null}
              >
                <input
                  id="apply-contact"
                  type="text"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@email.com"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  aria-invalid={error?.field === 'contact' || undefined}
                  className={fieldInputClass}
                />
              </Field>
              <Field
                id="apply-note"
                icon={MessageSquare}
                label="Anything else (optional)"
                error={error?.field === 'note' ? error.message : null}
              >
                <textarea
                  id="apply-note"
                  rows={2}
                  maxLength={500}
                  placeholder="Who listens, how often you update..."
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className={`${fieldInputClass} resize-none`}
                />
              </Field>
            </Group>

            {/* Spam trap: hidden from people and from screen readers. A bot fills it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="apply-website">Website</label>
              <input
                id="apply-website"
                name={HONEYPOT_FIELD}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={trap}
                onChange={(event) => setTrap(event.target.value)}
                className="border border-transparent"
              />
            </div>

            {error && !error.field ? (
              <p role="alert" className="mt-6 text-center text-sm text-status-error">
                {error.message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={sending}
              className="motion-focus mt-8 h-14 w-full rounded-2xl bg-brand text-base font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {sending ? 'Sending…' : 'Send application'}
            </button>

            <p className="mt-6 text-center text-sm text-content-tertiary">
              Already have an invite code? Use your invite link.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}

function Group({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section className={className} aria-label={label}>
      <h2 className="mb-2.5 px-1.5 text-xs font-medium uppercase tracking-[0.08em] text-content-tertiary">{label}</h2>
      <div className="overflow-hidden rounded-2xl bg-bg-surface [&>*+*]:border-t [&>*+*]:border-stroke-default">
        {children}
      </div>
    </section>
  );
}

function Field({
  id,
  icon: Icon,
  label,
  helper,
  error,
  asGroup,
  children,
}: {
  id: string;
  icon: typeof Users;
  label: string;
  helper?: string;
  error?: string | null;
  asGroup?: boolean;
  children: ReactNode;
}) {
  const labelContent = (
    <>
      <Icon className="h-4 w-4 text-content-secondary" aria-hidden="true" />
      {label}
    </>
  );
  return (
    <div className="ml-5 py-4 pr-5">
      {asGroup ? (
        <p id={`${id}-label`} className="flex items-center gap-2 text-sm font-medium text-content-secondary">
          {labelContent}
        </p>
      ) : (
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-content-secondary">
          {labelContent}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-status-error">
          {error}
        </p>
      ) : helper ? (
        <p className="mt-2 text-xs text-content-tertiary">{helper}</p>
      ) : null}
    </div>
  );
}

function SentState({ receipt }: { receipt: CuratorApplicationReceipt }) {
  return (
    <div className="flex flex-col items-center pt-8 text-center sm:pt-16" role="status">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15">
        <Check className="h-7 w-7 text-brand" aria-hidden="true" />
      </span>
      <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Application sent</h1>
      <p className="mt-3 max-w-sm text-base leading-relaxed text-content-secondary">
        Thanks. We&apos;ll listen to your playlist and reply by email or WhatsApp within a week.
      </p>
      <div className="mt-8 flex w-full items-center gap-4 rounded-2xl bg-bg-surface px-5 py-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-content-primary">{receipt.playlistName}</p>
          <p className="mt-0.5 truncate text-sm text-content-secondary">
            {applicationSummaryLine({ genre: receipt.genre, followers: receipt.followers, country: receipt.country })}
          </p>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-stroke-default px-3 text-sm text-content-secondary">
          <Clock className="h-4 w-4" aria-hidden="true" />
          In review
        </span>
      </div>
    </div>
  );
}
