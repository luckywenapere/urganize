import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

/**
 * What every `notFound()` and every mistyped address lands on.
 *
 * There was no not-found file before this, so all of it fell to Next's own
 * default: black text on white, in the middle of a product that is dark by
 * default, with no way onward. That is also what a person sees when a link they
 * were sent (a press kit, a DJ pack, a credits form) has been switched off,
 * which is exactly when they need a sentence that explains it and something to
 * press.
 *
 * Deliberately says nothing about WHY. The public pages collapse "never
 * existed", "turned off" and "expired" into one answer on purpose, so that a
 * guessed link can never confirm that something is there.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-content-tertiary">404</p>
      <h1 className="mt-3 font-display text-2xl text-content-primary">We could not find that page</h1>
      <p className="mt-2 text-sm text-content-secondary">
        The link may be old, or it may have been turned off. Check the address, or start again from
        the front page.
      </p>
      <Link
        href="/"
        className="motion-focus mt-6 inline-flex h-11 items-center rounded-full border border-brand/25 bg-brand px-6 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
      >
        Go to Urganize
      </Link>
    </main>
  );
}
