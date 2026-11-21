import { SongListSkeleton } from '@/components/music/parts';

// The same header height and row height as the real Songs screen, so the page
// does not shift when it arrives.
export default function MusicLoading() {
  return (
    <div aria-busy="true" aria-label="Loading music">
      <div className="mb-4 space-y-2">
        <div className="h-6 w-32 animate-pulse rounded bg-bg-elevated" />
        <div className="h-3.5 w-40 animate-pulse rounded bg-bg-elevated" />
      </div>
      <SongListSkeleton />
    </div>
  );
}
