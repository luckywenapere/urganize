import { FolderDetailClientPage } from '@/components/folders/FolderDetailClientPage';

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FolderDetailClientPage folderId={id} />;
}
