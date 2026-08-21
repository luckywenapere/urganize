import { describe, expect, it } from 'vitest';
import {
  decidePushPrompt,
  PUSH_PROMPT_SNOOZE_MS,
  pushPromptSnoozeKey,
  type PushPromptDecision,
} from './push-prompt';
import type { PushPermissionState, PushStatus } from './push';

const decide = (
  status: PushStatus,
  permission: PushPermissionState,
  snoozed = false
): PushPromptDecision => decidePushPrompt({ status, permission, snoozed });

describe('decidePushPrompt', () => {
  it('asks exactly once in the only askable state', () => {
    expect(decide('disabled', 'default')).toBe('ask');
  });

  it('does not ask again while the user is snoozed', () => {
    expect(decide('disabled', 'default', true)).toBe('skip');
  });

  // The whole reason this function exists: a browser hands out one prompt per
  // origin, and a denied origin never gets another. Every one of these must
  // stay 'skip' or we ship a button that silently does nothing.
  it('never asks once the permission is denied', () => {
    for (const status of ['blocked', 'disabled', 'enabled'] as PushStatus[]) {
      expect(decide(status, 'denied')).toBe('skip');
    }
  });

  it('never asks when the status itself reports blocked', () => {
    for (const permission of ['default', 'granted', 'denied'] as PushPermissionState[]) {
      expect(decide('blocked', permission)).toBe('skip');
    }
  });

  it('never asks when this device cannot do push at all', () => {
    for (const permission of ['default', 'granted', 'denied'] as PushPermissionState[]) {
      expect(decide('unsupported', permission)).toBe('skip');
    }
  });

  it('stays quiet for a device that is already subscribed', () => {
    expect(decide('enabled', 'granted')).toBe('skip');
    expect(decide('enabled', 'granted', true)).toBe('skip');
  });

  it('repairs a granted-but-unsubscribed device without any prompt', () => {
    expect(decide('disabled', 'granted')).toBe('auto-enable');
  });

  // A snooze is about not nagging someone who has not answered yet. It must
  // not suppress the silent repair, which shows no UI to be nagged by.
  it('repairs a granted device even while snoozed', () => {
    expect(decide('disabled', 'granted', true)).toBe('auto-enable');
  });

  it('covers every status/permission pair without falling through', () => {
    const statuses: PushStatus[] = ['unsupported', 'blocked', 'enabled', 'disabled'];
    const permissions: PushPermissionState[] = ['default', 'granted', 'denied'];
    for (const status of statuses) {
      for (const permission of permissions) {
        for (const snoozed of [false, true]) {
          expect(['ask', 'auto-enable', 'skip']).toContain(
            decidePushPrompt({ status, permission, snoozed })
          );
        }
      }
    }
  });
});

describe('pushPromptSnoozeKey', () => {
  // Per-user, not per-device: push rows are keyed (user, device) server-side,
  // so a second account on the same browser genuinely has no push and is owed
  // its own one-time ask.
  it('scopes the record to the user', () => {
    expect(pushPromptSnoozeKey('user-a')).not.toBe(pushPromptSnoozeKey('user-b'));
    expect(pushPromptSnoozeKey('user-a')).toContain('user-a');
  });

  it('stays under the urganize namespace every other persisted key uses', () => {
    expect(pushPromptSnoozeKey('user-a').startsWith('urganize.')).toBe(true);
  });
});

describe('PUSH_PROMPT_SNOOZE_MS', () => {
  // Guards the deliberate deviation from the "a dismissal is forever" house
  // rule: the ask comes back, but not soon enough to be nagging. If someone
  // needs it permanent they raise this constant, and this test is the place
  // that records the intent either way.
  it('holds for weeks, not hours', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(PUSH_PROMPT_SNOOZE_MS).toBeGreaterThanOrEqual(14 * day);
    expect(PUSH_PROMPT_SNOOZE_MS).toBeLessThanOrEqual(180 * day);
  });
});
