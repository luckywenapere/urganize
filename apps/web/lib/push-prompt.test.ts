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
  // origin, and a denied origin never gets another. None of these may ever
  // be 'ask' (a button that silently does nothing). Instead, once a week, a
  // card that only says where to switch it back on (founder call, 2026-11-27).
  it('never asks once the permission is denied, and reminds weekly instead', () => {
    for (const status of ['blocked', 'disabled', 'enabled'] as PushStatus[]) {
      expect(decide(status, 'denied')).toBe('remind-blocked');
      expect(decide(status, 'denied', true)).toBe('skip');
    }
  });

  it('never asks when the status itself reports blocked', () => {
    for (const permission of ['default', 'granted', 'denied'] as PushPermissionState[]) {
      expect(decide('blocked', permission)).toBe('remind-blocked');
      expect(decide('blocked', permission, true)).toBe('skip');
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
          expect(['ask', 'auto-enable', 'remind-blocked', 'skip']).toContain(
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
  // Founder call, 2026-11-27: people with notifications off are reminded every
  // week. The snooze IS that cadence, so it is pinned exactly.
  it('holds for exactly one week', () => {
    expect(PUSH_PROMPT_SNOOZE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// URG-251 Part 2: onboarding's opt-in step already asked on this device.
describe('decidePushPrompt after the onboarding opt-in step', () => {
  it('does not show the soft ask once the step was shown', () => {
    expect(
      decidePushPrompt({ status: 'disabled', permission: 'default', snoozed: false, askedInOnboarding: true })
    ).toBe('skip');
  });

  it('still repairs a granted device silently', () => {
    expect(
      decidePushPrompt({ status: 'disabled', permission: 'granted', snoozed: false, askedInOnboarding: true })
    ).toBe('auto-enable');
  });

  it('asks as before when the step was never shown', () => {
    expect(
      decidePushPrompt({ status: 'disabled', permission: 'default', snoozed: false, askedInOnboarding: false })
    ).toBe('ask');
  });
});
