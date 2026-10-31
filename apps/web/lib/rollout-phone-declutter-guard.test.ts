import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Rollout view declutter on a phone (founder approved the mocks Oct 18, 2026:
// "Do what's best for our users"). vitest here is node-only, so these hold the
// rules at the source. Every cut is a hide or a move; the computer is unchanged.
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
const view = read('components/workspace/WorkspaceView.tsx');
const header = read('components/workspace/RolloutPhoneHeader.tsx');
const subNav = read('components/shell/SubNav.tsx');
const panel = read('components/workspace/TasksPanel.tsx');
const timeline = read('components/releases/TimelineScene.tsx');
const strip = read('components/workspace/DistributionStatusStrip.tsx');

describe('phone rollout declutter', () => {
  it('hides the Artists / Rollouts tabs while a rollout is open, and only then', () => {
    expect(subNav).toContain('useRolloutPhoneChrome((state) => state.rolloutOpen)');
    expect(subNav).toContain('if (tabs.length === 0 || rolloutOpen) return null;');
    // SubNav is still the phone-only row.
    expect(subNav).toContain('className="shell-band-sub lg:hidden"');
    expect(view).toContain('const phoneRolloutOpen = Boolean(scopedReleaseId);');
    expect(view).toContain('setPhoneRolloutOpen(phoneRolloutOpen);');
    // Leaving the workspace hands the tabs back.
    expect(view).toContain('useEffect(() => () => setPhoneRolloutOpen(false), [setPhoneRolloutOpen]);');
  });

  it('keeps one count on the phone: no Motion bar and no phase line on the phone timeline', () => {
    expect(view).toContain('<RolloutPhoneHeader');
    expect(view).not.toMatch(/>\s*Motion\s*</);
    expect(header).toContain('rolloutMetaLine(releaseDate)');
    expect(header.match(/\{done\}\/\{total\}/g)).toHaveLength(1); // the one slim line, sticky
    // The phase strip only draws off the phone.
    expect(timeline).toMatch(/\{phone \? \([\s\S]*?\) : \([\s\S]*?<RolloutPhaseStrip/);
  });

  it('puts search and the menu in the header, and the menu opens the same sheet', () => {
    expect(header).toContain('aria-label="Search activities"');
    expect(header).toContain('aria-label="Rollout menu"');
    expect(header).toContain('data-tour="rollout-menu"');
    // Mounted through usePresence for its slide down (morph pass, Oct 18, 2026).
    expect(panel).toContain('usePresence(phoneMenu && hasMobileMenu && phoneMenuOpen)');
    expect(panel).toContain('{phoneMenu && hasMobileMenu && menuPresence.mounted ? (');
    expect(panel).toContain('<RolloutMenuSheet');
  });

  it('has no floating Rollout menu pill on the phone', () => {
    expect(panel).not.toContain('MOBILE_DOCK_TRIGGER_CLASS');
    expect(panel).not.toMatch(/<Menu className="h-4 w-4" aria-hidden="true" \/>\s*Rollout menu/);
    expect(panel).not.toContain('hasMobileDockControls');
  });

  it('shows no readiness checklist: the work is plan tasks, only warnings stay as a line (#851)', () => {
    expect(view).toContain('row={!isDesktopViewport}');
    expect(strip).toContain('issuesLeftOnRollout(data)');
    expect(strip).not.toContain('DistributionChecklist');
    // Empty blocks never render.
    expect(strip).toContain('if (rejections.length === 0 && left.errors.length + left.warnings.length === 0) return null;');
  });

  it('hides search behind the header icon and swaps the Info popover for a colour key', () => {
    expect(timeline).toContain('phoneSearchOpen ? (');
    expect(timeline).toContain('<TimelineColourKey timeline={timeline} />');
    expect(timeline).toContain("label: 'Overdue'");
    expect(timeline).toContain("'Catch up'");
    expect(timeline).toContain("label: 'To do'");
    expect(timeline).toContain("label: 'Milestone'");
  });

  it('folds past weeks into Catch up and ends the list with Done earlier, but never while searching', () => {
    expect(timeline).toContain('fold={phone && !plan.filtering}');
    expect(timeline).toContain('foldPastWeeks(timeline)');
    expect(timeline).toContain('data-timeline-catch-up');
    expect(timeline).toContain('data-timeline-done-earlier');
    expect(timeline).toContain('Done earlier</span>');
  });

  it('has no search row above the Activities list on a phone (Oct 31, 2026)', () => {
    expect(panel).toContain('<div className="hidden lg:contents" data-activities-phone-search-hidden>');
  });

  it('heads weeks with human dates, never an ISO date', () => {
    expect(timeline).toContain('phoneWeekHeading(group.week, releaseDate)');
    expect(timeline).not.toContain('isoForDayOffset(releaseDate, group.week.startDay)');
  });

  it('keeps word tags for overdue and blocked work beside the dots', () => {
    expect(timeline).toContain("(item.tone === 'overdue' || item.tone === 'blocked') ? TONE_LABEL[item.tone]");
  });

  // URG-360 (v1.157.10): the Activities view on a phone got the same row, so
  // neither phone view draws the old "Before you order distribution" card.
  it('never draws the old distribution card on either phone view (Timeline or Activities)', () => {
    // Every phone mount of the strip asks for the row, whatever the view.
    expect(view).not.toMatch(/row=\{[^}]*panelBody/);
    expect(view.match(/<DistributionStatusStrip\b/g)).toHaveLength(1);
    // The phone column only ever mounts the strip off the computer, and the
    // computer mounts it only off the timeline, so the card stays desktop-only.
    expect(view).toContain('{isDesktopViewport ? null : distributionStatusStrip}');
    expect(view).toContain("{isDesktopViewport && panelBody !== 'timeline' ? distributionStatusStrip : null}");
    // The "Before you order distribution" card is gone: its work is plan tasks (#851).
    expect(strip).not.toContain('Before you order distribution');
  });

  it('keeps the header slim: one sticky line, no cover tile, eyebrow or progress bar (founder approved mock, Oct 31, 2026)', () => {
    expect(header).toContain('<SlimTitle');
    expect(header).toContain('className="sticky z-20');
    // Where it sticks is `top`, never padding: padding pushed it a top bar down at rest.
    expect(header).toContain("style={{ top: `max(${topBarBottom}px, env(safe-area-inset-top, 0px))` }}");
    expect(header).not.toContain('paddingTop');
    expect(header).not.toContain('RolloutCoverTile');
    expect(header).not.toContain('ArtistFace');
    expect(header).not.toContain('IntersectionObserver');
    expect(header).not.toContain('onAddIdea');
  });

  it('shows the brief card always, with the cover editor on it', () => {
    expect(view).toMatch(/\{bodyIsMainView \? \(\s*<BriefEntryCard/);
    expect(view).toMatch(/cover=\{\s*<RolloutCoverTile[\s\S]*?size=\{44\}/);
  });

  it('moves Add idea, Select and Group by into the Rollout menu on a phone', () => {
    expect(panel).toContain('tools={menuTools}');
    expect(panel).toContain('data-rollout-menu-tools');
    expect(panel).toContain("{listShowing ? <div className=\"flex min-h-12 items-center px-3 text-base\">{groupByControl(false)}</div> : null}");
    expect(panel).not.toContain('<div className="flex items-center justify-between gap-3 lg:hidden">');
  });
});
