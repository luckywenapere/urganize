import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminBackButton, AdminBottomBar, AdminNav } from '@/components/admin/AdminNav';
import { AppWallpaperMark } from '@/components/app/AppWallpaper';

// The admin hub (founder request, 2026-07-30): every internal dashboard is
// reachable from one place. This layout owns the page frame for all
// /admin/* pages — the outer <main>, padding, and the AdminNav left menu —
// so individual pages render content only. Access control is NOT here: it
// stays server-side on each page's backing API (verifyAdmin / ADMIN_EMAILS),
// with each page client bouncing non-admins to /dashboard.
//
// Since 2026-10-18 the menu is the desktop sidebar (lg+) and a bottom bar on
// phone, and every page below a tab opens with a back button to that tab
// (AdminBackButton), drawn here so no page carries its own.
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    // Phone (2026-10-15, URG-313): /admin has no app chrome, so it clears the
    // iOS status bar / notch and the home indicator itself.
    <main className="min-h-screen px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-[calc(2rem+env(safe-area-inset-top,0px))] text-content-primary sm:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 lg:flex-row lg:gap-10">
        <AdminNav />
        <div className="min-w-0 flex-1">
          <AdminBackButton />
          {children}
        </div>
      </div>
      <AdminBottomBar />
      <AppWallpaperMark />
    </main>
  );
}
