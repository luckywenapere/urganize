import type { Metadata } from 'next';
import MoreAdminPageClient from './MoreAdminPageClient';

// Everything behind the side menu's More row (2026-10-18, URG-369), and the
// page the Overview's "All dashboards" row opens.
export const metadata: Metadata = {
  title: 'More',
};

export default function MoreAdminPage() {
  return <MoreAdminPageClient />;
}
