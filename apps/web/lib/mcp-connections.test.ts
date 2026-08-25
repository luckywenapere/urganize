// Tests for the connected-apps state rules.
//
// Small surface, but it decides two things a user acts on: whether a row still
// offers a Disconnect button, and whether they are told they turned an app off
// or it simply stopped calling. Getting the second one backwards would tell
// somebody they revoked something they did not.

import { describe, expect, it } from 'vitest';
import {
  describeMcpConnection,
  isMcpConnectionRevocable,
  resolveMcpConnectionState,
  type McpConnection,
} from './mcp-connections';

const NOW = new Date('2026-08-25T12:00:00.000Z');
const later = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

describe('resolveMcpConnectionState', () => {
  it('calls a live token active', () => {
    expect(
      resolveMcpConnectionState({ revokedAt: null, expiresAt: later(60_000), now: NOW })
    ).toBe('active');
  });

  it('calls a lapsed token expired', () => {
    expect(resolveMcpConnectionState({ revokedAt: null, expiresAt: later(-1), now: NOW })).toBe(
      'expired'
    );
  });

  it('prefers revoked over expired, because only one of them is something you did', () => {
    expect(
      resolveMcpConnectionState({
        revokedAt: NOW.toISOString(),
        expiresAt: later(-100_000),
        now: NOW,
      })
    ).toBe('revoked');
  });

  it('calls the exact expiry instant expired', () => {
    expect(
      resolveMcpConnectionState({ revokedAt: null, expiresAt: NOW.toISOString(), now: NOW })
    ).toBe('expired');
  });

  it('treats an unreadable expiry as expired rather than implying it is live', () => {
    expect(resolveMcpConnectionState({ revokedAt: null, expiresAt: '', now: NOW })).toBe('expired');
    expect(resolveMcpConnectionState({ revokedAt: null, expiresAt: 'soon', now: NOW })).toBe(
      'expired'
    );
  });
});

describe('isMcpConnectionRevocable', () => {
  it('still offers Disconnect on an expired connection', () => {
    // The access token expires hourly; the REFRESH token is what carries the
    // grant and outlives it. "Expired" means idle, not harmless — so hiding the
    // button here would leave a user unable to cut off an app that can still
    // come back.
    expect(isMcpConnectionRevocable('expired')).toBe(true);
    expect(isMcpConnectionRevocable('active')).toBe(true);
  });

  it('offers nothing on one already disconnected', () => {
    expect(isMcpConnectionRevocable('revoked')).toBe(false);
  });
});

describe('describeMcpConnection', () => {
  const base: McpConnection = {
    id: 'c1',
    clientName: 'Claude',
    createdAt: NOW.toISOString(),
    lastUsedAt: null,
    state: 'active',
  };

  it('says disconnected first, whatever the usage says', () => {
    expect(
      describeMcpConnection({ ...base, state: 'revoked', lastUsedAt: NOW.toISOString() })
    ).toBe('Disconnected');
  });

  it('says never used when nothing has called', () => {
    expect(describeMcpConnection(base)).toBe('Never used');
  });

  it('names the day it was last used', () => {
    expect(describeMcpConnection({ ...base, lastUsedAt: '2026-08-20T09:00:00.000Z' })).toBe(
      'Last used Aug 20'
    );
  });

  it('degrades rather than printing Invalid Date', () => {
    expect(describeMcpConnection({ ...base, lastUsedAt: 'whenever' })).toBe('Last used recently');
  });
});
