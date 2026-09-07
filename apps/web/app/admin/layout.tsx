import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';

// The admin hub (founder request, 2026-07-30): every internal dashboard is
// reachable from one place. This layout owns the page frame for all
// /admin/* pages — the outer <main>, padding, and the AdminNav left menu —
// so individual pages render content only. Access control is NOT here: it
// stays server-side on each page's backing API (verifyAdmin / ADMIN_EMAILS),
// with each page client bouncing non-admins to /dashboard.
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen px-4 pb-24 pt-8 text-content-primary sm:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 lg:flex-row lg:gap-10">
        <AdminNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
