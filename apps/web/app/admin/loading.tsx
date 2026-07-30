import { LoadingScreen } from '@urganize/ui';

export default function AdminLoading() {
  return (
    <LoadingScreen
      variant="shell"
      eyebrow="Admin"
      title="Loading admin"
      description="Checking access and preparing the internal dashboards."
    />
  );
}
