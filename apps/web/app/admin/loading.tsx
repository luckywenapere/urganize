import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';

// This route-segment fallback fires during navigation into ANY /admin/* page
// (App Router's automatic Suspense boundary), before that page's own client
// component has even mounted to run its auth-gate check. It can't know which
// sub-page is being navigated to, so it can't reserve stat cards or a table —
// but it uses the SAME skeleton language (AdminPageSkeleton, bare) as every
// page's own gated loading state, so the handoff between this and the page's
// more detailed skeleton is a continuation, not a jarring style swap between
// two unrelated loading UIs (that used to be `LoadingScreen`'s "shell"
// variant here vs. a bare spinner in each page — two different components).
export default function AdminLoading() {
  return <AdminPageSkeleton titleWidth="w-40" />;
}
