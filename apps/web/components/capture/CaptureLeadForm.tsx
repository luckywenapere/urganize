'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, Check, Loader2 } from '@/components/icons';
import { openExternalUrl } from '@/lib/external-link';

/**
 * The public fan-capture form (2026-08-14). Client component rendered by the
 * server page at app/capture/[token]/page.tsx, inside the dark-locked
 * .capture-island treatment the public EPK and credits pages established.
 *
 * No auth — the unguessable token in the URL is the only access control,
 * resolved server-side before this ever renders. Every field is re-validated
 * by app/api/capture/[token]/route.ts; nothing here is a trust boundary.
 *
 * THE ONE RULE THIS COMPONENT EXISTS TO KEEP (playbook L3): the link is paid
 * out on THIS screen, the instant the email is accepted. No confirmation
 * email, no "check your inbox", no redirect to a thank-you page. The moment
 * the fan submits is the moment they are most willing to act, and sending them
 * to a mail client is where that willingness is lost — on a phone mid-scroll,
 * lost for good. If a future change proposes double opt-in here, it is
 * re-litigating the most load-bearing rule on the page.
 *
 * The destination URL is not in this component's props and is not in the
 * page's HTML: it arrives in the POST response. That is what makes the
 * exchange real rather than a formality anyone could skip with view-source.
 */

const SURFACE = 'var(--capture-surface)';
const STROKE = 'var(--capture-border)';
const CREAM = 'var(--capture-text)';
const MUTED = 'var(--capture-text-muted)';
const FAINT = 'var(--capture-text-faint)';
const BRAND = 'var(--capture-accent)';
const INK = 'var(--capture-ground)';

function inputStyle(): CSSProperties {
  return { backgroundColor: SURFACE, borderColor: STROKE, color: CREAM };
}

type CaptureLeadFormProps = {
  token: string;
  collectName: boolean;
  buttonLabel: string;
  consentNote: string;
  destinationLabel: string;
};

type SubmitResponse = {
  ok?: boolean;
  destinationUrl?: string;
  destinationLabel?: string;
  error?: string;
};

export function CaptureLeadForm({
  token,
  collectName,
  buttonLabel,
  consentNote,
  destinationLabel,
}: CaptureLeadFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reward, setReward] = useState<{ url: string; label: string } | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/capture/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: collectName ? name : undefined,
          // Submitting IS the consent act — the note sits right above the
          // button, so a separate checkbox would be a second tap for an
          // agreement already made in plain sight (playbook C1: one ask).
          consented: true,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as SubmitResponse;

      if (!res.ok || !data.destinationUrl) {
        setError(data.error || 'Could not sign you up. Please try again.');
        return;
      }

      const label = data.destinationLabel || destinationLabel || 'the link';
      setReward({ url: data.destinationUrl, label });

      // Hand the link over immediately, without waiting for a second tap.
      // Routed through openExternalUrl so this works inside the Capacitor
      // webview, where a bare new-tab anchor commonly opens blank. A popup
      // blocker can still stop it — which is exactly why the tappable link
      // below is rendered too, rather than being a fallback nobody sees.
      void openExternalUrl(data.destinationUrl);
    } catch {
      setError('Could not sign you up. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (reward) {
    return (
      <div
        className="mt-8 border p-6 text-center"
        style={{ borderColor: STROKE, backgroundColor: SURFACE }}
      >
        <div
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: BRAND }}
        >
          <Check className="h-5 w-5" style={{ color: INK }} aria-hidden="true" />
        </div>
        <p className="mt-4 text-base font-medium" style={{ color: CREAM }}>
          You&rsquo;re in.
        </p>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          Opening {reward.label} now. If nothing happened, tap below.
        </p>
        <a
          href={reward.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex min-h-11 items-center gap-2 px-5 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: BRAND, color: INK }}
        >
          {reward.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      {collectName ? (
        <div className="mb-3">
          <label htmlFor="capture-name" className="sr-only">
            Your name
          </label>
          <input
            id="capture-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            required
            className="w-full border px-4 py-3 text-base outline-none placeholder:opacity-60 focus:ring-1"
            style={inputStyle()}
          />
        </div>
      ) : null}

      <label htmlFor="capture-email" className="sr-only">
        Your email address
      </label>
      <input
        id="capture-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@email.com"
        autoComplete="email"
        inputMode="email"
        required
        // text-base, not text-sm: iOS Safari zooms the whole page in on focus
        // for any input under 16px, which on a capture page means the fan's
        // first interaction is the layout jumping.
        className="w-full border px-4 py-3 text-base outline-none placeholder:opacity-60 focus:ring-1"
        style={inputStyle()}
      />

      {error ? (
        <p className="mt-3 text-sm" style={{ color: '#ff8f8f' }} role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-base font-semibold disabled:opacity-70"
        style={{ backgroundColor: BRAND, color: INK }}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          buttonLabel
        )}
      </button>

      <p className="mt-3 text-xs leading-relaxed" style={{ color: FAINT }}>
        {consentNote}
      </p>
    </form>
  );
}
