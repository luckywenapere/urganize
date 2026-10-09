import type { Metadata } from 'next';
import SettingsRedirect from '@/app/settings/SettingsRedirect';

// `/dashboard/settings` is not a page either (2026-10-09, v1.92.6). It had no
// route, so a typed, reloaded or shared `/dashboard/settings?settings=…` was the
// 404 with the pop-up drawn over it. Same stub as `/settings`: one client hop to
// `/dashboard?settings=…`, keeping the segment, the section and any hash.
// Signed-out visitors are bounced by /dashboard's own guard, as for /settings.
export const metadata: Metadata = {
  title: 'Settings',
};

export default function DashboardSettingsPage() {
  return <SettingsRedirect />;
}
