'use client';

// Playlist pitching, across every release (2026-09-09, founder: "Playlist
// pitching should be accessible app wide on mobile on the nav bar at the
// bottom on desktop on the side menu and top menu").
//
// WHY THIS PAGE HAD TO EXIST for that ask to be buildable: the team side of
// pitching was a release SCENE, so every entry point to it needed a release
// already scoped. A menu item pointing at it would have had nowhere to go.
// This is the page those menu items point at, and it answers the question the
// scene could not: what has this team pitched, anywhere, and what came back.
//
// THE RELEASE SCENE STAYS (founder call). Pitching from inside a release is
// still one tap from the release you are working on, and both surfaces render
// the same two components, so they cannot drift apart.
//
// NEVER useSearchParams, deliberately: this page is reached from app-wide
// chrome, so pulling that hook in would drag it behind a Suspense boundary and
// ship loading.tsx as its server HTML (the trap recorded for /auth and
// MobileNavBar). It does read ONE param — ?curator=, set when an artist
// arrives from a curator's public page — and reads it the way this repo's
// other static pages do: imperatively, once, in a pre-paint layout effect.
// Check /dashboard/pitching is still `○ Static` in the build if this changes.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Radio } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import type { SentPitch } from '@/types/pitching';
import {
  MAX_WAITING_PITCHES_PER_RELEASE,
  countWaitingPitches,
  describeSentPitchScope,
  groupPitchesByRelease,
} from '@/lib/pitching';
import { PitchComposer } from '@/components/pitching/PitchComposer';
import { isValidCuratorSlug } from '@/lib/curator-public';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { SentPitchRow } from '@/components/pitching/SentPitchRow';
import { PitchPayments } from '@/components/pitching/PitchPayments';
import { useToast } from '@/components/shared/ToastProvider';
import { isPitchPaymentsEnabled } from '@/lib/pitch-payments';
import { PAYMENT_FAILED } from '@/lib/pitch-payment-copy';

// Same flag every /api/pitching route reads. A direct link followed while the
// flag is off bounces to the workspace — the route has no server-side gate,
// since the flag is inlined at build time (the shows and press kits precedent).
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

/**
 * The curator an artist arrived to pitch, read once from the URL.
 *
 * Imperative and pre-paint rather than useSearchParams — see the header. The
 * value is re-validated because it is a URL somebody can type, and it goes on
 * to filter a server query.
 */
/**
 * Paystack sends an artist who cancels on its page back here with
 * ?payment=cancelled (the checkout's cancel_action). Read the same way as the
 * curator param, and for the same reason.
 */
function readPaymentCancelled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('payment') === 'cancelled';
  } catch {
    return false;
  }
}

function readCuratorParam(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get('curator') || '';
    const slug = raw.trim().toLowerCase();
    return isValidCuratorSlug(slug) ? slug : '';
  } catch {
    return '';
  }
}

export default function PitchingPageClient() {
  // Set when an artist arrives from /pitch/{slug}. Empty for everyone else, so
  // the composer browses the whole inventory exactly as it always has.
  const [curatorSlug, setCuratorSlug] = useState('');
  const [paymentCancelled, setPaymentCancelled] = useState(false);
  useIsomorphicLayoutEffect(() => {
    setCuratorSlug(readCuratorParam());
    setPaymentCancelled(readPaymentCancelled());
  }, []);
  const paymentsOn = isPitchPaymentsEnabled();

  const router = useRouter();
  const { isLoading: authLoading } = useAuthStore();
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const { pushToast } = useToast();

  const [pitches, setPitches] = useState<SentPitch[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [chosenReleaseId, setChosenReleaseId] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to see your pitches.');
      // No releaseId: the team-wide branch of the route.
      const response = await fetch('/api/pitching/pitches', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as {
        pitches?: SentPitch[];
        truncated?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !Array.isArray(payload?.pitches)) {
        throw new Error(payload?.error || 'Could not load your pitches.');
      }
      setPitches(payload.pitches);
      setTruncated(Boolean(payload.truncated));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Could not load your pitches.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!PITCHING_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void load();
    // The release picker needs the catalog. Recency-guarded in the store, so
    // this is free when the workspace already loaded it.
    void loadCommandCenter();
  }, [load, loadCommandCenter, router]);

  // THE PICKER'S VALUE IS DERIVED, not seeded by an effect: the manager's own
  // choice when they have made one, the first release otherwise. Storing the
  // default instead would need an effect that waits for the catalog, so there
  // would be a render where nothing is selected and the composer sits disabled
  // — and it would cost a setState-in-effect for a value that is a plain
  // fallback. `chosenReleaseId` stays the record of what was actually clicked.
  //
  // A chosen id that is no longer in the catalog falls back too, rather than
  // being sent to the server: a release deleted from another tab would
  // otherwise leave the composer pointed at it and answer "Release not found."
  // on send, which reads as a broken page rather than a stale choice.
  const chosenIsLive = releases.some((release) => release.id === chosenReleaseId);
  const releaseId = (chosenIsLive ? chosenReleaseId : '') || releases[0]?.id || '';

  const selectedRelease = useMemo(
    () => releases.find((release) => release.id === releaseId) || null,
    [releaseId, releases]
  );

  // The cap is per release, so it is counted from this release's pitches only —
  // the same number the scene shows, over the same rule.
  const waitingForSelected = useMemo(
    () => countWaitingPitches(pitches.filter((pitch) => pitch.releaseId === releaseId)),
    [pitches, releaseId]
  );

  const groups = useMemo(() => groupPitchesByRelease(pitches), [pitches]);
  const scopeLine = describeSentPitchScope(pitches.length, truncated);

  if (!PITCHING_ENABLED) return null;

  const loading = authLoading || isLoading;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Promotion
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Pitching</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Send a song to a playlist and see what the owner said.
          {scopeLine ? ` ${scopeLine}.` : ''}
        </p>
        {/* A dual account owns playlists as well as releases. This page is the
            sending side; the inbox is a separate surface with its own shell. */}
        {hasCuratorProfile === true ? (
          <Link
            href="/curator"
            className="motion-focus mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand underline"
          >
            Playlists you own: open your inbox
          </Link>
        ) : null}
      </header>

      {paymentsOn && paymentCancelled ? (
        <p
          role="status"
          className="mt-6 rounded-lg border border-status-warning/30 bg-status-warning/10 p-4 text-sm text-status-warning"
        >
          {PAYMENT_FAILED}
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="mt-6 rounded-lg border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              void load();
            }}
            className="motion-focus mt-2 text-sm font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      <section aria-label="Send a pitch" className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold text-content-primary">Pitch a song</h2>

        {releases.length === 0 ? (
          <p className="rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
            You need a rollout before you can pitch a song from it.{' '}
            <Link href="/dashboard" className="font-semibold text-brand underline">
              Go to your catalog
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <label
                className="block text-[11px] uppercase tracking-[0.16em] text-content-tertiary"
                htmlFor="pitching-release"
              >
                Which rollout
              </label>
              <select
                id="pitching-release"
                className="h-11 w-full appearance-none rounded-xl border border-stroke-default bg-bg-base px-3 text-sm text-content-primary focus:border-brand focus:outline-none"
                value={releaseId}
                onChange={(event) => setChosenReleaseId(event.target.value)}
              >
                {releases.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.artistName
                      ? `${release.title} · ${release.artistName}`
                      : release.title}
                  </option>
                ))}
              </select>
              <p className="font-mono text-[11px] text-content-tertiary">
                {waitingForSelected}/{MAX_WAITING_PITCHES_PER_RELEASE} waiting on a reply for this
                rollout
              </p>
            </div>

            <PitchComposer
              releaseId={releaseId}
              curatorSlug={curatorSlug}
              onClearCurator={() => setCuratorSlug('')}
              initialSongTitle={selectedRelease?.title || ''}
              atLimit={waitingForSelected >= MAX_WAITING_PITCHES_PER_RELEASE}
              // Prepend rather than refetch: the route hands back the whole
              // row, including the release title, so the new pitch can land in
              // its group immediately. Unlike the scene there is no shared
              // cache here that would go stale.
              onSent={(pitch) => setPitches((current) => [pitch, ...current])}
              // A paid pitch is saved as waiting for payment rather than sent,
              // so there is no row to prepend: reload the list instead.
              onChanged={() => void load()}
              onToast={(message, tone) => pushToast(message, tone)}
            />
          </>
        )}
      </section>

      <section aria-label="Pitches sent" className="mt-10 space-y-4">
        <h2 className="text-sm font-semibold text-content-primary">Sent</h2>

        {loading ? (
          <>
            {[0, 1].map((key) => (
              <div
                key={key}
                className="h-24 animate-pulse rounded-xl border border-stroke-default bg-bg-surface"
              />
            ))}
          </>
        ) : groups.length === 0 && !error ? (
          <div className="rounded-xl border border-stroke-default bg-bg-surface p-6 text-center">
            <Radio className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
            <p className="mt-3 text-sm text-content-secondary">
              Nothing pitched yet. Pick a rollout above, choose a playlist and send your first
              song.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.releaseId || 'no-release'} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  {group.releaseId ? (
                    <Link
                      href={`/dashboard?release=${group.releaseId}&scene=pitch`}
                      className="motion-focus truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary hover:text-content-primary"
                    >
                      {group.releaseTitle || 'Untitled rollout'}
                    </Link>
                  ) : (
                    // The release was deleted after these went out. The pitches
                    // are real and a curator may still answer, so they are
                    // named rather than hidden.
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                      Rollout removed
                    </p>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-content-tertiary">
                    {group.pitches.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {group.pitches.map((pitch) => (
                    <SentPitchRow key={pitch.id} pitch={pitch} onChanged={() => void load()} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {paymentsOn ? (
        <section aria-label="Payments" className="mt-10 space-y-4">
          <h2 className="text-sm font-semibold text-content-primary">Payments</h2>
          <PitchPayments />
        </section>
      ) : null}
    </div>
  );
}
