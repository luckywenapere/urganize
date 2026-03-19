import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function CreditCollectionLoading() {
  return (
    <LoadingScreen
      variant="form"
      eyebrow="Submit your credits"
      title="Opening your credit form"
      description="Loading the release details and requested role."
    />
  );
}
