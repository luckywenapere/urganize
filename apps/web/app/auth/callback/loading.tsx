import { LoadingScreen } from '@urganize/ui';

export default function AuthCallbackLoading() {
  return (
    <LoadingScreen
      variant="shell"
      eyebrow="Signing in"
      title="Completing sign in"
      description="Securing your session."
    />
  );
}

