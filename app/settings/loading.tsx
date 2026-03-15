import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function SettingsLoading() {
  return (
    <LoadingScreen
      variant="form"
      eyebrow="Settings"
      title="Loading account settings"
      description="Preparing your profile, billing, and team preferences."
    />
  );
}
