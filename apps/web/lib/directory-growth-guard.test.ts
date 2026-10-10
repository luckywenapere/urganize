import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Structural checks for the directory's weekly numbers (2026-10-10). They read
// the real sources, so a new read or a rewired route that breaks one of the
// rules fails here instead of showing a wrong number to the founder.

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the directory growth reads', () => {
  const server = stripComments(read('lib/directory-growth-server.ts'));

  it('page every table read and never cap one with a bare limit', () => {
    expect(server).not.toMatch(/\.limit\(/);
    // Every query goes through readAll (the shared paged read); a raw await on a
    // client query would silently stop at 1,000 rows.
    const fromCount = (server.match(/client\s*\n?\s*\.from\(/g) || []).length;
    const readAllCount = (server.match(/readAll\(/g) || []).length;
    expect(fromCount).toBeGreaterThan(0);
    expect(readAllCount).toBeGreaterThanOrEqual(fromCount - 2); // requests read twice, rollouts per chunk
  });

  it('read releases for claimed people in chunks, not one huge in-list', () => {
    expect(server).toContain('inChunks(claimedUserIds, IN_LIST_CHUNK)');
  });

  it('order every paged read by a unique column so a page boundary never skips a row', () => {
    const orders = server.match(/\.order\('id'/g) || [];
    expect(orders.length).toBeGreaterThanOrEqual(5);
  });

  it('only ever read: nothing here inserts, updates, deletes or upserts', () => {
    expect(server).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });

  it('keep test rollouts out of the rollouts claimed people started', () => {
    expect(server).toContain('readTestRelease');
  });
});

describe('where the numbers are served', () => {
  it('GET /api/admin/directory and the cockpit both load the weekly numbers behind verifyAdmin', () => {
    for (const path of ['app/api/admin/directory/route.ts', 'app/api/admin/cockpit/route.ts']) {
      const source = stripComments(read(path));
      expect(source).toContain('loadDirectoryGrowth(');
      expect(source.indexOf('verifyAdmin(request)')).toBeGreaterThan(-1);
      expect(source.indexOf('verifyAdmin(request)')).toBeLessThan(source.indexOf('loadDirectoryGrowth('));
    }
  });

  it('leave our own accounts out in both', () => {
    for (const path of ['app/api/admin/directory/route.ts', 'app/api/admin/cockpit/route.ts']) {
      const source = stripComments(read(path));
      expect(source).toContain('internalAccountEmails()');
      expect(source).toMatch(/loadDirectoryGrowth\([^)]*exclusion/);
    }
  });

  it('a failed directory read never takes the rest of the page down', () => {
    expect(stripComments(read('app/api/admin/cockpit/route.ts'))).toMatch(/loadDirectoryGrowth\([^]*?\.catch\(/);
    expect(stripComments(read('app/api/admin/directory/route.ts'))).toMatch(/try \{[^]*?loadDirectoryGrowth\([^]*?\} catch/);
  });
});

describe('the directory events', () => {
  it('are captured where the request is sent and answered', () => {
    expect(stripComments(read('app/api/directory/requests/route.ts'))).toContain('captureRequestSent(');
    expect(stripComments(read('app/api/directory/requests/[requestId]/route.ts'))).toContain('captureRequestAnswered(');
  });

  it('only capture after the reply is built, through afterResponse, never a bare void', () => {
    const server = stripComments(read('lib/directory-events-server.ts'));
    expect(server).toContain('afterResponse(');
    expect(server).not.toMatch(/(^|[\s;])void\s+[A-Za-z_(]/);
  });

  it('put the profile view beacon on the public profile page', () => {
    expect(read('app/p/[slug]/page.tsx')).toContain('<ProfileViewBeacon');
  });

  it('declare the three events with only allowlisted properties: no free text', () => {
    const shared = read('lib/analytics/shared.ts');
    const block = (name: string) => {
      const start = shared.indexOf(`  ${name}: {`);
      expect(start).toBeGreaterThan(-1);
      return shared.slice(start, shared.indexOf('};', start));
    };
    for (const name of ['profile_viewed', 'request_sent', 'request_answered']) {
      const text = block(name);
      // A property typed plain `string` would be free text. Only `string | null`
      // for the role (already validated against the vocabulary) is allowed.
      const stringTypes = text.match(/:\s*string(?!\s*\|\s*null)/g) || [];
      expect(stringTypes, name).toEqual([]);
      expect(text).not.toMatch(/\b(note|reply_text|name|query|email|slug)\b\s*:/);
    }
  });

  it('never hand a note, a reply or a name to the property builders output', () => {
    const events = stripComments(read('lib/directory-events.ts'));
    expect(events).not.toMatch(/return\s*\{[^}]*\b(note|reply:|displayName|name:)/);
  });
});
