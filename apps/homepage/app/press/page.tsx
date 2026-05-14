// app/press/page.tsx
import Link from "next/link";

export default function PressPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] px-6 py-24 text-[var(--marketing-text)]">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="text-sm text-[var(--marketing-text-muted)] transition-colors hover:text-[var(--marketing-text)]"
        >
          ← Back to home
        </Link>

        <h1 className="mt-6 text-4xl font-black tracking-tighter md:text-5xl">Press Kit</h1>
        <p className="mt-4 text-[var(--marketing-text-muted)]">
          Logos, product description, and contact for press inquiries.
        </p>

        <div className="mt-10 space-y-6">
          <div className="rounded-2xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6">
            <h2 className="text-xl font-semibold">Short description</h2>
            <p className="mt-2 text-[var(--marketing-text-muted)]">
              Urganize is one workspace for music management teams — task assignment, versioned asset storage, and pipeline visibility from demo to drop. Built by music industry veterans for the people actually running the campaigns.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6">
            <h2 className="text-xl font-semibold">Media contact</h2>
            <p className="mt-2 text-[var(--marketing-text-muted)]">
              <a
                className="text-[var(--marketing-accent)] hover:opacity-80"
                href="mailto:contact@urganize.app?subject=Urganize%20-%20Press"
              >
                contact@urganize.app
              </a>
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6">
            <h2 className="text-xl font-semibold">Logos</h2>
            <a
              href="/press/urganize-logo.zip"
              download
              className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-6 py-3 text-[var(--marketing-text)] transition-all hover:border-[var(--marketing-text)] hover:bg-[var(--marketing-surface-muted)]"
            >
              Download Logos (ZIP)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
