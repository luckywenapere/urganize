import { NextResponse } from "next/server";
import { CURRENT_VERSION } from "../../../content/changelog";

/**
 * What is deployed on the marketing site. PUBLIC and unauthenticated.
 *
 * The two Vercel projects deploy independently and can sit at different
 * commits — on 2026-09-07 one exhausted its deployment cap a merge before the
 * other — so checking one says nothing about the other. This is the
 * marketing-site half of the same check:
 *
 *   curl -s https://urganize.app/api/version
 *   git rev-parse --short origin/main
 *
 * DELIBERATELY DUPLICATED from apps/web/lib/deploy-version.ts rather than
 * shared. apps/homepage cannot import from apps/web, and moving five fields
 * into a package for two operational endpoints costs more than it saves. If a
 * third consumer ever appears, that is the moment to promote it — and the
 * shape must stay identical to its sibling, which has the tests.
 *
 * NO AUTH, and none should be added: an endpoint that needs a login cannot
 * answer the question it exists for. Never cached, or it would report the
 * build that happened to be live when the cache filled.
 */
export const dynamic = "force-dynamic";

const known = (value: string | undefined): string => String(value || "").trim() || "unknown";

export async function GET() {
  const sha = known(process.env.VERCEL_GIT_COMMIT_SHA);
  return NextResponse.json(
    {
      version: known(CURRENT_VERSION),
      commit: sha === "unknown" ? sha : sha.slice(0, 7),
      branch: known(process.env.VERCEL_GIT_COMMIT_REF),
      builtAt: known(process.env.BUILD_TIME),
      environment: known(process.env.VERCEL_ENV),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
