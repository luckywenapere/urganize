import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function SongMetadataLoading() {
  return (
    <LoadingScreen
      variant="detail"
      eyebrow="Song Metadata"
      title="Loading your metadata sheet"
      description="Pulling together credits, publishing, production, and admin details for this song."
    />
  );
}
