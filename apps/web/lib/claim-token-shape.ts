// The shape check for a claim token, in a file with no Node imports so client
// code can use it. lib/claim.ts re-exports it for the server.

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{24,64}$/;

/** Cheap check before any database read, so a made-up path never costs one. */
export function isValidClaimToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_SHAPE.test(token);
}
