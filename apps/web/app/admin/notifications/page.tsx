import type { Metadata } from 'next';
import NotificationsPageClient from './NotificationsPageClient';

export const metadata: Metadata = { title: 'Notifications' };

export default function AdminNotificationsPage() {
  return <NotificationsPageClient />;
}
