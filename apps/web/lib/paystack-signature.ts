import crypto from 'crypto';

/**
 * Checks the `x-paystack-signature` header against the raw request body
 * (2026-10-09, v1.92.13). Paystack signs the body with HMAC-SHA512 using the
 * account's secret key and sends the result as lower-case hex.
 *
 * It answers true or false and never throws, whatever the caller sent.
 *
 * Why this is not the three lines it used to be inside the route: those compared
 * the length of the two HEX STRINGS and then built buffers from them. A forged
 * signature of the right length that is not hex ("zzzz...", 128 of them) turns
 * into an empty or short buffer, `crypto.timingSafeEqual` throws a RangeError on
 * buffers of different byte length, and the money webhook answered 500 instead of
 * 401. Nothing was exposed (the request was still refused) but a 500 on this route
 * reads as an outage, and Paystack retries it. So the lengths that must match are
 * the BYTE lengths of the two buffers, checked after decoding.
 */
export function validatePaystackSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');

  // `Buffer.from(x, 'hex')` stops at the first non-hex pair, so anything that is
  // not a complete hex digest comes back shorter than the real one.
  if (received.length !== expected.length) return false;

  // Hex is decoded without checking the whole string, so a value that decodes to
  // the right length can still carry stray characters after the part that
  // decoded. Re-encode and compare to the input to refuse those.
  if (received.toString('hex') !== signature.toLowerCase()) return false;

  return crypto.timingSafeEqual(expected, received);
}
