'use client';

import Link from 'next/link';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { panelClass } from './panelClass';

/**
 * Admin's only mobile entry point (2026-08-17). The desktop identity card's
 * pinned Admin link (WorkspaceIdentityPanel) is `hidden lg:block`, and no
 * other mobile surface (MobileNavBar, the topbar) carries an Admin link at
 * all — this was the one item in the desktop nav with no mobile equivalent
 * anywhere. Rather than build a new mobile menu for a single conditional
 * link, it lives here: the Account tab already renders identically at every
 * breakpoint and is one tap from MobileNavBar's "You".
 *
 * Same `isAdmin` selector WorkspaceIdentityPanel gates its own Admin row
 * with — see that store's field comment for why it's never cached (a stale
 * `true` would render a link that 403s on the server-side `verifyAdmin`
 * re-check every /admin route already does).
 *
 * (Comment-only touch, 2026-08-17: this file's last real edit was in the PR
 * above; this line exists only to give a fresh commit a real diff inside
 * apps/web, verifying the deploy pipeline after a GitHub webhook outage that
 * had been silently dropping pushes to Vercel — see the commit message.)
 */
export function AdminSection() {
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);

  if (!isAdmin) return null;

  return (
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </h2>
      <div className="rounded-lg border border-stroke-subtle bg-bg-elevated p-4">
        <p className="text-sm text-content-secondary">
          Waitlist, growth, onboarding, and the other internal tools.
        </p>
        <Link
          href="/admin"
          className="mt-4 inline-block rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:bg-bg-hover"
        >
          Open Admin
        </Link>
      </div>
    </section>
  );
}
