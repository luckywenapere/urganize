import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('invite pages render the real state on the server', () => {
  it('the accept page reads the invite on the server and passes it down', () => {
    const page = read('app/invite/accept/page.tsx');
    expect(page).toContain('readInitialInvite');
    expect(page).toContain("export const dynamic = 'force-dynamic'");
    expect(page).not.toContain("'use client'");
  });

  it('/join/<code> renders the invite itself instead of redirecting to a loading page', () => {
    const join = read('app/join/[code]/page.tsx');
    expect(join).toContain('readInitialInvite');
    expect(join).not.toContain('redirect(');
  });

  it('the client does not ask again when the server answered, and never reads search params', () => {
    const client = read('app/invite/accept/InviteAcceptPageClient.tsx');
    expect(client).toContain('if (initialLoad) return;');
    expect(client).not.toContain('useSearchParams');
  });

  it('the public GET and the pages share one reader', () => {
    expect(read('app/api/invites/[token]/route.ts')).toContain('loadInviteMetadata');
  });
});
