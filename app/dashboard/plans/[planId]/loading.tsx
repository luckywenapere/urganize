import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function PlanLoading() {
  return (
    <LoadingScreen
      variant="detail"
      eyebrow="Release Checklist"
      title="Loading your release plan"
      description="Arranging the timeline, progress, and task sequence for this release."
    />
  );
}
