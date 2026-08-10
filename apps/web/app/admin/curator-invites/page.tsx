import type { Metadata } from 'next';
import CuratorInvitesAdminPageClient from './CuratorInvitesAdminPageClient';

export const metadata: Metadata = {
  title: 'Playlist owners',
};

export default function CuratorInvitesAdminPage() {
  return <CuratorInvitesAdminPageClient />;
}
