import { LoadingScreen } from '@urganize/ui';

export default function AdminLoading() {
  return (
    <LoadingScreen
      variant="shell"
      eyebrow="Admin"
      title="Redirecting to dashboard"
      description="Preparing your workspace and sending you to the main release view."
    />
  );
}

