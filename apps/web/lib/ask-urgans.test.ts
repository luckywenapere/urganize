import { describe, expect, it } from 'vitest';
import { askUrgansTarget } from './ask-urgans';

describe('askUrgansTarget', () => {
  it("fills Home's own box on a phone's Home", () => {
    expect(askUrgansTarget('/dashboard/home', false)).toBe('home-composer');
  });

  it('sends a computer on Home to the UrgAns page, since Home has no chat there', () => {
    expect(askUrgansTarget('/dashboard/home', true)).toBe('chat-page');
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
