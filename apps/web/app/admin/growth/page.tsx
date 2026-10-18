import { redirect } from 'next/navigation';

// Growth was merged into Metrics on 2026-10-18 (URG-369, founder approved the
// slimmed admin): its accounts-per-month and waitlist sections render at the
// bottom of /admin/metrics. Old links and bookmarks land there.
export default function GrowthAdminPage() {
  redirect('/admin/metrics#growth');
}
