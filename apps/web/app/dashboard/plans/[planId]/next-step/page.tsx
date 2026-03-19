'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function PlanNextStepPage() {
  const params = useParams<{ planId: string }>();
  const planId = Array.isArray(params?.planId) ? params.planId[0] : params?.planId;
  const releaseHref = planId ? `/dashboard/plans/${planId}` : '/dashboard';

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto flex min-h-screen max-w-[760px] flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Release Checklist</p>
        <h1 className="mt-3 text-[clamp(2.2rem,5vw,3.5rem)] tracking-tight text-content-primary">
          This flow now lives on the release page
        </h1>
        <p className="mt-4 max-w-xl text-sm text-content-secondary">
          Urganize 2.0 uses one checklist-driven release workflow. Separate AI next-step generation is no longer part of the main product experience.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={releaseHref}
            className="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
          >
            Open Release Checklist
          </Link>
          <Link
            href="/dashboard"
            className="rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3 text-sm text-content-primary hover:bg-bg-hover"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
