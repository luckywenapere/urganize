import { SongListSkeleton } from '@/components/music/parts';
import { HeroSkeleton } from '@/components/music/SongsScreen';

// Home's shape (#1364): the sleeve and record, then the New music list, with
// the same heights as the real screen so nothing shifts when it arrives. The
// top bar and tabs belong to the layout, which stays on screen.
export default function MusicLoading() {
  return (
    <div aria-busy="true" aria-label="Loading music" className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:gap-10 lg:gap-14">
      <HeroSkeleton />
      <div className="md:pt-1">
        <div className="mb-1 mt-5 h-[22px] w-24 animate-pulse rounded bg-content-primary/[0.08] md:mt-0" />
        <SongListSkeleton />
      </div>
    </div>
  );
}
