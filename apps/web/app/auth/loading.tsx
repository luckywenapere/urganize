import { LoadingScreen } from '@urganize/ui';

export default function AuthLoading() {
  return (
    <LoadingScreen
      variant="form"
      eyebrow="Authentication"
      title="Opening your account"
      description="Checking your session and loading sign-in."
    />
  );
}

