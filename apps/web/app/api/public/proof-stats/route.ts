import { NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_shared/auth";
import { internalAccountEmails } from "@/app/api/admin/_shared";
import { summarizeProofRollup, type ProofRollupRow } from "@/lib/proof-stats";

// GET /api/public/proof-stats (#1248): the three numbers on the marketing
// homepage ("44 music teams have planned 64 releases and 1,600 tasks"), counted
// live instead of typed in.
//
// Public on purpose: it returns three totals and nothing else, never an email
// or a name. Our own accounts are left out with the same rule /admin/metrics
// uses; test rollouts are left out by the database function. Cached at the
// edge for an hour, so a busy homepage costs one query an hour.
export const dynamic = "force-dynamic";

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!admin) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const { data, error } = await admin.rpc("marketing_proof_rollup");
  if (error || !Array.isArray(data)) {
    console.error("[proof-stats] count failed", error?.message);
    return NextResponse.json({ error: "Could not count." }, { status: 503 });
  }

  const internal = internalAccountEmails();
  const stats = summarizeProofRollup(data as ProofRollupRow[], (email) => internal.has(email));

  return NextResponse.json(
    { ...stats, countedAt: new Date().toISOString() },
    { headers: { "Cache-Control": CACHE } },
  );
}
