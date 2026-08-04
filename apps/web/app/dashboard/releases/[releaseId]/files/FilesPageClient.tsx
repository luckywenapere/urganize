'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { formatArtistName } from '@/lib/release-execution';
import { FilesPageSkeleton } from '@/components/loading/FilesPageSkeleton';
import { Toast } from '@/components/shared/Toast';
import { AssetSection, type AssetToastTone } from '@/components/releases/AssetSection';

type ToastState = {
  message: string;
  tone: AssetToastTone;
};

// Same NEXT_PUBLIC_ inlining convention as every other flag in the app; the
// asset API routes 404 on the same flag server-side (URG-182).
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';

/**
 * Files get their own dedicated page (URG-165) instead of an inline
 * collapsible segment nested under Tasks in the workspace — cognitively,
 * "files for this release" is a peer of tasks and the calendar, not a child
 * of the task list. Mirrors the calendar page's shape (thin server wrapper +
 * client component, auth guard, "Back to release" link into the workspace)
 * but stays on the standard app tokens — this surface isn't part of the
 * Brand Bible `.cc-island` pilot.
 */
export default function FilesPageClient() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, error, loadCommandCenter } = useReleaseStore();
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    // Flag-off bounce back to the workspace scoped to this release, and the
    // auth guard, combined into one effect (the calendar page precedent).
    if (!FILES_ENABLED) {
      router.replace(`/dashboard?release=${releaseId}`);
      return;
    }
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, releaseId, router, user]);

  const release = releases.find((r) => r.id === releaseId);

  useEffect(() => {
    document.title = release?.title ? `${release.title} | Files | Urganize` : 'Files | Urganize';
  }, [release?.title]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), toast.tone === 'warning' ? 6000 : 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!FILES_ENABLED) return null;

  if (authLoading || isInitialLoading) {
    return <FilesPageSkeleton />;
  }

  if (!release) {
    return (
      <main className="bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
          <div className="flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Release not found.</p>
              <p className="mt-1 text-status-error/80">{error || 'This release may have been deleted.'}</p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-1 text-xs text-content-tertiary hover:text-content-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-bg-base text-content-primary">
      {/* Same side-menu + content layout as the release detail and EPK
          pages (URG-196), so the release menu persists across scenes. */}
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
        <div className="min-w-0">
          {toast ? (
            <div className="mb-4">
              <Toast message={toast.message} tone={toast.tone} />
            </div>
          ) : null}

          {/* Back goes to the workspace scoped to this release, matching the
              content calendar's "Back to release" fix (URG-157) — the
              workspace is the surface users actually live in. */}
          <Link
            href={`/dashboard?release=${releaseId}`}
            className="inline-flex items-center gap-1 text-xs text-content-tertiary hover:text-content-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to release
          </Link>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {formatArtistName(release.artistName)}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">
            {release.title}
          </h1>

          <div className="mt-6">
            <AssetSection
              releaseId={releaseId}
              onToast={(message, tone) => setToast({ message, tone })}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
