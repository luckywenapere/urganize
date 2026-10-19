// What the chat does when a typed UrgAns turn fails part-way (URG bug, Oct 2026).
//
// The reported case: "Change the title of the song to 'Honest'" renamed the
// rollout on the server, the streamed reply never reached the phone, and the
// client fell back to the keyword router, which read "song" and opened the
// planner. Once a request has reached /api/urgans its tools may have run, so a
// local guess at what the person meant is wrong either way. The router only
// answers when the request never left the device.

/** Said when the reply was lost after the request reached the server. */
export const TURN_DROPPED_NOTE = 'Connection dropped. Check whether that went through.';

export type FailedTurnInput = {
  /** True once fetch was called. Before that (token, local commands) nothing left the device. */
  sent: boolean;
  /** True once fetch resolved: the server has the request, tools may have run. */
  reachedServer: boolean;
  /** navigator.onLine at the moment of failure (true when unknown). */
  online: boolean;
};

/**
 * 'router': the request never got out (a pre-flight failure before fetch,
 * or fetch rejected while offline), so the typed-command router may answer.
 * 'dropped': it may have run on the server, so say so calmly and refresh the
 * rollout data instead of guessing.
 */
export function failedTurnOutcome({ sent, reachedServer, online }: FailedTurnInput): 'router' | 'dropped' {
  if (!sent) return 'router';
  if (reachedServer) return 'dropped';
  // A fetch that rejects while the device is online may still have been
  // received (the connection can reset before the response headers), so only
  // a confirmed-offline failure counts as "never got out".
  return online ? 'dropped' : 'router';
}

/** navigator.onLine, defaulting to online where it is unavailable. */
export function isDeviceOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}
