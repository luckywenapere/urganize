/**
 * Pure template metrics: functions of a Template passed in, with NO template
 * data imported here.
 *
 * Split out of loader.ts (2026-10-15, perf pass URG-314) because loader.ts
 * imports all three playbooks (~90 KB of minified data), and
 * release-planning.ts only needed getTemplateLeadTimeDays. Through
 * auth-store -> first-session -> onboarding-readiness -> release-planning ->
 * loader, every playbook rode in the root layout's JavaScript, so /auth and
 * every other page downloaded and parsed them on first load. loader.ts
 * re-exports both functions, so existing importers are unchanged.
 *
 * Keep this file free of template imports: release-templates/metrics-guard
 * (in templates.test.ts) fails if one appears.
 */

import type { Template } from './types';

/**
 * How many days before the release date the template's earliest task starts.
 *
 * Derived from the most-negative `offset_days` across the template's tasks —
 * if that drifts when the template is edited, this value drifts with it
 * automatically. For single_v0.3 the value is 56 (Week 8 pre-release).
 *
 * Used by the create-release form to recommend a release date that gives the
 * full template runway, and to detect when the picked date is sooner than
 * the template was designed for (the "compressed runway" case that produces
 * past-due tasks at instantiation).
 */
export function getTemplateLeadTimeDays(template: Template): number {
  let minOffset = 0;
  for (const task of template.tasks) {
    if (task.offset_days < minOffset) minOffset = task.offset_days;
  }
  return -minOffset;
}

/**
 * Total day-span of the template, from earliest pre-release task to latest
 * post-release task. For single_v0.3 the value is 78 (-56 → +22).
 *
 * Used for human-readable copy ("plans ~N weeks of work"). Distinct from
 * {@link getTemplateLeadTimeDays}, which counts only the pre-release runway
 * — the bit that determines whether tasks are past-due at creation.
 */
export function getTemplateSpanDays(template: Template): number {
  let minOffset = 0;
  let maxOffset = 0;
  for (const task of template.tasks) {
    if (task.offset_days < minOffset) minOffset = task.offset_days;
    if (task.offset_days > maxOffset) maxOffset = task.offset_days;
  }
  return maxOffset - minOffset;
}
