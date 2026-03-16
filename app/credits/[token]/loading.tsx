import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function CreditCollectionLoading() {
  return (
    <LoadingScreen
      variant="form"
      eyebrow="Credits Collection"
      title="Opening the credits form"
      description="Preparing the contributor steps for this song."
    />
  );
}
