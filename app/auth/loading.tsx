import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function AuthLoading() {
  return (
    <LoadingScreen
      variant="form"
      eyebrow="Authentication"
      title="Opening your account"
      description="Checking your session and preparing sign-in controls."
    />
  );
}
