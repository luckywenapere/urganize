import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every overlay that must close on the OS back-swipe. Each one has to reach
// useBackToClose: directly, through useDialogFocus's `onBackClose`, or through
// DialogPanel (which passes its onClose). A new overlay that skips it lets Back
// navigate away from the page underneath. (Settings keeps its own history
// logic in lib/settings-history.ts; the tour is left out on purpose: its last
// step opens Settings, which would leave a stale entry.)
const OVERLAYS = [
  'components/share/ShareSheet.tsx',
  'components/releases/ReleaseSetupSheet.tsx',
  'components/releases/ReleaseDetailsSheet.tsx',
  'components/tasks/TaskOutcomeSheet.tsx',
  'components/tasks/CoverArtPromptSheet.tsx',
  'components/tasks/TaskQuickCreateModal.tsx',
  'components/tasks/TaskUIEngine.tsx',
  'components/urgans-actions/UrgansLockedSheet.tsx',
  'components/shell/swipe/SwipeSheet.tsx',
  'components/shell/CommandBar.tsx',
  'components/releases/CreateReleaseModal.tsx',
  'components/workspace/DeleteReleaseDialog.tsx',
  'components/workspace/ArchiveReleaseDialog.tsx',
  'components/workspace/ChangeReleaseArtistDialog.tsx',
  'components/planner/PlannerIntakeModal.tsx',
  'components/directory/WorkRequestSheet.tsx',
  'components/support/ReportIssueDialog.tsx',
];

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('overlays close on the OS back-swipe', () => {
  for (const path of OVERLAYS) {
    it(`${path} goes through the back-to-close hook`, () => {
      const source = strip(read(path));
      const ok =
        /useBackToClose\(/.test(source) || /onBackClose\s*[:,]/.test(source) || /<DialogPanel\b/.test(source);
      expect(ok).toBe(true);
    });
  }

  it('DialogPanel and useDialogFocus hand the close to the hook', () => {
    expect(strip(read('components/shared/DialogPanel.tsx'))).toMatch(/onBackClose:\s*onClose/);
    expect(strip(read('lib/use-dialog-focus.ts'))).toMatch(/useBackToClose\(open,\s*onBackClose/);
  });

  it('Settings keeps its own history logic and does not use the shared hook', () => {
    const source = strip(read('components/settings/SettingsModal.tsx'));
    expect(source).not.toMatch(/onBackClose|useBackToClose/);
  });

  it('the hook only touches history through the injected environment', () => {
    const lib = strip(read('lib/back-to-close.ts'));
    const outsideEnv = lib.slice(0, lib.indexOf('export function browserBackEnv'));
    expect(outsideEnv).not.toMatch(/window\./);
  });
});
