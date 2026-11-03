import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cameFromHistory, canViewTransition, fadeIn, morphUpdate, prefersReducedMotion } from './morph';
import { morphScreenKey } from '@/components/motion/MainMorph';

// Morph, not jump (Oct 18, 2026). Oyin's six iPhone recordings showed the More
// sheet, the Rollout menu and Home's team list appearing and vanishing in one
// frame, a rollout scene (Fill in details) flashing the tab row and a
// Rollouts-shaped skeleton on its way in, two tabs lit at once while a tab's
// page loaded, the UrgAns question jumping half a screen as the keyboard
// moved, and a hard cut on every new page. lib/morph.ts is the one system that
// fixes them; this pins its pieces in place.

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('morph helpers outside a browser', () => {
  it('treat the server as reduced motion and never start a transition there', () => {
    expect(prefersReducedMotion()).toBe(true);
    expect(canViewTransition()).toBe(false);
    expect(cameFromHistory(Date.now())).toBe(false);
    expect(fadeIn(null)).toBe(false);
  });

  it('still runs the update when no view transition is possible', () => {
    let ran = 0;
    morphUpdate(() => {
      ran += 1;
    });
    expect(ran).toBe(1);
  });
});

describe('which screen changes fade in', () => {
  it('gives the two catalogue tabs one key (their list fade already runs)', () => {
    expect(morphScreenKey('/dashboard/artists')).toBe('catalogue');
    expect(morphScreenKey('/dashboard')).toBe('catalogue');
  });

  it('tells Home, AI and an artist apart', () => {
    expect(morphScreenKey('/dashboard/home')).toBe('/dashboard/home');
    expect(morphScreenKey('/dashboard/urgans')).toBe('/dashboard/urgans');
    expect(morphScreenKey('/dashboard/artists/a1')).toBe('/dashboard/artists/a1');
  });

  it('never reads search params in the shell (that would end static rendering under it)', () => {
    const main = strip(read('components/motion/MainMorph.tsx'));
    expect(main).not.toMatch(/useSearchParams/);
    const view = strip(read('components/workspace/WorkspaceView.tsx'));
    expect(view).toMatch(/fadeInScreen\(\);\s*\}, \[scopedReleaseId\]\);/);
  });
});

describe('the fade never anchors fixed elements', () => {
  it('animates opacity only', () => {
    const morph = strip(read('lib/morph.ts'));
    expect(morph).toMatch(/element\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/);
    expect(morph).not.toMatch(/element\.animate\([^)]*transform/);
  });

  it('wraps the page under the chrome, not the chrome', () => {
    const frame = read('components/app/WorkspaceFrame.tsx');
    expect(frame).toMatch(/<MainMorph>\{children\}<\/MainMorph>/);
  });
});

describe('sheets and pop-overs animate in and out', () => {
  const bar = strip(read('components/shell/BottomBar.tsx'));
  const panel = strip(read('components/workspace/TasksPanel.tsx'));
  const css = read('app/globals.css');

  it('keeps the More sheet mounted for its exit and slides it', () => {
    expect(bar).toMatch(/usePresence\(moreOpen\)/);
    expect(bar).toMatch(/morph-presence fixed inset-0 z-\[170\]/);
    expect(bar).toMatch(/className="morph-sheet-scrim /);
    expect(bar).toMatch(/className="morph-sheet absolute/);
  });

  it('loads the More sheet wordmark eagerly, so it does not pop in late', () => {
    expect(bar).toMatch(/<Logo size="sm" className="opacity-95" priority \/>/);
  });

  it('slides the Rollout menu and closes it before a scene opens', () => {
    expect(panel).toMatch(/morph-presence fixed inset-0 z-\[170\]/);
    expect(panel).toMatch(/className="morph-sheet absolute/);
    expect(panel).toMatch(/closeMobilePanels\(\);\s*if \(changesScene && phoneMenuOpen && !prefersReducedMotion\(\)\) \{\s*window\.setTimeout\(\(\) => action\.onClick\(\), MORPH_EXIT_MS\);/);
  });


  it('makes a closing surface click-through and scopes data-state to morph surfaces', () => {
    expect(css).toMatch(/\.morph-presence\[data-state='closed'\] \{\s*pointer-events: none;/);
    expect(css).not.toMatch(/^\[data-state='closed'\]/m);
  });

  it('turns every morph animation off with reduced motion', () => {
    const block = css.slice(css.indexOf('Morph, not jump'));
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.morph-sheet,[\s\S]*animation: none !important/);
    expect(block).toMatch(/::view-transition-group\(\*\)/);
  });
});

describe('rollout scenes open without a navigation', () => {
  const hook = strip(read('components/workspace/useSceneOverlay.ts'));
  const view = strip(read('components/workspace/WorkspaceView.tsx'));

  it('writes the scene param with the History API on the scene host, inside a view transition', () => {
    expect(hook).toMatch(/window\.history\.pushState\(null, '', url\)/);
    expect(hook).toMatch(/window\.history\.replaceState\(null, '', url\)/);
    expect(hook).toMatch(/morphUpdate\(/);
    expect(hook).toMatch(/writeSceneUrl\(router, pathname, url, wasOpen \? 'replace' : 'push'\)/);
    expect(hook).not.toMatch(/router\.(push|replace)\(url, \{ scroll: false \}\);\s*\}\s*,\s*\[pathname, router, searchParams\]/);
  });

  it('tells the transition when the new scene has drawn', () => {
    expect(view).toMatch(/morphCommitted\(\);/);
  });
});

describe('the tab row lights the tapped tab at once', () => {
  const nav = strip(read('components/shell/SubNav.tsx'));
  it('slides the highlight on the tap, before the page arrives', () => {
    expect(nav).toMatch(/setPendingKey\(tab\.key\)/);
    expect(nav).toMatch(/const activeKey = pendingKey \?\? routeKey;/);
    expect(nav).toMatch(/\[data-tab-lit="true"\]/);
  });
  it('draws hover boxes only on devices that hover (no sticky tap box on a phone)', () => {
    expect(nav).not.toMatch(/'text-content-secondary hover:/);
    expect(nav).toMatch(/\[@media\(hover:hover\)\]:hover:bg-bg-hover\/60/);
  });
});

describe('AI glides with the keyboard', () => {
  it('runs the open/closed flip in a view transition where the names exist', () => {
    const bridge = strip(read('components/providers/KeyboardViewportBridge.tsx'));
    expect(bridge).toMatch(/if \(toggled && document\.querySelector\('\.morph-urgans-hero'\)\) \{\s*morphUpdate\(apply\);/);
    const chat = read('components/chappi/ChappiConversation.tsx');
    expect(chat).toMatch(/morph-urgans-hero flex flex-col items-center gap-4/);
    expect(chat).toMatch(/morph-urgans-composer mx-auto w-full max-w-2xl/);
  });
});

describe('the Ready to distribute row never shoves the timeline', () => {
  it('seeds only an answer with open items and reveals a late arrival', () => {
    const hook = strip(read('components/releases/useDistributionStatus.ts'));
    expect(hook).toMatch(/if \(hasOpenItems\(value\)\) lastOpenAnswer\.set\(releaseId, value\);\s*else lastOpenAnswer\.delete\(releaseId\);/);
    const strip_ = strip(read('components/workspace/DistributionStatusStrip.tsx'));
    expect(strip_).toMatch(/useDistributionStatus\(releaseId, \{ seed: row \}\)/);
    expect(strip_).toMatch(/if \(row && !seeded\) return <ArrivalReveal>\{section\}<\/ArrivalReveal>;/);
  });
});
