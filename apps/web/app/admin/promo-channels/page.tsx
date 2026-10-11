import type { Metadata } from 'next';
import PromoChannelsAdminPageClient from './PromoChannelsAdminPageClient';

export const metadata: Metadata = {
  title: 'Promo channels',
};

export default function PromoChannelsAdminPage() {
  return <PromoChannelsAdminPageClient />;
}
