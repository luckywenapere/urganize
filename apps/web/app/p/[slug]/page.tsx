import type { Metadata } from 'next';
import { PublicPreSavePage } from '@/components/pre-save/PublicPreSavePage';

export const dynamic = 'force-dynamic';

type PublicPreSaveRouteProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Pre-save',
    description: 'Join the Urganize pre-save list for an upcoming release.',
  };
}

export default async function PreSaveSlugPage({ params }: PublicPreSaveRouteProps) {
  const { slug } = await params;

  return <PublicPreSavePage slug={slug} />;
}
