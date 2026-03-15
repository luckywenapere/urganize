'use client';

import Link from 'next/link';

export default function ListenerProfilePage() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto flex min-h-screen max-w-[840px] flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Product Scope</p>
        <h1 className="mt-3 text-[clamp(2.1rem,5vw,3.4rem)] tracking-tight text-content-primary">
          Listener persona generation is not part of Urganize 2.0
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-content-secondary">
          The current product is focused on a simple release checklist workflow for artists, managers, and small labels. Audience persona generation is outside the core release execution scope.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/settings"
            className="rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3 text-sm text-content-primary hover:bg-bg-hover"
          >
            Account Settings
          </Link>
        </div>
      </div>
    </main>
  );
}
