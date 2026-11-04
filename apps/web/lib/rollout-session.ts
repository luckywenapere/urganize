// One session per rollout (Nov 2, 2026, founder: "each session would be limited
// to only an individual release"). A session is an ordinary saved UrgAns chat
// whose id is worked out from the person and the rollout, the way Home's chat
// uses the person's id (lib/chappi/home-chat.ts): any device finds it again,
// and nothing new is stored. Private to its owner like every chat, so each
// teammate has their own session for a rollout.
//
// The hash is not cryptographic and does not need to be: the id only has to be
// the same every time and unlikely to meet another chat's, and 128 bits do
// that. The result is shaped like a v5 uuid so a uuid column accepts it.

function hash32(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const hex8 = (value: number) => value.toString(16).padStart(8, '0');

function sessionIdFrom(input: string): string {
  const parts = [0x9e3779b1, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f].map((seed) => hex8(hash32(input, seed)));
  const flat = parts.join('');
  const variant = ((parseInt(flat[16], 16) & 0x3) | 0x8).toString(16);
  return [
    flat.slice(0, 8),
    flat.slice(8, 12),
    `5${flat.slice(13, 16)}`,
    `${variant}${flat.slice(17, 20)}`,
    flat.slice(20, 32),
  ].join('-');
}

export function rolloutSessionIdFor(
  userId: string | null | undefined,
  releaseId: string | null | undefined
): string | null {
  if (!userId || !releaseId) return null;
  return sessionIdFrom(`rollout-session:${userId}:${releaseId}`);
}

/**
 * One chat per project, per person (2026-11-04, #1074), the same way a rollout
 * has one: the project page's box talks to it, so its conversation stays about
 * that project. A different prefix, so it never meets a rollout session.
 */
export function projectSessionIdFor(
  userId: string | null | undefined,
  recordId: string | null | undefined
): string | null {
  if (!userId || !recordId) return null;
  return sessionIdFrom(`project-session:${userId}:${recordId}`);
}
