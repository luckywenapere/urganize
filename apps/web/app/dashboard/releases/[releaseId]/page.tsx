import { ReleaseWorkspacePage } from '@/components/execution/ReleaseWorkspacePage';

export default async function Page({ params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  return <ReleaseWorkspacePage releaseId={releaseId} />;
}
