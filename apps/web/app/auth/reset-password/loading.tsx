import { LoadingScreen } from '@urganize/ui';

export default function ResetPasswordLoading() {
  return (
    <LoadingScreen
      variant="form"
      eyebrow="Password reset"
      title="Opening reset form"
      description="Checking your recovery session."
    />
  );
}

