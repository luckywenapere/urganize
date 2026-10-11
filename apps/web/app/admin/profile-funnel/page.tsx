import type { Metadata } from 'next';
import ProfileFunnelAdminPageClient from './ProfileFunnelAdminPageClient';

export const metadata: Metadata = { title: 'Profile funnel' };

export default function ProfileFunnelAdminPage() {
  return <ProfileFunnelAdminPageClient />;
}
