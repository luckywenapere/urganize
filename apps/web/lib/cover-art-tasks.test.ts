import { describe, expect, it } from 'vitest';

import { ALBUM_RELEASE_TEMPLATE } from './release-templates/album';
import { EP_RELEASE_TEMPLATE } from './release-templates/ep';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import type { Template } from './release-templates/types';
import { COVER_ART_TASK_IDS, shouldPromptCoverArtUpload } from './cover-art-tasks';

/**
 * The allowlist in cover-art-tasks.ts names playbook task ids by hand, and the
 * failure mode is silent: rename or drop a template task and the prompt simply
 * stops firing for that playbook, with nothing to notice. These assertions are
 * the tripwire — the same reasoning templates.test.ts records for its own
 * hand-written data.
 *
 * Imports the template modules directly rather than through the loader: this is
 * about the DATA, so NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES is irrelevant.
 */
const TEMPLATES: Array<[string, Template]> = [
  ['single', SINGLE_RELEASE_TEMPLATE],
  ['ep', EP_RELEASE_TEMPLATE],
  ['album', ALBUM_RELEASE_TEMPLATE],
];

/** Every task in every playbook whose title mentions the artwork. */
const artworkTasks = (template: Template) =>
  template.tasks.filter((task) => /\b(cover art|artwork)\b/i.test(task.title));

describe('COVER_ART_TASK_IDS resolves against the live playbooks', () => {
  it('names nine ids, three per playbook', () => {
    expect(COVER_ART_TASK_IDS.size).toBe(9);
  });

  it('every allowlisted id exists in exactly one playbook', () => {
    const allIds = TEMPLATES.flatMap(([, template]) => template.tasks.map((task) => task.id));
    for (const id of COVER_ART_TASK_IDS) {
      expect(allIds.filter((candidate) => candidate === id), `id '${id}'`).toHaveLength(1);
    }
  });

  it.each(TEMPLATES)('%s has at least one prompting task', (_name, template) => {
    const matched = template.tasks.filter((task) => COVER_ART_TASK_IDS.has(task.id));
    expect(matched.length).toBeGreaterThan(0);
  });

  it.each(TEMPLATES)('%s only allowlists tasks that are about the artwork', (_name, template) => {
    const matched = template.tasks.filter((task) => COVER_ART_TASK_IDS.has(task.id));
    for (const task of matched) {
      expect(task.title, `'${task.title}' is allowlisted`).toMatch(/\b(cover art|artwork)\b/i);
    }
  });

  it.each(TEMPLATES)('%s never prompts on commissioning the artwork', (_name, template) => {
    // "Brief the designer on cover art" is when the work is ORDERED. No file
    // exists yet, and prompting there teaches the manager to dismiss.
    const briefs = artworkTasks(template).filter((task) => /\bbrief\b/i.test(task.title));
    expect(briefs.length).toBeGreaterThan(0);
    for (const task of briefs) {
      expect(shouldPromptCoverArtUpload({ templateTaskId: task.id, title: task.title })).toBe(
        false
      );
    }
  });
});

describe('shouldPromptCoverArtUpload — template tasks', () => {
  it('prompts on the draft, the approval and the distributor upload', () => {
    for (const id of [
      'w6_cover_art_first_draft',
      'w5_cover_art_final_approved',
      'w6_upload_cover_art',
    ]) {
      expect(shouldPromptCoverArtUpload({ templateTaskId: id, title: 'anything' })).toBe(true);
    }
  });

  it('prompts for the EP and album equivalents', () => {
    for (const id of [
      'w10_ep_art_draft',
      'w9_ep_art_approved',
      'w5_upload_ep_art',
      'w14_album_art_draft',
      'w13_album_art_approved',
      'w7_upload_album_art',
    ]) {
      expect(shouldPromptCoverArtUpload({ templateTaskId: id, title: 'anything' })).toBe(true);
    }
  });

  it('ignores an unrelated playbook step', () => {
    expect(
      shouldPromptCoverArtUpload({ templateTaskId: 'w8_lock_master', title: 'Lock the master' })
    ).toBe(false);
  });

  it('never lets a title override an excluded template task', () => {
    // The allowlist is the WHOLE answer for a task that has a template id, so
    // the title fallback cannot resurrect one that was deliberately left out.
    expect(
      shouldPromptCoverArtUpload({
        templateTaskId: 'w7_brief_designer',
        title: 'Cover art cover art cover art',
      })
    ).toBe(false);
  });
});

describe('shouldPromptCoverArtUpload — tasks with no template origin', () => {
  it('prompts on a manager-added artwork task', () => {
    expect(shouldPromptCoverArtUpload({ templateTaskId: null, title: 'Send cover art to Ada' })).toBe(
      true
    );
    expect(shouldPromptCoverArtUpload({ title: 'Final artwork from the designer' })).toBe(true);
  });

  it('does not prompt on commissioning language', () => {
    for (const title of [
      'Brief the designer on cover art',
      'Shortlist artwork references',
      'Find a cover art designer',
      'Hire an artwork illustrator',
    ]) {
      expect(shouldPromptCoverArtUpload({ templateTaskId: null, title }), title).toBe(false);
    }
  });

  it('does not prompt on an unrelated task', () => {
    expect(shouldPromptCoverArtUpload({ templateTaskId: null, title: 'Book the video shoot' })).toBe(
      false
    );
  });

  it('is not fooled by the word art inside another word', () => {
    expect(shouldPromptCoverArtUpload({ templateTaskId: null, title: 'Start the chart push' })).toBe(
      false
    );
  });

  it('handles a missing or empty title', () => {
    expect(shouldPromptCoverArtUpload({ templateTaskId: null, title: null })).toBe(false);
    expect(shouldPromptCoverArtUpload({})).toBe(false);
  });
});
