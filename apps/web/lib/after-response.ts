import { after } from 'next/server';

/**
 * Work that should happen after the reply has gone, without being lost
 * (2026-10-09, v1.92.12).
 *
 * A bare `void somePromise()` at the end of a route handler is not tied to the
 * request. Once the response is sent a serverless function may be frozen, and
 * whatever was still running is cut off or delayed until the next request wakes
 * the same instance. That is how an assignment notification, a "who changed
 * this" row or the founder's "a team just paid" alert can quietly never happen.
 *
 * Next's `after()` is the supported way: it keeps the invocation alive until the
 * work finishes, without delaying the reply. This wraps it with the two things
 * every one of these call sites needs:
 *
 *  - a failure is logged and never rethrown, because the thing being reported
 *    (a task update, a payment) already succeeded and must stay succeeded;
 *  - outside a request (a script, a unit test) `after()` throws, so the work is
 *    started right away and not waited on, which is what the bare `void` did.
 */
export function afterResponse(label: string, task: () => Promise<unknown>): void {
  const run = async (): Promise<void> => {
    try {
      await task();
    } catch (error) {
      console.error(`[after-response] ${label} failed:`, error);
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}
