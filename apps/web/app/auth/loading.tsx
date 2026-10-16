// Deep import (URG-314): see AuthPageClient.
import { LoadingScreen } from '@urganize/ui/LoadingScreen';

export default function AuthLoading() {
  return (
    <LoadingScreen
      variant="form"
      eyebrow="Authentication"
      title="Opening your account"
    />
  );
}

