import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Brief opens only once a rollout has a plan or a recorded idea
 * (2026-10-26, founder). Before that, the Brief tab shows the idea screen.
 * Read from the source since there are no component tests in this repo.
 */

const WEB = join(__dirname, '..');
const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');

describe('the Brief gate', () => {
  const gate = read('components', 'releases', 'BriefIdeaGate.tsx');
  const panel = read('components', 'releases', 'ReleaseScenePanel.tsx');
  const view = read('components', 'workspace', 'WorkspaceView.tsx');

  it('shows the idea screen until there is a plan or an idea, and opens on a new idea', () => {
    expect(gate).toContain('const gated = !hasPlan && Boolean(ideaScreen);');
    expect(gate).toContain('hasIdea ? children : ideaScreen');
    expect(gate).toContain('IDEAS_CHANGED_EVENT');
  });

  it('wraps the Brief scene, with the plan read from the rollout’s activities', () => {
    expect(panel).toContain('<BriefIdeaGate');
    expect(panel).toContain('hasPlan={!onlyPreProductionWork(tasks)}');
    expect(panel).toContain('ideaScreen={briefIdeaScreen}');
  });

  it('hands the Brief the same Ideas card the main view uses', () => {
    expect(view).toContain("briefIdeaScreen={panelBody === 'brief' ? ideasCard() : null}");
    expect(view).toContain('const ideasBanner = bodyIsMainView ? ideasCard() : null;');
  });
});
