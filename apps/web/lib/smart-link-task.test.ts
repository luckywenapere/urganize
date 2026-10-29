import { describe, expect, it } from 'vitest';
import { captureRowLabel, isSmartLinkTask, isSmartLinkTaskTitle, smartLinkWording } from './smart-link-task';

describe('the capture row label (#852)', () => {
  it('says Smart link only once the rollout can have one', () => {
    expect(captureRowLabel(true)).toBe('Smart link');
    expect(captureRowLabel(false)).toBe('Fan emails');
    expect(captureRowLabel(null)).toBe('Fan emails');
  });
});

describe('the smart link task', () => {
  it('knows the planner task and the playbook steps', () => {
    expect(isSmartLinkTask({ title: 'Set up and share your smart link' })).toBe(true);
    expect(isSmartLinkTask({ title: 'Set up the EP pre-save link' })).toBe(true);
    expect(isSmartLinkTask({ title: 'Anything', templateTaskId: 'w6_setup_presave' })).toBe(true);
  });
  it('leaves reminders and campaigns alone', () => {
    expect(isSmartLinkTaskTitle('1 day out: pre-save reminder to fans')).toBe(false);
    expect(isSmartLinkTaskTitle('Pre-save campaign goes live')).toBe(false);
    expect(isSmartLinkTask({ title: 'Pitch Spotify editorial', templateTaskId: 'editorial_pitch' })).toBe(false);
  });
  it('says smart link, never pre-save link', () => {
    expect(smartLinkWording('Set up the pre-save link')).toBe('Set up the smart link');
    expect(smartLinkWording('Pre-save link for the EP')).toBe('Smart link for the EP');
    expect(smartLinkWording('Pre-save campaign goes live')).toBe('Pre-save campaign goes live');
  });
});
