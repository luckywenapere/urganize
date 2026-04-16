import { ListenPageClient } from '@/components/tracks/ListenPageClient';

export default async function ListenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ListenPageClient token={token} />;
}
