import { ReleaseWorkspacePage } from '@/components/execution/ReleaseWorkspacePage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReleaseWorkspacePage releaseId={id} />;
}
