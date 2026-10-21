import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pushStatusLabel } from './push-status-label';

describe('pushStatusLabel', () => {
  it('names a blocked browser or phone', () => {
    expect(pushStatusLabel('blocked', false)).toBe('Blocked in this browser');
    expect(pushStatusLabel('blocked', true)).toBe('Blocked on this phone');
  });
  it('names an unsupported device', () => {
    expect(pushStatusLabel('unsupported', false)).toBe('Not available here');
  });
  it('says nothing when there is a button instead', () => {
    expect(pushStatusLabel('enabled', false)).toBeNull();
    expect(pushStatusLabel('disabled', false)).toBeNull();
  });
  it('is shown in the row where the button would be', () => {
    const source = readFileSync(join(__dirname, '..', 'components', 'settings', 'PushNotificationsSection.tsx'), 'utf8');
    expect(source).toContain('pushStatusLabel(shownStatus, native)');
  });
});
