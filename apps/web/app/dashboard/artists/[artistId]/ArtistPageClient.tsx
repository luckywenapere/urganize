'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Plus } from '@/components/icons';
import { useShellStore } from '@/stores/useShellStore';
import { useAuthStore } from '@/lib/auth-store';
// Back goes to the Artists tab, the list of artists (founder, 2026-10-14).
import { ARTISTS_HREF } from '@/lib/shell-nav';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { bucketReleases } from '@/lib/artist-overview';
import { formatCalendarDate, isArtistPageEnabled, releaseHref } from '@/lib/artist-page';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { artistPhotoUrl, saveArtistPhoto } from '@/lib/profile-photo-client';
import { ThumbImage } from '@/components/shared/ThumbImage';
import { ArtistCatalogueCard } from '@/components/artists/ArtistCatalogueCard';
import { ArtistFactsCard } from '@/components/artists/ArtistFactsCard';
import { PostingPlanCard } from '@/components/artists/PostingPlanCard';
import { displayReleaseTitle } from '@/types/releases';

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

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

/** The plus a section header carries to add to it: icon only, quiet until
 *  hovered, so it blends with the card (founder, 2026-10-15). */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="motion-focus motion-press -my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
    >
      <Plus className="h-5 w-5" aria-hidden />
    </button>
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
  const openCreateForArtist = useShellStore((state) => state.openCreateForArtist);

  useEffect(() => {
    if (!ARTIST_PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void loadRoster();
    void loadCommandCenter();
  }, [loadRoster, loadCommandCenter, router]);

  const artist = artists.find((entry) => entry.id === artistId) ?? null;

  const buckets = useMemo(
    () => bucketReleases(releases.filter((release) => release.artistId === artistId)),
    [releases, artistId]
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
      },
    });
    // Once per artist opened; the counts are context, not a reason to re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewed, artistId]);

  if (!ARTIST_PAGE_ENABLED) return null;

  const act = (action: 'open_release' | 'new_rollout') =>
    captureAnalyticsEvent({ name: 'artist_page_action', properties: { artist_id: artistId, action } });


  if (!artist) {
    const waiting = authLoading || !rosterLoaded;
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href={ARTISTS_HREF}
          aria-label="Artists"
          title="Artists"
          className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
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
            <ThumbImage
              src={release.coverThumbUrl ?? release.coverArtUrl}
              width={40}
              height={40}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-content-primary">{displayReleaseTitle(release.title)}</p>
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

  // A lone group needs no heading ("Planned" over the only list is noise);
  // headings come back only when they separate planned, out now and past.
  const groupsShown = [buckets.planned, buckets.live, buckets.past].filter((list) => list.length > 0).length;
  const group = (label: string, list: typeof releases) =>
    list.length === 0 ? null : (
      <div key={label} className="mt-4 first:mt-0">
        {groupsShown > 1 ? (
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">{label}</h3>
        ) : null}
        <ul className="space-y-2">{list.map(releaseRow)}</ul>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Link
        href={ARTISTS_HREF}
        aria-label="Artists"
        title="Artists"
        className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Link>

      {/* Golden-ratio header: on a phone the 128px photo takes ~1 part of the
          width and the name ~1.618 parts; the name sits on the photo's upper
          golden line (about 38% down), not floating at its middle. */}
      <header className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-5">
        <ProfilePhotoPicker
          name={artist.name}
          photoUrl={artist.photoUrl}
          size={128}
          square
          signUrl={artistPhotoUrl(artist.id)}
          save={(path) => saveArtistPhoto(artist.id, path)}
          onChange={(url) => setArtistPhoto(artist.id, url)}
          surface="artist_photo"
          // The camera badge already says "add a photo"; the text row only
          // returns once there is a photo to change or remove.
          overlayRemove
        />
        <div className="min-w-0 pt-8">
          <h1 className="line-clamp-2 break-words font-display text-3xl font-semibold leading-tight text-content-primary sm:text-4xl">
            {artist.name}
          </h1>
        </div>
      </header>

      <ArtistFactsCard artistId={artist.id} artistName={artist.name} />

      {/* The Press kit bar left Oct 17, 2026 (founder approved "cuts-3"):
          the artist's bio and contact are edited in a rollout's Pitch this!. */}
      <SectionCard
        title="Rollouts"
        action={
          <AddButton
            label="New rollout"
            onClick={() => {
              act('new_rollout');
              openCreateForArtist(artist.id);
            }}
          />
        }
      >
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

      {/* Posting plan (2026-10-27): what to post between releases. */}
      <PostingPlanCard artistId={artist.id} artistName={artist.name} />

      <ArtistCatalogueCard artistId={artist.id} artistName={artist.name} />
    </div>
  );
}
