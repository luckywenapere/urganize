import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isHardPaywallGatedPath } from '@/lib/team-billing';

// The UrgAns page for a team behind the wall (/locked/urgans). It only works if
// it sits where the wall does not reach, and if nothing around it treats it as
// part of the walled app.

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the AI page behind the wall', () => {
  it('lives under /locked, outside every path the wall redirects from', () => {
    // Read from source: importing the card pulls in the browser Supabase client.
    const match = /URGANS_HUB_PATH = '([^']+)'/.exec(read('components/billing/WallUrgansCard.tsx'));
    expect(match?.[1]).toBe('/locked/urgans');
    expect(isHardPaywallGatedPath('/locked/urgans')).toBe(false);
  });

  it('is left alone by the browser-side 402 redirect', () => {
    const source = read('lib/access-redirect.ts');
    // /locked is a safe path and so is everything under it.
    expect(source).toContain("'/locked'");
    expect(source).toContain('`${safe}/`');
  });

  it('is treated as a flow page by the app shell, so no walled chrome draws over it', () => {
    const shell = read('components/app/AppShell.tsx');
    expect(shell).toContain("pathname?.startsWith('/locked/')");
  });

  it('exists as a page, and the wall card links to it', () => {
    expect(read('app/locked/urgans/page.tsx')).toContain('UrgansHubClient');
    expect(read('components/billing/TeamWall.tsx')).toContain('<WallUrgansCard');
  });

  it('sends a pack bought from the wall offer back to this page (#1243)', () => {
    expect(read('components/billing/TeamWall.tsx')).toContain('<WallCreditsOffer');
    expect(read('components/billing/WallCreditsOffer.tsx')).toContain("const RETURN_TO = '/locked/urgans'");
  });

  it('bounces a team whose switches are off, and a signed-out visitor', () => {
    const client = read('app/locked/urgans/UrgansHubClient.tsx');
    expect(client).toContain("router.replace('/auth')");
    expect(client).toContain('!CREDITS_ENABLED || !CHAPPI_ENABLED');
  });
});
