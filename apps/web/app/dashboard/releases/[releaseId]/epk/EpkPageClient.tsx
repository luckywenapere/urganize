'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { formatArtistName } from '@/lib/release-execution';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { Toast } from '@/components/shared/Toast';
import { EpkSection } from '@/components/releases/EpkSection';

type ToastState = {
  message: string;
  tone: 'success' | 'error' | 'warning';
};

// Same NEXT_PUBLIC_ inlining convention as every other flag in the app; the
// EPK API routes 404 on the same flag server-side (URG-196).
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

/**
 * The press kit's dedicated page (URG-196), reached from the release page's
 * header links or the workspace's scoped header (the release side menu that
 * used to own this was removed in URG-200). Mirrors the files page's shape
 * (thin server wrapper + client
 * component, flag-off bounce, auth guard) and stays on the standard app
 * tokens — the Brand Bible `.epk-island` treatment belongs to the PUBLIC
 * kit at /epk/[token], not this management surface.
 */
export default function EpkPageClient() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, error, loadCommandCenter } = useReleaseStore();
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    // Flag-off bounce back to the release page, and the auth guard, combined
    // into one effect (the files/calendar page precedent).
    if (!EPK_ENABLED) {
      router.replace(`/dashboard/releases/${releaseId}`);
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
    document.title = release?.title
      ? `${release.title} | Press kit | Urganize`
      : 'Press kit | Urganize';
  }, [release?.title]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), toast.tone === 'warning' ? 6000 : 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!EPK_ENABLED) return null;

  if (authLoading || isInitialLoading) {
    return (
      <main className="bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-4 h-8 w-64" />
          <SkeletonBlock className="mt-8 h-24 w-full" />
        </div>
      </main>
    );
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
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
        <div className="min-w-0">
          {toast ? (
            <div className="mb-4">
              <Toast message={toast.message} tone={toast.tone} />
            </div>
          ) : null}

          {/* Back to the workspace scoped to this release, matching the
              calendar and files pages verbatim (URG-157's founder call). The
              side menu used to be this page's only navigation — removing it
              without this link would have stranded anyone who landed here
              (URG-200). */}
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

          <EpkSection
            releaseId={releaseId}
            onToast={(message, tone) => setToast({ message, tone })}
          />
        </div>
      </div>
    </main>
  );
}
