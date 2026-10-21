'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { CLAIM_COPY } from '@/lib/claim-copy';
import { markClaimIntent } from '@/lib/claim-intent';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { claimPageViewedProperties } from '@/lib/profile-growth';
import { markSignupSource } from '@/lib/signup-source-intent';
import { HYPE_LINE_MAX_CHARS, shareCardPath } from '@/lib/person-page';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { PERSON_PHOTO_SIGN_URL } from '@/lib/profile-photo-client';
import { ShareStoryButton } from './ShareStoryButton';
import type { ClaimCredit } from '@/lib/claim-server';

// The claim, in four screens (URG-305, founder-approved mock claim.html):
//
//   1. Prove it's you: the work email on the credit (or the phone, when that is
//      what the credit holds).
//   2. Enter code: six digits emailed to that address. Skipped when their own
//      confirmed sign-in email is the one on the credit, or for a phone.
//   3. Make it yours: photo, one hype line, the artists they manage.
//   4. You're verified: their 9:16 card, Share to Story, View profile.
//
// Signed out, screen 1 asks them to sign up or log in first and comes back.
// Bare minimum text on every screen. Every call is an open route (no paywall)
// except the photo and roster, which are the app's own and need a team.
//
// Instagram and X are not offered: the proof rule is an email or phone already
// on the credit (CLAUDE.md, Lane A), and no credit carries a handle to match.

export type ClaimPreviewProps =
  | { ok: true; displayName: string; hint: string; credits: ClaimCredit[] }
  | { ok: false; reason: string };

type Step = 'prove' | 'contact' | 'code' | 'yours' | 'done';
type Artist = { id: string; name: string; photoUrl: string | null };

const GROUND = '#0c0c0d';
const SURFACE = '#171719';
const LINE = '#202023';
const MUTED = '#929291';
const ACCENT = '#7fd99a';

const PALETTE = {
  '--kit-ground': GROUND,
  '--kit-surface': SURFACE,
  '--kit-border': LINE,
  '--kit-text': '#f2f2f0',
  '--kit-text-muted': MUTED,
  '--kit-text-faint': MUTED,
  '--kit-accent': ACCENT,
  backgroundColor: GROUND,
  color: '#f2f2f0',
} as React.CSSProperties;

const ROW = 'flex min-h-[62px] w-full items-center gap-3.5 rounded-2xl px-[18px] text-base font-bold';
const PRIMARY = 'motion-focus flex h-[52px] w-full items-center justify-center rounded-2xl text-base font-extrabold text-black disabled:opacity-60';
const SECONDARY = 'motion-focus flex h-[52px] w-full items-center justify-center rounded-2xl text-base font-extrabold';

const closedText = (reason: string): string =>
  (CLAIM_COPY.closed as Record<string, string>)[reason] ?? CLAIM_COPY.closed.unavailable;

async function call(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  return fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
}

const tries = (left: unknown) => (typeof left === 'number' ? ` ${left} tries left.` : '');

export function ClaimWizard({ token, preview }: { token: string; preview: ClaimPreviewProps }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('prove');
  const [contact, setContact] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Pasting the sixth digit fires onComplete and the Verify tap can land in the
  // same tick, before the busy state paints: a ref makes the second call a no-op.
  const inFlight = useRef(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [hype, setHype] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [addingArtist, setAddingArtist] = useState(false);
  const [artistName, setArtistName] = useState('');

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

  // The roster, once they reach "Make it yours". A failure leaves it empty.
  useEffect(() => {
    if (step !== 'yours') return;
    let cancelled = false;
    (async () => {
      try {
        const response = await call('/api/workspace/artists');
        if (!response.ok) return;
        const body = (await response.json()) as { artists?: Artist[] };
        if (!cancelled) setArtists(body.artists ?? []);
      } catch {
        // Nothing to show; Add still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  if (!preview.ok) {
    return (
      <Shell>
        <h1 className="mt-7 font-display text-[30px] leading-tight">This link is not available</h1>
        <p role="status" className="mt-2 font-mono text-[15px]" style={{ color: MUTED }}>
          {closedText(preview.reason)}
        </p>
      </Shell>
    );
  }

  const signedIn = mounted && isAuthenticated;
  const hintIsPhone = preview.hint.startsWith('+');

  async function finishClaim(body: Record<string, unknown>) {
    const response = await call(`/api/claim/${token}`, { method: 'POST', body: JSON.stringify(body) });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      slug?: string | null;
      reason?: string;
      attemptsLeft?: number;
    };
    if (!response.ok || !result.ok) {
      if (result.reason === 'bad_code') setError(`Wrong code.${tries(result.attemptsLeft)}`);
      else if (result.reason === 'no_match') setError(`${CLAIM_COPY.wrongContact}${tries(result.attemptsLeft)}`);
      else setError(closedText(result.reason || 'unavailable'));
      return;
    }
    setSlug(result.slug ?? null);
    setError(null);
    setStep('yours');
  }

  async function sendCode() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await call(`/api/claim/${token}/code`, { method: 'POST', body: JSON.stringify({ contact }) });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        skip?: boolean;
        sentTo?: string;
        reason?: string;
        attemptsLeft?: number;
      };
      if (!response.ok || !body.ok) {
        if (body.reason === 'no_match') setError(`${CLAIM_COPY.wrongContact}${tries(body.attemptsLeft)}`);
        else if (body.reason === 'not_sent' || body.reason === 'error') setError('Could not send the code. Try again.');
        else setError(closedText(body.reason || 'unavailable'));
        return;
      }
      if (body.skip) {
        await finishClaim({ contact });
        return;
      }
      setSentTo(body.sentTo || contact.trim());
      setCode('');
      setStep('code');
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function verify() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await finishClaim({ contact, code });
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function addArtist() {
    const name = artistName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const response = await call('/api/workspace/artists', { method: 'POST', body: JSON.stringify({ name }) });
      const body = (await response.json().catch(() => ({}))) as { artist?: Artist; error?: string };
      if (!response.ok || !body.artist) {
        setError(body.error || 'Could not add that artist.');
        return;
      }
      setArtists((list) => [...list, { ...body.artist!, photoUrl: body.artist!.photoUrl ?? null }]);
      setArtistName('');
      setAddingArtist(false);
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = { published: true };
      if (hype.trim()) patch.bio = hype.trim();
      const response = await call('/api/claim-profile', { method: 'PATCH', body: JSON.stringify(patch) });
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

  const savePhoto = async (photoPath: string | null): Promise<string | null> => {
    const response = await call('/api/directory/profile', { method: 'PATCH', body: JSON.stringify({ photoPath }) });
    const body = (await response.json().catch(() => ({}))) as { error?: string; profile?: { avatarUrl?: string | null } };
    if (!response.ok) throw new Error(body.error || 'Could not save your photo.');
    return body.profile?.avatarUrl ?? null;
  };

  if (step === 'done') {
    return (
      <Shell>
        {slug ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shareCardPath(slug)}
            alt=""
            className="mx-auto mt-[34px] h-[320px] w-[180px] rounded-[18px] object-cover"
            style={{ backgroundColor: SURFACE }}
          />
        ) : null}
        <h1 className="mt-[30px] text-center font-display text-[30px] leading-tight">
          You&apos;re verified
          <span
            role="img"
            aria-label="verified"
            className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full align-[4px] text-xs font-black text-black"
            style={{ backgroundColor: ACCENT, fontFamily: 'system-ui, sans-serif' }}
          >
            ✓
          </span>
        </h1>
        <div className="flex-1" />
        {slug ? <ShareStoryButton slug={slug} surface="claim_done" /> : null}
        {slug ? (
          <Link
            href={`/p/${slug}`}
            className={`${SECONDARY} mt-2.5`}
            style={{ backgroundColor: SURFACE, border: `1px solid ${LINE}` }}
          >
            View profile
          </Link>
        ) : (
          <button type="button" className={PRIMARY} style={{ backgroundColor: ACCENT }} onClick={() => router.replace('/dashboard')}>
            Done
          </button>
        )}
      </Shell>
    );
  }

  if (step === 'yours') {
    return (
      <Shell>
        <h1 className="mt-7 font-display text-[30px] leading-tight">Make it yours</h1>
        <div className={`${ROW} mt-7 justify-between`} style={{ backgroundColor: SURFACE, border: `1px solid ${LINE}` }}>
          <span>Photo</span>
          <ProfilePhotoPicker
            name={preview.displayName}
            photoUrl={photoUrl}
            size={36}
            signUrl={PERSON_PHOTO_SIGN_URL}
            save={savePhoto}
            onChange={setPhotoUrl}
            surface="person_photo"
          />
        </div>
        <input
          aria-label="Hype line"
          placeholder="Hype line"
          value={hype}
          maxLength={HYPE_LINE_MAX_CHARS}
          onChange={(event) => setHype(event.target.value)}
          className={`${ROW} mt-3 bg-transparent placeholder:text-[#929291] focus:outline-none`}
          style={{ backgroundColor: SURFACE, border: `1px solid ${LINE}` }}
        />
        <div className="mt-3 rounded-2xl px-[18px]" style={{ backgroundColor: SURFACE, border: `1px solid ${LINE}` }}>
          <div className="flex min-h-[62px] items-center justify-between text-base font-bold">
            <span>Artists you manage</span>
            {!addingArtist ? (
              <button type="button" className="min-h-11 px-1" style={{ color: ACCENT }} onClick={() => setAddingArtist(true)}>
                Add
              </button>
            ) : null}
          </div>
          {artists.length > 0 ? (
            <ul className="flex flex-wrap gap-2 pb-4">
              {artists.map((artist) => (
                <li key={artist.id} className="rounded-full px-3 py-1.5 text-sm" style={{ border: `1px solid ${LINE}` }}>
                  {artist.name}
                </li>
              ))}
            </ul>
          ) : null}
          {addingArtist ? (
            <form
              className="flex gap-2 pb-4"
              onSubmit={(event) => {
                event.preventDefault();
                void addArtist();
              }}
            >
              <input
                autoFocus
                aria-label="Artist name"
                value={artistName}
                onChange={(event) => setArtistName(event.target.value)}
                className="h-11 flex-1 rounded-xl bg-transparent px-3 text-base focus:outline-none"
                style={{ border: `1px solid ${LINE}` }}
              />
              <button
                type="submit"
                disabled={busy || !artistName.trim()}
                className="h-11 rounded-xl px-4 text-sm font-extrabold text-black disabled:opacity-60"
                style={{ backgroundColor: ACCENT }}
              >
                Add
              </button>
            </form>
          ) : null}
        </div>
        <Notice message={error} />
        <div className="flex-1" />
        <button type="button" className={PRIMARY} style={{ backgroundColor: ACCENT }} disabled={busy} onClick={() => void done()}>
          Done
        </button>
      </Shell>
    );
  }

  if (step === 'code') {
    return (
      <Shell onBack={() => { setError(null); setStep('contact'); }}>
        <h1 className="mt-7 font-display text-[30px] leading-tight">Enter code</h1>
        <p className="mt-2 font-mono text-[15px]" style={{ color: MUTED }}>
          Sent to {sentTo}
        </p>
        <CodeBoxes value={code} onChange={setCode} onComplete={() => void verify()} />
        <Notice message={error} />
        <div className="flex-1" />
        <button
          type="button"
          className={PRIMARY}
          style={{ backgroundColor: ACCENT }}
          disabled={busy || code.length !== 6}
          onClick={() => void verify()}
        >
          Verify
        </button>
      </Shell>
    );
  }

  if (step === 'contact') {
    return (
      <Shell onBack={() => { setError(null); setStep('prove'); }}>
        <h1 className="mt-7 font-display text-[30px] leading-tight">{hintIsPhone ? 'Phone' : 'Work email'}</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
          className="flex flex-1 flex-col"
        >
          <input
            autoFocus
            aria-label={hintIsPhone ? 'Phone' : 'Work email'}
            placeholder={preview.hint}
            type={hintIsPhone ? 'tel' : 'email'}
            autoComplete={hintIsPhone ? 'tel' : 'email'}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            className={`${ROW} mt-7 bg-transparent font-normal placeholder:text-[#929291] focus:outline-none`}
            style={{ backgroundColor: SURFACE, border: `1px solid ${LINE}` }}
          />
          <Notice message={error} />
          <div className="flex-1" />
          <button type="submit" className={PRIMARY} style={{ backgroundColor: ACCENT }} disabled={busy || !contact.trim()}>
            {hintIsPhone ? 'Verify' : 'Send code'}
          </button>
        </form>
      </Shell>
    );
  }

  // Step 1: prove it's you.
  return (
    <Shell>
      <h1 className="mt-7 font-display text-[30px] leading-tight">Prove it&apos;s you</h1>
      <p className="mt-2 font-mono text-[15px]" style={{ color: MUTED }}>
        {preview.displayName}
      </p>
      {!signedIn ? (
        <>
          <div className="flex-1" />
          <button
            type="button"
            className={PRIMARY}
            style={{ backgroundColor: ACCENT }}
            onClick={() => {
              markClaimIntent(token);
              // A sign-up that came from a claim link (signup_from_profile).
              markSignupSource({ source: 'claim', slug: null, cta: null });
              router.push('/onboarding');
            }}
          >
            Sign up
          </button>
          <Link
            href={`/auth?next=${encodeURIComponent(`/claim/${token}`)}`}
            className={`${SECONDARY} mt-2.5`}
            style={{ backgroundColor: SURFACE, border: `1px solid ${LINE}` }}
          >
            Log in
          </Link>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep('contact');
            }}
            className={`${ROW} mt-7 text-left`}
            style={{ backgroundColor: SURFACE, border: `1px solid ${LINE}` }}
          >
            <span
              aria-hidden="true"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-sm font-black text-black"
              style={{ backgroundColor: '#fff' }}
            >
              {hintIsPhone ? '#' : '@'}
            </span>
            {hintIsPhone ? 'Phone' : 'Work email'}
          </button>
          <Notice message={error} />
        </>
      )}
    </Shell>
  );
}

function CodeBoxes({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label className="relative mt-[30px] flex gap-2.5" onClick={() => inputRef.current?.focus()}>
      <span className="sr-only">Code</span>
      <input
        ref={inputRef}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
          onChange(digits);
          if (digits.length === 6) onComplete();
        }}
        className="absolute inset-0 opacity-0"
      />
      {Array.from({ length: 6 }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="flex h-16 flex-1 items-center justify-center rounded-[14px] text-[28px] font-extrabold"
          style={{
            backgroundColor: SURFACE,
            border: `1px solid ${index === Math.min(value.length, 5) ? ACCENT : LINE}`,
          }}
        >
          {value[index] ?? ''}
        </span>
      ))}
    </label>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="kit-island min-h-screen" style={PALETTE}>
      <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-[22px] pb-6 pt-[34px]">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back" className="h-11 w-11 -ml-2 text-[22px]" style={{ color: MUTED }}>
            ‹
          </button>
        ) : (
          <div className="h-11" />
        )}
        {children}
      </main>
    </div>
  );
}

function Notice({ message }: { message: string | null }) {
  return (
    <p role="alert" className="mt-4 min-h-5 text-sm text-status-error">
      {message}
    </p>
  );
}
