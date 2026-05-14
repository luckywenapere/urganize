import Link from "next/link";

export default function TeamPage() {
  return (
    <main className="min-h-screen bg-[var(--marketing-bg)] px-6 py-24 text-[var(--marketing-text)]">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="text-sm text-[var(--marketing-text-muted)] transition-colors hover:text-[var(--marketing-text)]"
        >
          ← Back to home
        </Link>

        <h1 className="mt-6 text-4xl font-black tracking-tighter md:text-5xl">Team</h1>
        <p className="mt-4 text-[var(--marketing-text-muted)]">The team behind Urganize.</p>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6">
            <div className="text-xl font-bold">Lucky Wenapere</div>
            <div className="mt-1 font-semibold text-[var(--marketing-accent)]">Co-Founder and CEO</div>
          </div>

          <div className="rounded-2xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6">
            <div className="text-xl font-bold">Tedum King</div>
            <div className="mt-1 font-semibold text-[var(--marketing-accent)]">Co-Founder</div>
          </div>

          <div className="rounded-2xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6">
            <div className="text-xl font-bold">Jacob Ngalato</div>
            <div className="mt-1 font-semibold text-[var(--marketing-accent)]">Co-Founder and CTO</div>
          </div>

          <div className="rounded-2xl border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6">
            <div className="text-xl font-bold">Bobson Prosper</div>
            <div className="mt-1 font-semibold text-[var(--marketing-accent)]">Founding Engineer</div>
          </div>
        </div>
      </div>
    </main>
  );
}
