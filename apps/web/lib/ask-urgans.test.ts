import { describe, expect, it } from 'vitest';
import { askUrgansTarget } from './ask-urgans';

describe('askUrgansTarget', () => {
  it('treats Artists, the new front door, like any other page (#876)', () => {
    expect(askUrgansTarget('/dashboard/artists', false)).toBe('chat-page');
    expect(askUrgansTarget('/dashboard/artists', true)).toBe('drawer');
  });

  it('opens the drawer on any other desktop page', () => {
    expect(askUrgansTarget('/dashboard', true)).toBe('drawer');
    expect(askUrgansTarget('/settings', true)).toBe('drawer');
  });

  it('opens the full chat on any other phone page', () => {
    expect(askUrgansTarget('/dashboard', false)).toBe('chat-page');
  });

  it('stays on the full chat when already there, at every width', () => {
    expect(askUrgansTarget('/dashboard/urgans', false)).toBe('chat-page');
    expect(askUrgansTarget('/dashboard/urgans', true)).toBe('chat-page');
  });
});
