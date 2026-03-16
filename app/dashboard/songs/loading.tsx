import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function SongLibraryLoading() {
  return (
    <LoadingScreen
      variant="dashboard"
      eyebrow="Song Library"
      title="Loading your metadata library"
      description="Preparing your permanent library for song credits, contributors, and release metadata."
    />
  );
}
