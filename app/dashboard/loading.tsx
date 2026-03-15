import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function DashboardLoading() {
  return (
    <LoadingScreen
      variant="dashboard"
      eyebrow="Dashboard"
      title="Loading your releases"
      description="Preparing your release checklist dashboard and saved plans."
    />
  );
}
