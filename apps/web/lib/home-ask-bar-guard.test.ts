import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Home chat box once sent through the floating drawer, which is hidden on
// Home, so on a desktop the message was stored and nothing ever sent it. It goes
// to the full chat page now, on every width.
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
});
