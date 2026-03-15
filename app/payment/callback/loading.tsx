import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function PaymentCallbackLoading() {
  return (
    <LoadingScreen
      variant="shell"
      eyebrow="Billing"
      title="Checking payment status"
      description="Confirming your payment and updating access."
    />
  );
}
