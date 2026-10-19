import { describe, expect, it } from 'vitest';
import { TURN_DROPPED_NOTE, failedTurnOutcome } from './turn-failure';

// Pins the fix for the reported bug: a rename that ran on the server, then a
// lost reply, came back as the keyword router's "Let's plan it".
describe('failedTurnOutcome', () => {
  it('never hands a turn to the router once the server had it', () => {
    expect(failedTurnOutcome({ sent: true, reachedServer: true, online: true })).toBe('dropped');
    expect(failedTurnOutcome({ sent: true, reachedServer: true, online: false })).toBe('dropped');
  });

  it('treats a fetch that failed while online as possibly received', () => {
    expect(failedTurnOutcome({ sent: true, reachedServer: false, online: true })).toBe('dropped');
  });

  it('lets the router answer only when the request never got out', () => {
    expect(failedTurnOutcome({ sent: true, reachedServer: false, online: false })).toBe('router');
    expect(failedTurnOutcome({ sent: false, reachedServer: false, online: true })).toBe('router');
  });

  it('says it calmly', () => {
    expect(TURN_DROPPED_NOTE).toBe('Connection dropped. Check whether that went through.');
  });
});
