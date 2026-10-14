'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Newspaper } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
// Back goes to the Rollouts tab, not the Artists list (founder, 2026-10-14).
import { CATALOGUE_HREF } from '@/lib/shell-nav';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { bucketReleases, bucketShows } from '@/lib/artist-overview';
import { epkHref, formatCalendarDate, isArtistPageEnabled, releaseHref } from '@/lib/artist-page';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useEventsStore } from '@/stores/useEventsStore';
import { usePressKitsStore } from '@/stores/usePressKitsStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { artistPhotoUrl, saveArtistPhoto } from '@/lib/profile-photo-client';

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

const KIT_COPY = { incomplete: 'Not finished', ready: 'Ready', published: 'Live' } as const;

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-content-primary">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-content-tertiary">{children}</p>;
}

export default function ArtistPageClient() {
  const router = useRouter();
  const params = useParams<{ artistId: string }>();
  const artistId = typeof params?.artistId === 'string' ? params.artistId : '';
  const authLoading = useAuthStore((state) => state.isLoading);

  const artists = useArtistRosterStore((state) => state.artists);
  const rosterLoaded = useArtistRosterStore((state) => state.loaded);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const setArtistPhoto = useArtistRosterStore((state) => state.setArtistPhoto);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const events = useEventsStore((state) => state.events);
  const loadEvents = useEventsStore((state) => state.load);
  const kits = usePressKitsStore((state) => state.entries);
  const loadKits = usePressKitsStore((state) => state.load);

  useEffect(() => {
    if (!ARTIST_PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void loadRoster();
    void loadCommandCenter();
    void loadEvents();
    void loadKits();
  }, [loadRoster, loadCommandCenter, loadEvents, loadKits, router]);

  const artist = artists.find((entry) => entry.id === artistId) ?? null;
  const kit = kits.find((entry) => entry.artistId === artistId)?.kit ?? null;

  const buckets = useMemo(
    () => bucketReleases(releases.filter((release) => release.artistId === artistId)),
    [releases, artistId]
  );
  const shows = useMemo(
    () => bucketShows(events.filter((show) => show.artistId === artistId)),
    [events, artistId]
  );

  const releaseCount = buckets.planned.length + buckets.live.length + buckets.past.length;
  const viewed = artist !== null;
  useEffect(() => {
    if (!viewed) return;
    captureAnalyticsEvent({
      name: 'artist_page_viewed',
      properties: {
        artist_id: artistId,
        releases: releaseCount,
        upcoming_shows: shows.upcoming.length,
        has_kit: Boolean(kit),
      },
    });
    // Once per artist opened; the counts are context, not a reason to re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewed, artistId]);

  if (!ARTIST_PAGE_ENABLED) return null;

  const act = (action: 'open_epk' | 'open_release' | 'open_show') =>
    captureAnalyticsEvent({ name: 'artist_page_action', properties: { artist_id: artistId, action } });

  if (!artist) {
    const waiting = authLoading || !rosterLoaded;
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Link href={CATALOGUE_HREF} className="inline-flex items-center gap-1 text-sm text-content-secondary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Rollouts
        </Link>
        {waiting ? (
          <div className="mt-6 h-32 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" aria-busy="true" />
        ) : (
          <p className="mt-6 text-sm text-content-secondary">We could not find that artist on your team.</p>
        )}
      </div>
    );
  }

  const releaseRow = (release: (typeof releases)[number]) => (
    <li key={release.id}>
      <Link
        href={releaseHref(release.id)}
        onClick={() => act('open_release')}
        className="motion-focus flex items-center gap-3 rounded-lg border border-stroke-default p-2.5 transition-colors hover:border-stroke-strong"
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-stroke-default bg-bg-elevated">
          {release.coverArtUrl ? (
            // Signed URLs expire, so a plain img (the other cover surfaces do the same).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={release.coverArtUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-content-primary">{release.title}</p>
          <p className="text-xs text-content-secondary">
            {release.releaseType === 'ep' ? 'EP' : release.releaseType === 'album' ? 'Album' : 'Single'}
            {' · '}
            {formatCalendarDate(release.releaseDate) ?? 'No date yet'}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
      </Link>
    </li>
  );

  const group = (label: string, list: typeof releases) =>
    list.length === 0 ? null : (
      <div key={label} className="mt-4 first:mt-0">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">{label}</h3>
        <ul className="mt-2 space-y-2">{list.map(releaseRow)}</ul>
      </div>
    );

  const showRow = (show: (typeof events)[number]) => (
    <li key={show.id}>
      <Link
        href={`/dashboard/shows/${encodeURIComponent(show.id)}`}
        onClick={() => act('open_show')}
        className="motion-focus flex items-center justify-between gap-3 rounded-lg border border-stroke-default p-2.5 transition-colors hover:border-stroke-strong"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content-primary">{show.title}</p>
          <p className="text-xs text-content-secondary">
            {[show.venueName, show.city].filter(Boolean).join(', ') || 'Venue to be confirmed'}
            {' · '}
            {show.setStartAt
              ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: show.timezone }).format(new Date(show.setStartAt))
              : 'Time to be confirmed'}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
      </Link>
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Link href={CATALOGUE_HREF} className="inline-flex items-center gap-1 text-sm text-content-secondary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Rollouts
      </Link>

      <header className="flex items-start gap-4">
        <ProfilePhotoPicker
          name={artist.name}
          photoUrl={artist.photoUrl}
          size={72}
          square
          signUrl={artistPhotoUrl(artist.id)}
          save={(path) => saveArtistPhoto(artist.id, path)}
          onChange={(url) => setArtistPhoto(artist.id, url)}
          surface="artist_photo"
          showActions
        />
        <div className="min-w-0 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">Artist</p>
          <h1 className="mt-2 truncate font-display text-2xl font-semibold text-content-primary">{artist.name}</h1>
        </div>
      </header>

      <SectionCard
        title="Press kit"
        action={
          <Link
            href={epkHref(artist.id)}
            onClick={() => act('open_epk')}
            className="motion-focus text-xs font-semibold text-brand hover:underline"
          >
            {kit ? 'Open the press kit' : 'Set up the press kit'}
          </Link>
        }
      >
        {kit ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-content-secondary">
            <span className="inline-flex items-center gap-1.5 font-semibold text-content-primary">
              <Newspaper className="h-4 w-4" aria-hidden /> {KIT_COPY[kit.state]}
            </span>
            {kit.state === 'published' ? <span>urganize.app/k/{kit.slug}</span> : null}
          </div>
        ) : (
          <Empty>This artist has no press kit yet. Set one up and every rollout can use it.</Empty>
        )}
      </SectionCard>

      <SectionCard title="Rollouts">
        {releaseCount === 0 ? (
          <Empty>No rollouts for this artist yet.</Empty>
        ) : (
          <>
            {group('Planned', buckets.planned)}
            {group('Out now', buckets.live)}
            {group('Past', buckets.past)}
          </>
        )}
      </SectionCard>

      <SectionCard title="Shows">
        {shows.upcoming.length === 0 && shows.past.length === 0 ? (
          <Empty>No shows for this artist yet.</Empty>
        ) : (
          <>
            {shows.upcoming.length > 0 ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">Coming up</h3>
                <ul className="mt-2 space-y-2">{shows.upcoming.map(showRow)}</ul>
              </div>
            ) : null}
            {shows.past.length > 0 ? (
              <div className={shows.upcoming.length > 0 ? 'mt-4' : ''}>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">Past</h3>
                <ul className="mt-2 space-y-2">{shows.past.slice(0, 5).map(showRow)}</ul>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>
    </div>
  );
}
