import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { swipeBackFor, swipeBackTarget } from './swipe-nav';
import { withoutViewer } from './directory-search';

describe('swipe back arrow', () => {
  it('opts in only the pages with no back of their own', () => {
    for (const path of ['/dashboard/directory', '/dashboard/relationships', '/dashboard/opportunities', '/dashboard/press-kits/']) {
      expect(swipeBackFor(path)).toEqual({ href: '/dashboard/artists' });
    }
    // Pages that already carry a back, tabs, and unknown paths get none.
    for (const path of ['/dashboard/credits', '/dashboard/notes', '/dashboard/relationships/p1', '/dashboard/artists', '/dashboard', null]) {
      expect(swipeBackFor(path as string | null)).toBeNull();
    }
  });

  it('goes to the earlier in-app page, else Home, and never off the app or to itself', () => {
    expect(swipeBackTarget('/dashboard/artists', '/dashboard/directory', '/dashboard/home')).toBe('/dashboard/artists');
    expect(swipeBackTarget(null, '/dashboard/directory', '/dashboard/home')).toBe('/dashboard/home');
    expect(swipeBackTarget('/auth', '/dashboard/directory', '/dashboard/home')).toBe('/dashboard/home');
    expect(swipeBackTarget('/dashboard/directory?role=x', '/dashboard/directory', '/dashboard/home')).toBe('/dashboard/home');
  });

  it('the top bar draws it on pushed pages only', () => {
    const src = readFileSync('components/shell/swipe/SwipeTopBar.tsx', 'utf8');
    expect(src).toContain('pagerActive ? null : swipeBackFor(pathname)');
    expect(src).toContain('h-11');
  });
});

describe('Directory hides your own row', () => {
  const people = [{ userId: 'me', displayName: 'Me' }, { userId: 'a', displayName: 'Ada' }];

  it('drops the reader and keeps everyone else; no reader keeps all', () => {
    expect(withoutViewer(people, 'me').map((p) => p.userId)).toEqual(['a']);
    expect(withoutViewer(people, null)).toHaveLength(2);
  });

  it('the page filters people and both shelves through it', () => {
    const src = readFileSync('app/dashboard/directory/DirectoryPageClient.tsx', 'utf8');
    expect(src).toContain('withoutViewer(allPeople, viewerId)');
    expect(src).toContain('withoutViewer(allShelves.featured, viewerId)');
    expect(src).toContain('withoutViewer(allShelves.onTheRise, viewerId)');
  });
});
