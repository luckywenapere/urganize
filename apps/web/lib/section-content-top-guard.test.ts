import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Artists / Rollouts tab jump fix (Oyin approved the mocks Oct 18, 2026:
// "Ship"). On a phone the first card sat 20px under the tab row on Artists and
// 60px under it on Rollouts, and the + popped in on one tab only. vitest here
// is node-only, so these hold the rules at the source: both pages start their
// list with the same spacer and nothing else, and the tab row draws its own
// action in the first frame.
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
const artists = read('app/dashboard/artists/ArtistsPageClient.tsx');
const catalogue = read('components/workspace/CatalogueView.tsx');
const view = read('components/workspace/WorkspaceView.tsx');
const skeleton = read('components/loading/WorkspaceSkeleton.tsx');
const subNav = read('components/shell/SubNav.tsx');

const SPACER = '<div className="pt-5 sm:pt-6" />';

describe('one content top for the Artists section', () => {
  it('Artists and Rollouts open with the same spacer', () => {
    expect(artists).toContain(SPACER);
    expect(catalogue).toContain(SPACER);
    expect(skeleton).toContain(SPACER);
  });

  it('Rollouts adds nothing above a bare list', () => {
    // The workspace wrapper's phone pt-6 is for an open rollout only.
    expect(view).toContain("${showCatalogue ? '' : 'pt-6'} sm:px-6 lg:block lg:px-0 lg:pt-0");
    // The skeleton's wrapper follows the same rule.
    expect(skeleton).toContain("${isFocused ? 'pt-6' : ''} sm:px-6 lg:block lg:px-0 lg:pt-0");
    // The card's mt-4 only when the Showing line or the filter bar is above it.
    expect(catalogue).toContain("${artistName || showFilters ? 'mt-4 ' : ''}section-list-enter");
    expect(catalogue).not.toMatch(/className="mt-4 overflow-hidden rounded-2xl/);
  });

  it('the loading shapes carry no title or chips, just one card of rows', () => {
    const catalogueSkeleton = skeleton.slice(skeleton.indexOf('function CatalogueSkeleton'));
    const body = catalogueSkeleton.slice(0, catalogueSkeleton.indexOf('\n}\n'));
    expect(body).toContain('rounded-2xl border border-stroke-default bg-bg-surface');
    expect(body).not.toContain('h-9 w-40');
    expect(body).not.toContain('max-w-xs rounded-full');
    expect(artists).not.toContain('h-16 animate-pulse rounded-2xl border');
  });

  it('the tab row draws its action itself, in the first frame, on every tab', () => {
    expect(subNav).not.toContain('empty:hidden');
    expect(subNav).toContain('<TabAction action={activeTab?.action ?? null} />');
    expect(subNav).toContain('className="flex h-9 w-9 shrink-0 items-center justify-center"');
    expect(catalogue).not.toContain('SUBNAV_SLOT_PHONE_END');
    expect(catalogue).not.toContain('phoneAddButton');
  });

  it('the list entrance is opacity only and motion-allowed only', () => {
    const css = read('app/globals.css');
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference) {\n  .section-list-enter'));
    expect(block.startsWith('@media (prefers-reduced-motion: no-preference)')).toBe(true);
    const keyframes = css.slice(css.indexOf('@keyframes section-list-fade'));
    const frames = keyframes.slice(0, keyframes.indexOf('\n}\n'));
    expect(frames).toContain('opacity: 0');
    expect(frames).not.toContain('transform');
    expect(artists).toContain('section-list-enter');
  });
});
