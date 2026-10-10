/**
 * Starting a Paystack checkout, with a time limit (2026-10-09, v1.92.11).
 *
 * The three routes that start a checkout (a plan purchase, a plan change, the
 * retired card trial) called Paystack with a bare `fetch`. If Paystack accepted
 * the connection and went quiet, the customer sat on a spinner until the
 * platform's own limit, minutes later, and the reservation row stayed pending.
 *
 * This answers in at most {@link PAYSTACK_INIT_TIMEOUT_MS}. A timeout or a
 * network failure comes back as an ordinary failed response (504, with a plain
 * message), so the routes' existing "not ok" branch runs: it drops the pending
 * payment row and tells the customer to try again.
 *
 * Only for starting a checkout. Starting one is safe to give up on: nothing is
 * charged until the customer finishes on Paystack's own page, and a retry uses a
 * fresh reference. Calls that CHANGE money state (a refund, creating a
 * subscription) must not be given up on this way, because an abort after
 * Paystack has already acted leaves the outcome unknown.
 */

export const PAYSTACK_INIT_URL = 'https://api.paystack.co/transaction/initialize';

/** Long enough for a slow Paystack, short enough that a customer does not give up first. */
export const PAYSTACK_INIT_TIMEOUT_MS = 15_000;

export const PAYSTACK_INIT_TIMEOUT_MESSAGE = 'Paystack took too long to answer. Please try again.';
export const PAYSTACK_INIT_UNREACHABLE_MESSAGE = 'We could not reach Paystack. Please try again.';

function failedInit(message: string): Response {
  return new Response(JSON.stringify({ status: false, message }), {
    status: 504,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function fetchPaystackInit(
  init: Omit<RequestInit, 'signal'>,
  url: string = PAYSTACK_INIT_URL
): Promise<Response> {
  // A controller and a timer, the pattern lib/paystack-server.ts uses, so the
  // wait is cleared once Paystack answers.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAYSTACK_INIT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return failedInit(timedOut ? PAYSTACK_INIT_TIMEOUT_MESSAGE : PAYSTACK_INIT_UNREACHABLE_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}
