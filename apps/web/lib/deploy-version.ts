import { CURRENT_VERSION } from '@urganize/changelog';

/**
 * What is actually deployed here.
 *
 * WHY THIS EXISTS. There was no way to ask the live app what it was running:
 * CURRENT_VERSION reaches the What's New modal, the MCP handshake and an issue
 * report's context, and every one of those is behind a login. So "is live up
 * to date" was a Vercel dashboard trip — and on 2026-09-07, with 21 merges in
 * a day against a Hobby deployment cap, several merges silently did not ship
 * and nobody could tell from the outside.
 *
 * With this, the check is two lines:
 *   curl -s https://app.urganize.app/api/version
 *   git rev-parse --short origin/main
 *
 * PUBLIC ON PURPOSE, and the shape below is the security boundary. A version
 * endpoint that needs a login cannot answer the question it exists for. What
 * it may carry is deliberately small: the deployment id is already public in
 * every asset URL via skew protection, and the repo is private, so a short sha
 * reveals nothing usable. ANYTHING ADDED TO THIS OBJECT IS ADDED TO SOMETHING
 * THE WHOLE INTERNET CAN READ — no env values, no user, no team, no ids.
 */

export type DeployVersion = {
  version: string;
  /** Seven characters, matching `git rev-parse --short`, so the two can be
   *  held side by side without counting digits. */
  commit: string;
  branch: string;
  builtAt: string;
  environment: string;
};

/** Absent, blank or whitespace all mean the same thing: we were not told.
 *  Saying so beats inventing a value — a wrong commit here would send
 *  somebody debugging the wrong deploy. */
const known = (value: string | undefined): string => {
  const trimmed = String(value || '').trim();
  return trimmed || 'unknown';
};

export function buildDeployVersion(input: {
  version?: string;
  commitSha?: string;
  commitRef?: string;
  builtAt?: string;
  environment?: string;
}): DeployVersion {
  const sha = known(input.commitSha);
  return {
    version: known(input.version),
    commit: sha === 'unknown' ? sha : sha.slice(0, 7),
    branch: known(input.commitRef),
    builtAt: known(input.builtAt),
    environment: known(input.environment),
  };
}

/** The live values. Read at request time so a redeploy is reflected without a
 *  code change; `VERCEL_*` are provided by the platform. */
export function readDeployVersion(): DeployVersion {
  return buildDeployVersion({
    version: CURRENT_VERSION,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    commitRef: process.env.VERCEL_GIT_COMMIT_REF,
    builtAt: process.env.BUILD_TIME,
    environment: process.env.VERCEL_ENV,
  });
}
