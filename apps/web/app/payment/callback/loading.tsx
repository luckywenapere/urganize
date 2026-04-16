import { LoadingScreen } from '@urganize/ui';

export default function PaymentCallbackLoading() {
  return (
    <LoadingScreen
      variant="shell"
      eyebrow="Billing"
      title="Checking payment status"
      description="Confirming your payment."
    />
  );
}

