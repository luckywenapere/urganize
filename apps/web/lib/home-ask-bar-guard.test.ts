import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The phone's UrgAns box on Home (2026-10-07). It once sent through the floating
// drawer, which is hidden on Home, so the message was stored and nothing ever
// sent it. It goes to the full chat page, which picks the message up.
const source = readFileSync(join(__dirname, '..', 'components', 'home', 'HomeAskBar.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Home chat box', () => {
  it('never opens the drawer, which is hidden on Home', () => {
    expect(source).not.toContain('setRailOpen');
  });

  it('sends by opening the full chat page', () => {
    expect(source).toContain("router.push('/dashboard/urgans')");
  });

  it('hands the message to the page that sends it', () => {
    expect(source).toContain('setSendInputOnOpen(true)');
  });

  it('is portalled out of the page, so it stays pinned to the screen', () => {
    // .app-layout carries a transform, which anchors a fixed box inside it to
    // the page instead of the screen.
    expect(source).toContain('createPortal');
    expect(source).toContain('home-dock');
  });

  it('is a phone box only: a computer has the conversation on Home', () => {
    expect(source).toContain('lg:hidden');
    expect(source).not.toMatch(/lg:(block|flex)/);
  });

  it('uses a 16px field, so iOS does not zoom the page on focus', () => {
    expect(source).toContain('text-[16px]');
  });
});
