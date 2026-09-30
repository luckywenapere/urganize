import { summarizeTrace, type RoutingTrace } from './model-router';

/**
 * The one line a routed request leaves in the server log.
 *
 * model-router.ts is pure and stays that way, so the console write lives here,
 * shared by the single-shot wrappers (routed.ts) and the UrgAns runner.
 *
 * What is worth a line:
 *   shadow   every request. Seeing what the router WOULD have done is the point
 *            of running in shadow.
 *   live     only a request where something happened: it changed model, was cut
 *            short by the clock, or failed. One that went to its first model and
 *            worked is not news, and at chat volume it would bury the ones that
 *            are.
 *   off      never. A request the router did not touch leaves no router line,
 *            which is part of "off behaves exactly as before".
 */
export function shouldLogTrace(trace: RoutingTrace, failed: boolean): boolean {
  if (trace.mode === 'off') return false;
  return trace.mode === 'shadow' || trace.hops.length > 0 || failed || trace.degraded !== undefined;
}

export function logRoutingTrace(trace: RoutingTrace, failed: boolean): void {
  if (shouldLogTrace(trace, failed)) {
    console.info('[ai-router]', JSON.stringify(summarizeTrace(trace)));
  }
}
