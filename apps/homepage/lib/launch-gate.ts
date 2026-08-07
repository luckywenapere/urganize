import { connection } from "next/server";

/**
 * Time-gate for a page that must start serving itself at a scheduled moment,
 * with nobody flipping a switch.
 *
 * Used by /download for the private Android launch (8 August 2026). The
 * alternative — the repo's usual `NEXT_PUBLIC_FEATURE_*` env flag — needs a
 * person awake at the launch hour to change it in Vercel and redeploy; this
 * needs nothing.
 *
 * Two things make it work, and both matter:
 *
 * 1. `connection()` waits for a real request. During prerendering it never
 *    resolves, so Next cannot bake the pre-launch answer into a static page
 *    at build time. The calling page must ALSO export `dynamic = 'force-dynamic'`
 *    — verify it shows as `ƒ` (not `○`) in the build output.
 * 2. The clock is read here rather than in the page body. `Date.now()` inside a
 *    component trips `react-hooks/purity`, which is correct about components
 *    needing to be idempotent; a plain async helper is the honest place for a
 *    deliberately time-dependent read.
 */
export async function hasLaunched(launchAt: number): Promise<boolean> {
  await connection();
  return Date.now() >= launchAt;
}
