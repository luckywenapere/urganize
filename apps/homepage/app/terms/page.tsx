import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] px-6 py-24 text-[var(--marketing-text)]">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.2em] text-[var(--marketing-text-subtle)] hover:text-[var(--marketing-text)]"
        >
          ← Back to home
        </Link>

        <h1 className="mt-6 text-4xl font-black tracking-tighter md:text-6xl">
          Terms of Service
        </h1>

        <p className="mt-6 text-[var(--marketing-text-muted)]">
          By using Urganize, you agree to these Terms.
        </p>

        <div className="mt-12 space-y-10 text-[var(--marketing-text-muted)]">
          <section>
            <h2 className="text-2xl font-bold text-[var(--marketing-text)]">Use of Service</h2>
            <p className="mt-3">
              Use Urganize lawfully. Abuse or misuse may result in termination.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[var(--marketing-text)]">Accounts</h2>
            <p className="mt-3">
              You are responsible for your account. We may suspend or permanently delete
              accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[var(--marketing-text)]">Content Ownership</h2>
            <p className="mt-3">
              You own your content. You grant Urganize permission to operate the service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[var(--marketing-text)]">AI Disclaimer</h2>
            <p className="mt-3">
              AI outputs are guidance only. Urganize does not guarantee results.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[var(--marketing-text)]">Payments</h2>
            <p className="mt-3">
              Payments are processed via Paystack. Refunds handled case-by-case.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[var(--marketing-text)]">Liability</h2>
            <p className="mt-3">
              Liability is limited to amounts paid. No indirect damages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[var(--marketing-text)]">Governing Law</h2>
            <p className="mt-3">
              These Terms are governed by Nigerian law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[var(--marketing-text)]">Contact</h2>
            <p className="mt-3">
              <a
                href="mailto:theurganization@gmail.com"
                className="text-[var(--marketing-accent)] hover:opacity-80"
              >
                theurganization@gmail.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-16 flex justify-between border-t border-[var(--marketing-border)] pt-6 text-xs uppercase tracking-[0.2em] text-[var(--marketing-text-subtle)]">
          <span>© The Urganization</span>
          <div className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/subprocessors">Subprocessors</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
