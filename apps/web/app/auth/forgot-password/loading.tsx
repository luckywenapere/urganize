import { LoadingScreen } from '@urganize/ui';

export default function ForgotPasswordLoading() {
  return (
    <LoadingScreen
      variant="form"
      eyebrow="Password reset"
      title="Opening reset form"
      description="Loading password reset."
    />
  );
}

