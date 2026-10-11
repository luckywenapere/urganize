'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@urganize/ui';
import { useAuthStore } from '@/lib/auth-store';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { CLAIM_COPY } from '@/lib/claim-copy';
import { markClaimIntent } from '@/lib/claim-intent';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { claimPageViewedProperties, publicProfileUrl } from '@/lib/profile-growth';
import { markSignupSource } from '@/lib/signup-source-intent';
import { ShareProfileLink } from './ShareProfileLink';
import { PERSON_AVAILABILITIES, PERSON_AVAILABILITY_COPY, PERSON_BIO_MAX_CHARS } from '@/lib/person-profile';
import { onRadioGroupKeyDown } from '@/lib/radio-group-keys';
import type { ClaimCredit } from '@/lib/claim-server';
import type { PersonAvailability } from '@/types/directory';

// The claim page's three steps, after the one before them (are you signed in):
//
//   1. Confirm it is you, with the email or phone on the credit.
//   2. Review your credits and hide any that are not yours.
//   3. Add a bio, say if you are open to work, and choose who sees the page.
//
// Then a prompt to start a rollout or bring a team in. Every step talks to
// open routes (no paywall): this is somebody's first minute.

export type ClaimPreviewProps =
  | { ok: true; displayName: string; hint: string; credits: ClaimCredit[] }
  | { ok: false; reason: string };

type Step = 'confirm' | 'credits' | 'about' | 'done';

const FIELD =
  'h-11 w-full rounded-lg border border-stroke-control px-3 text-base text-content-primary hover:border-content-secondary focus:border-brand focus:outline-none';

const closedText = (reason: string): string =>
  (CLAIM_COPY.closed as Record<string, string>)[reason] ?? CLAIM_COPY.closed.unavailable;

async function call(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  return fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
}

export function ClaimWizard({ token, preview }: { token: string; preview: ClaimPreviewProps }) {
  const router = useRouter();
  const fieldId = useId();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('confirm');
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState<ClaimCredit[]>(preview.ok ? preview.credits : []);
  const [slug, setSlug] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [availability, setAvailability] = useState<PersonAvailability>('selective');
  const [published, setPublished] = useState(true);

  useEffect(() => setMounted(true), []);

  // claim_page_viewed, from the browser: a chat app fetches a pasted link on
  // the server before anyone reads it, so a server count would report opens
  // that never happened (the seeding page's rule). Once per mount.
  const viewSent = useRef(false);
  useEffect(() => {
    if (!mounted || viewSent.current) return;
    viewSent.current = true;
    captureAnalyticsEvent(
      createPostHogEvent(
        'claim_page_viewed',
        claimPageViewedProperties({
          ok: preview.ok,
          reason: preview.ok ? undefined : preview.reason,
          signedIn: isAuthenticated,
          credits: preview.ok ? preview.credits.length : 0,
        })
      )
    );
    // Fires once, whatever the props do afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!preview.ok) {
    return (
      <Shell>
        <h1 className="font-display text-3xl">{CLAIM_COPY.heading}</h1>
        <p role="status" className="mt-4 text-content-secondary">
          {closedText(preview.reason)}
        </p>
        <Link href="/auth" className="mt-6 inline-flex min-h-11 items-center text-brand underline underline-offset-4">
          Log in
        </Link>
      </Shell>
    );
  }

  const signedIn = mounted && isAuthenticated;

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const response = await call(`/api/claim/${token}`, { method: 'POST', body: JSON.stringify({ contact }) });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; slug?: string | null; reason?: string; attemptsLeft?: number };
      if (!response.ok || !body.ok) {
        if (body.reason === 'no_match') {
          setError(
            `${CLAIM_COPY.wrongContact}${typeof body.attemptsLeft === 'number' ? ` ${body.attemptsLeft} tries left.` : ''}`
          );
        } else {
          setError(closedText(body.reason || 'unavailable'));
        }
        return;
      }
      setSlug(body.slug ?? null);
      const mine = await call('/api/claim-profile');
      if (mine.ok) {
        const data = (await mine.json()) as { credits?: ClaimCredit[] };
        setCredits(data.credits ?? []);
      }
      setStep('credits');
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function hideCredit(submissionId: string, hidden: boolean) {
    setCredits((list) => list.map((c) => (c.submissionId === submissionId ? { ...c, hidden } : c)));
    const response = await call('/api/claim-profile', {
      method: 'PATCH',
      body: JSON.stringify({ hideCredit: { submissionId, hidden } }),
    });
    if (!response.ok) {
      setCredits((list) => list.map((c) => (c.submissionId === submissionId ? { ...c, hidden: !hidden } : c)));
      setError('Could not change that credit. Try again.');
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await call('/api/claim-profile', {
        method: 'PATCH',
        body: JSON.stringify({ bio, availability, published }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; slug?: string | null };
      if (!response.ok) {
        setError(body.error || 'Could not save. Try again.');
        return;
      }
      if (body.slug) setSlug(body.slug);
      setStep('done');
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'credits') {
    return (
      <Shell>
        <h1 className="font-display text-3xl">{CLAIM_COPY.creditsHeading}</h1>
        <p className="mt-2 text-content-secondary">{CLAIM_COPY.creditsHint}</p>
        <ul className="mt-6 space-y-2">
          {credits.map((credit) => (
            <li
              key={credit.submissionId}
              className="flex items-center justify-between gap-3 rounded-xl border border-stroke-default bg-bg-surface px-4 py-3"
            >
              <span className={credit.hidden ? 'text-content-tertiary line-through' : ''}>
                {credit.releaseTitle}
                {credit.releaseYear ? ` (${credit.releaseYear})` : ''}
              </span>
              <button
                type="button"
                aria-pressed={credit.hidden}
                onClick={() => void hideCredit(credit.submissionId, !credit.hidden)}
                className="min-h-11 shrink-0 rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary"
              >
                {credit.hidden ? 'Hidden. Show it' : 'Not mine'}
              </button>
            </li>
          ))}
        </ul>
        <Notice message={error} />
        <Button className="mt-6 min-h-11" onClick={() => { setError(null); setStep('about'); }}>
          Next
        </Button>
      </Shell>
    );
  }

  if (step === 'about') {
    return (
      <Shell>
        <h1 className="font-display text-3xl">{CLAIM_COPY.aboutHeading}</h1>
        <div className="mt-6 space-y-6">
          <div>
            <label htmlFor={`${fieldId}-bio`} className="block text-sm font-medium">
              {CLAIM_COPY.bioLabel}
            </label>
            <textarea
              id={`${fieldId}-bio`}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={PERSON_BIO_MAX_CHARS}
              rows={4}
              className="mt-1 w-full rounded-lg border border-stroke-control px-3 py-2 text-base text-content-primary hover:border-content-secondary focus:border-brand focus:outline-none"
            />
            <p className="mt-1 text-xs text-content-tertiary">
              {bio.length} of {PERSON_BIO_MAX_CHARS}
            </p>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">{CLAIM_COPY.openToLabel}</legend>
            <div
              role="radiogroup"
              aria-label={CLAIM_COPY.openToLabel}
              onKeyDown={(event) =>
                onRadioGroupKeyDown(event, PERSON_AVAILABILITIES.indexOf(availability), (index) =>
                  setAvailability(PERSON_AVAILABILITIES[index])
                )
              }
              className="mt-2 flex flex-wrap gap-2"
            >
              {PERSON_AVAILABILITIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={availability === value}
                  tabIndex={availability === value ? 0 : -1}
                  onClick={() => setAvailability(value)}
                  className={`min-h-11 rounded-full border px-4 text-sm ${
                    availability === value
                      ? 'border-brand bg-brand/10 text-content-primary'
                      : 'border-stroke-control text-content-secondary hover:border-content-secondary'
                  }`}
                >
                  {availability === value ? '✓ ' : ''}
                  {PERSON_AVAILABILITY_COPY[value].label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={published}
              onChange={(event) => setPublished(event.target.checked)}
              className="h-5 w-5"
            />
            {CLAIM_COPY.publishLabel}
          </label>
        </div>
        <Notice message={error} />
        <Button className="mt-6 min-h-11" onClick={() => void save()} isLoading={busy}>
          {CLAIM_COPY.publishButton}
        </Button>
      </Shell>
    );
  }

  if (step === 'done') {
    const shareUrl = published && slug && mounted ? publicProfileUrl(window.location.origin, slug) : null;
    return (
      <Shell>
        <h1 className="font-display text-3xl">{CLAIM_COPY.nextHeading}</h1>
        {/* The moment to share it: right now, before they close the tab.
            Only for a page they chose to show; a private page has no link. */}
        {shareUrl ? <ShareProfileLink url={shareUrl} surface="claim_done" /> : null}
        {published && slug ? (
          <Link href={`/p/${slug}`} className="mt-2 inline-flex min-h-11 items-center text-brand underline underline-offset-4">
            See your page
          </Link>
        ) : null}
        <p className="mt-8 text-content-secondary">{CLAIM_COPY.nextText}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button className="min-h-11" onClick={() => router.push('/dashboard')}>
            {CLAIM_COPY.startRollout}
          </Button>
          <Button className="min-h-11" variant="secondary" onClick={() => router.push('/dashboard?settings=team')}>
            {CLAIM_COPY.inviteTeam}
          </Button>
        </div>
      </Shell>
    );
  }

  // Step 1: confirm it is you.
  return (
    <Shell>
      <h1 className="font-display text-3xl">{CLAIM_COPY.heading}</h1>
      <p className="mt-3 text-lg">{preview.displayName}</p>
      <p className="mt-2 text-content-secondary">{CLAIM_COPY.intro}</p>
      {preview.credits.length > 0 ? (
        <ul className="mt-6 space-y-1 text-sm text-content-secondary">
          {preview.credits.map((credit) => (
            <li key={credit.submissionId}>
              {credit.releaseTitle}
              {credit.releaseYear ? ` (${credit.releaseYear})` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      {!signedIn ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            className="min-h-11"
            onClick={() => {
              markClaimIntent(token);
              // A sign-up that came from a claim link (signup_from_profile).
              markSignupSource({ source: 'claim', slug: null, cta: null });
              router.push('/onboarding');
            }}
          >
            Sign up to claim
          </Button>
          <Link
            href={`/auth?next=${encodeURIComponent(`/claim/${token}`)}`}
            className="inline-flex min-h-11 items-center rounded-full border border-stroke-control px-5 text-sm hover:border-content-secondary"
          >
            Log in
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <h2 className="text-sm font-medium">{CLAIM_COPY.confirmHeading}</h2>
          <label htmlFor={`${fieldId}-contact`} className="mt-3 block text-sm text-content-secondary">
            {CLAIM_COPY.confirmLabel}
            {preview.hint ? ` (for example ${preview.hint})` : ''}
          </label>
          <input
            id={`${fieldId}-contact`}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            autoComplete="email"
            className={`mt-1 ${FIELD}`}
          />
          <p className="mt-2 text-xs text-content-tertiary">
            Signed in as {user?.email}. {CLAIM_COPY.confirmHint}
          </p>
          <Notice message={error} />
          <Button className="mt-4 min-h-11" onClick={() => void claim()} isLoading={busy}>
            {CLAIM_COPY.confirmButton}
          </Button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-6 py-16 text-content-primary sm:py-24">
      {children}
    </main>
  );
}

function Notice({ message }: { message: string | null }) {
  return (
    <p role="alert" className="mt-4 min-h-5 text-sm text-status-error">
      {message}
    </p>
  );
}
