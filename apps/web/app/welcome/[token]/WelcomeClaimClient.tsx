'use client';

// The page an invited manager lands on (founder-led seeding, 2026-10-10).
// Since 2026-10-11 it is also where a Directory invite lands: a manager invited
// somebody they work with, and `invitedBy` names that manager on the page.
//
// Wena built a private profile with them. They check it, change anything, pick
// whether they are open to work, and publish it only if they want to. Nothing
// is listed, served at /p/{slug} or featured until they press Publish: the one
// request that can list them is theirs, from their own signed-in account.
//
// Plain editor for the bio. UrgAns does not draft profile bios yet; the
// founder can put a starter in, and it arrives here for them to rewrite.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import {
  PERSON_AVAILABILITIES,
  PERSON_AVAILABILITY_COPY,
  PERSON_BIO_MAX_CHARS,
  PERSON_DISPLAY_NAME_MAX_CHARS,
  PERSON_PLACE_MAX_CHARS,
  PERSON_ROLES_MAX,
  PERSON_VISIBILITY_COPY,
} from '@/lib/person-profile';
import type { PersonAvailability } from '@/types/directory';
import { publishProblems, type PublishChoice } from '@/lib/seeding';
import { clearWelcomeIntent, markWelcomeIntent, welcomePath } from '@/lib/welcome-intent';
import type { ClaimView } from '@/lib/seeding-server';

const FIELD =
  'w-full rounded-xl border border-stroke-control bg-bg-surface px-3 py-3 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary focus-visible:outline-none';
const BUTTON =
  'inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold disabled:opacity-50';

async function accessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

const subscribeNothing = () => () => {};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-12 sm:py-16">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Urganize</p>
      {children}
    </main>
  );
}

type Done = { published: boolean; slug: string | null };

export default function WelcomeClaimClient({ token, initial }: { token: string; initial: ClaimView }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  // The auth flag is persisted, so the server render and the first client
  // render must not disagree about it: read it only after mount.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const signedIn = mounted && !authLoading && isAuthenticated;

  const startingProfile = initial.state === 'ok' ? initial.profile : null;
  const [name, setName] = useState(startingProfile?.displayName ?? '');
  const [bio, setBio] = useState(startingProfile?.bio ?? '');
  const [roles, setRoles] = useState<DirectoryRole[]>(
    (startingProfile?.roles ?? []).filter((role): role is DirectoryRole =>
      (DIRECTORY_ROLES as readonly string[]).includes(role)
    )
  );
  const [city, setCity] = useState(startingProfile?.city ?? '');
  const [availability, setAvailability] = useState<PersonAvailability>(
    (PERSON_AVAILABILITIES as readonly string[]).includes(startingProfile?.availability ?? '')
      ? (startingProfile?.availability as PersonAvailability)
      : 'selective'
  );
  const [publishTo, setPublishTo] = useState<PublishChoice>('directory');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);

  // Tell the founder this was opened, once, and only from a real browser: a
  // chat app's link preview never runs this.
  const reported = useRef(false);
  useEffect(() => {
    if (initial.state !== 'ok' || reported.current) return;
    reported.current = true;
    void fetch(`/api/welcome/${encodeURIComponent(token)}/opened`, { method: 'POST' }).catch(() => {});
  }, [initial.state, token]);

  if (initial.state !== 'ok') {
    const message =
      initial.state === 'used'
        ? 'This profile is already set up. Sign in to open it.'
        : initial.state === 'missing'
          ? 'This link is not available.'
          : `This link has expired. Ask ${initial.invitedBy || 'Wena'} for a new one.`;
    return (
      <Shell>
        <h1 className="mt-4 font-display text-3xl font-semibold">{message}</h1>
        {initial.state === 'used' ? (
          <Link href="/auth" className={`${BUTTON} mt-6 bg-brand text-content-inverse hover:bg-brand-hover`}>
            Sign in
          </Link>
        ) : null}
      </Shell>
    );
  }

  const toggleRole = (role: DirectoryRole) =>
    setRoles((current) =>
      current.includes(role)
        ? current.filter((entry) => entry !== role)
        : current.length >= PERSON_ROLES_MAX
          ? current
          : [...current, role]
    );

  const submit = async (publish: boolean) => {
    setError('');
    if (publish) {
      const problems = publishProblems({ displayName: name, roles });
      if (problems.length > 0) {
        setError(problems[0]);
        return;
      }
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/welcome/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name,
          bio: bio.trim() || null,
          roles,
          city: city.trim() || null,
          availability,
          publish,
          ...(publish ? { publishTo } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; published?: boolean; slug?: string | null }
        | null;
      if (!response.ok) {
        setError(payload?.error || 'Could not save your profile. Try again.');
        return;
      }
      clearWelcomeIntent();
      setDone({ published: Boolean(payload?.published), slug: payload?.slug ?? null });
    } catch {
      setError('Could not save your profile. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Shell>
        <h1 className="mt-4 font-display text-3xl font-semibold">
          {done.published ? 'You are listed.' : 'Saved. Only you can see it.'}
        </h1>
        <div className="mt-6 space-y-3">
          {done.published && publishTo === 'public' && done.slug ? (
            <Link href={`/p/${done.slug}`} className={`${BUTTON} bg-brand text-content-inverse hover:bg-brand-hover`}>
              See your page
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => router.push('/dashboard?settings=directory')}
            className={`${BUTTON} border border-stroke-control text-content-primary hover:border-content-secondary`}
          >
            Edit it in Settings
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {initial.invitedBy ? (
        <p className="mt-4 text-sm text-content-secondary">{initial.invitedBy} invited you to the Urganize Directory.</p>
      ) : null}
      <h1 className="mt-4 font-display text-3xl font-semibold">Your profile is ready to check</h1>
      <p className="mt-3 inline-flex rounded-full bg-bg-elevated px-3 py-1 text-xs font-semibold text-content-secondary">
        Private. Only you can see it.
      </p>

      {!signedIn ? (
        <>
          <div className="mt-6 rounded-xl border border-stroke-default bg-bg-surface p-4">
            <p className="font-display text-xl font-semibold">{name}</p>
            {roles.length > 0 ? (
              <p className="mt-1 text-sm text-content-secondary">
                {roles.map((role) => DIRECTORY_ROLE_LABELS[role]).join(', ')}
              </p>
            ) : null}
            {bio ? <p className="mt-3 text-sm leading-6 text-content-primary">{bio}</p> : null}
          </div>
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => {
                markWelcomeIntent(token);
                router.push('/onboarding');
              }}
              className={`${BUTTON} bg-brand text-content-inverse hover:bg-brand-hover`}
            >
              Create my account
            </button>
            <button
              type="button"
              onClick={() => {
                markWelcomeIntent(token);
                router.push(`/auth?next=${encodeURIComponent(welcomePath(token))}`);
              }}
              className={`${BUTTON} border border-stroke-control text-content-primary hover:border-content-secondary`}
            >
              I already have an account
            </button>
          </div>
        </>
      ) : (
        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
        >
          <div>
            <label htmlFor="welcome-name" className="text-sm font-semibold">
              Name
            </label>
            <input
              id="welcome-name"
              className={`${FIELD} mt-1`}
              value={name}
              maxLength={PERSON_DISPLAY_NAME_MAX_CHARS}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">What you do</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIRECTORY_ROLES.map((role) => {
                const selected = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleRole(role)}
                    className={`min-h-11 rounded-full border px-3 text-sm ${
                      selected
                        ? 'border-brand bg-brand/10 font-semibold text-content-primary'
                        : 'border-stroke-control text-content-secondary hover:border-content-secondary'
                    }`}
                  >
                    {selected ? '✓ ' : ''}
                    {DIRECTORY_ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="welcome-city" className="text-sm font-semibold">
              City
            </label>
            <input
              id="welcome-city"
              className={`${FIELD} mt-1`}
              value={city}
              maxLength={PERSON_PLACE_MAX_CHARS}
              onChange={(event) => setCity(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="welcome-bio" className="text-sm font-semibold">
              About you
            </label>
            <textarea
              id="welcome-bio"
              rows={5}
              className={`${FIELD} mt-1`}
              value={bio}
              maxLength={PERSON_BIO_MAX_CHARS}
              onChange={(event) => setBio(event.target.value)}
            />
            <p className="mt-1 text-right font-mono text-xs text-content-tertiary">
              {bio.length}/{PERSON_BIO_MAX_CHARS}
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">Are you taking on work?</legend>
            <div className="mt-2 space-y-2" role="radiogroup">
              {PERSON_AVAILABILITIES.map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-stroke-control px-3 py-2"
                >
                  <input
                    type="radio"
                    name="availability"
                    checked={availability === option}
                    onChange={() => setAvailability(option)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{PERSON_AVAILABILITY_COPY[option].label}</span>
                    <span className="block text-xs text-content-secondary">{PERSON_AVAILABILITY_COPY[option].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">If you publish, who can see it?</legend>
            <div className="mt-2 space-y-2" role="radiogroup">
              {(['directory', 'public'] as const).map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-stroke-control px-3 py-2"
                >
                  <input
                    type="radio"
                    name="publishTo"
                    checked={publishTo === option}
                    onChange={() => setPublishTo(option)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{PERSON_VISIBILITY_COPY[option].label}</span>
                    <span className="block text-xs text-content-secondary">{PERSON_VISIBILITY_COPY[option].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error"
            >
              {error}
            </p>
          ) : null}

          <div className="space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
              className={`${BUTTON} bg-brand text-content-inverse hover:bg-brand-hover`}
            >
              {busy ? 'Saving…' : 'Publish my profile'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className={`${BUTTON} border border-stroke-control text-content-primary hover:border-content-secondary`}
            >
              Save, keep it private
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}
