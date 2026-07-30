import type { Metadata } from 'next';
import AdminHubClient from './AdminHubClient';

// The admin hub landing (founder request, 2026-07-30). Previously this
// route just redirected to /dashboard; it's now the front door to every
// internal dashboard, with the AdminNav (in layout.tsx) as the side menu.
export const metadata: Metadata = {
  title: 'Admin',
};

export default function AdminPage() {
  return <AdminHubClient />;
}
