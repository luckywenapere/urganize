import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Phone tap targets reach 44px (QA F-08). The look stays; `.hit-44` widens the
// tap area with a ::before, so a row never moves. Each file below owns a small
// control that was 24 to 40px.
const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const FILES = [
  'components/home/v2/OneThing.tsx',
  'components/chappi/ChappiAttachMenu.tsx',
  'components/tasks/TaskCompletionCheckbox.tsx',
  'app/dashboard/artists/ArtistsPageClient.tsx',
  'components/workspace/TasksPanel.tsx',
  'app/dashboard/directory/DirectoryPageClient.tsx',
  'components/pitching/PitchComposer.tsx',
  'components/settings/ReleasesSection.tsx',
  'components/settings/TeammatesSection.tsx',
  'components/settings/WorkspaceArtistSection.tsx',
  'components/settings/ReferralInviteSection.tsx',
  'app/auth/forgot-password/page.tsx',
  'app/auth/reset-password/page.tsx',
  'app/curator/CuratorInboxPageClient.tsx',
  'components/directory/WorkRequestSheet.tsx',
  'components/home/NpsPrompt.tsx',
  'components/releases/ReleaseDetailsSheet.tsx',
  'components/releases/ReleaseSetupSheet.tsx',
  'components/shell/swipe/UrgAnsPane.tsx',
  'components/share/ShareSheet.tsx',
  'components/workspace/DistributionChecklist.tsx',
];

describe('44px tap targets', () => {
  it('the helper adds no layout size and centres a 44px area', () => {
    const css = read('app/globals.css');
    const block = css.slice(css.indexOf('.hit-44::before'));
    expect(block).toContain("content: ''");
    expect(block).toContain('position: absolute');
    expect(block).toMatch(/width: max\(100%, 44px\)/);
    expect(block).toMatch(/height: max\(100%, 44px\)/);
  });

  it.each(FILES)('%s uses the 44px tap area on its small controls', (file) => {
    expect(read(file)).toContain('hit-44');
  });

  it('the shared icon button gets it unless it draws a tooltip', () => {
    const src = readFileSync(join(ROOT, '..', '..', 'packages/ui/src/Button.tsx'), 'utf8');
    expect(src).toContain("tooltip ? 'tooltip' : 'hit-44 relative'");
  });

  it('the home carousel dots are 44px tall', () => {
    expect(read('components/home/v2/OneThing.tsx')).toContain('-my-[10px] grid h-11');
  });
});
