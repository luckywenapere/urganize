import { describe, expect, it } from 'vitest';
import {
  readCompressedRunway,
  readDurationDays,
  readTaskType,
  readTemplateTaskId,
} from './tasks-server';

/**
 * The four readers that pull `metadata.template` off a task row and turn it
 * into the fields the client classifies by. They are the contract between two
 * writers — `lib/release-templates/instantiate.ts` (a template-instantiated
 * release) and `lib/release-planning-server.ts` (an approved UrgAns plan) —
 * and every surface that reads a task.
 *
 * THEY HAD NO COVERAGE UNTIL 2026-09-07, and this is the layer where a silent
 * failure has already happened rather than a hypothetical one:
 * `readTemplateTaskId` looked for `template_task_id` while both writers wrote
 * `task_id`, so it resolved to null on every activity in the product from the
 * day the field was added until 2026-09-03. Nothing caught it, because a
 * reader that quietly returns a default looks exactly like a row that legitimately
 * has no value.
 *
 * That is also why these tests are worth more than they look. Each reader has
 * a designed default, so a broken key never throws and never renders an error
 * — it just makes every row look like the least interesting case.
 */

/** The metadata `instantiate.ts` writes, and the `origin: 'template'` branch
 *  of `buildTaskMetadata` on the approval path — same nine keys either way. */
const TEMPLATE_METADATA = {
  template: {
    template_id: 'single_v0.3',
    template_version: '0.3',
    task_id: 'w5_cover_art_final_approved',
    role: 'manager',
    task_type: 'task',
    duration_days: 7,
    optional: false,
    tags: ['asset_production'],
    compressed_runway: false,
  },
};

/**
 * The metadata a MANAGER-ADDED activity carries after plan approval —
 * `buildTaskMetadata`'s non-template branch, which gives it exactly these two
 * keys because it claims no template provenance it does not have.
 *
 * `lib/release-planning-server.test.ts` asserts the writer produces exactly
 * this shape; `lib/release-timeline.test.ts` asserts a null duration renders
 * as a marker rather than a bar. These tests are the join between those two:
 * that this shape READS BACK as the nulls the timeline is relying on.
 */
const MANAGER_ADDED_METADATA = {
  template: {
    task_type: 'task',
    compressed_runway: false,
  },
  planner: {
    draft_id: 'draft-1',
    draft_task_id: 'user_abc',
    schema_version: 2,
    origin: 'user',
    approved_at: '2026-09-07T00:00:00.000Z',
  },
};

describe('readDurationDays', () => {
  it('reads the playbook duration off a template row', () => {
    expect(readDurationDays(TEMPLATE_METADATA)).toBe(7);
  });

  it('returns null for a manager-added activity, which carries no duration', () => {
    // THE link in the chain. The writer omits the key by design and the
    // timeline draws a marker for null — this is what connects them.
    expect(readDurationDays(MANAGER_ADDED_METADATA)).toBeNull();
  });

  it('returns null when there is no template block or no metadata at all', () => {
    // A row predating the template flow.
    expect(readDurationDays({})).toBeNull();
    expect(readDurationDays({ template: {} })).toBeNull();
    expect(readDurationDays(null)).toBeNull();
    expect(readDurationDays(undefined)).toBeNull();
    expect(readDurationDays('not an object')).toBeNull();
  });

  it('refuses a duration below one day rather than reading it as a span', () => {
    // "A duration we do not have is not a duration of zero." Zero would make
    // endDay precede startDay; a negative is nonsense. Both read as unknown.
    expect(readDurationDays({ template: { duration_days: 0 } })).toBeNull();
    expect(readDurationDays({ template: { duration_days: -3 } })).toBeNull();
  });

  it('refuses a non-finite or non-numeric duration', () => {
    expect(readDurationDays({ template: { duration_days: '7' } })).toBeNull();
    expect(readDurationDays({ template: { duration_days: Number.NaN } })).toBeNull();
    expect(readDurationDays({ template: { duration_days: Infinity } })).toBeNull();
  });

  it('floors a fractional duration to whole days', () => {
    // The axis is whole days, so half a day has nowhere to render.
    expect(readDurationDays({ template: { duration_days: 7.9 } })).toBe(7);
  });
});

describe('readTemplateTaskId', () => {
  it('reads the key both writers actually write', () => {
    // `task_id`, NOT `template_task_id`. Getting this wrong is the bug this
    // file's header describes, and it was invisible for months.
    expect(readTemplateTaskId(TEMPLATE_METADATA)).toBe('w5_cover_art_final_approved');
  });

  it('still accepts the legacy key defensively', () => {
    expect(readTemplateTaskId({ template: { template_task_id: 'w3_legacy' } })).toBe(
      'w3_legacy'
    );
  });

  it('prefers task_id when both are present', () => {
    expect(
      readTemplateTaskId({
        template: { task_id: 'w5_current', template_task_id: 'w3_legacy' },
      })
    ).toBe('w5_current');
  });

  it('returns null for a manager-added activity, which names no playbook step', () => {
    expect(readTemplateTaskId(MANAGER_ADDED_METADATA)).toBeNull();
  });

  it('trims, and treats a blank id as absent', () => {
    expect(readTemplateTaskId({ template: { task_id: '  w5_padded  ' } })).toBe('w5_padded');
    expect(readTemplateTaskId({ template: { task_id: '   ' } })).toBeNull();
    expect(readTemplateTaskId({ template: { task_id: 42 } })).toBeNull();
  });
});

describe('readTaskType', () => {
  it('reads an event milestone', () => {
    expect(readTaskType({ template: { task_type: 'event_milestone' } })).toBe(
      'event_milestone'
    );
  });

  it('defaults to a plain task everywhere else', () => {
    // The default has to be 'task': a row with no marker is ordinary work, and
    // guessing 'event_milestone' would give it a date treatment it never earned.
    expect(readTaskType(TEMPLATE_METADATA)).toBe('task');
    expect(readTaskType(MANAGER_ADDED_METADATA)).toBe('task');
    expect(readTaskType({})).toBe('task');
    expect(readTaskType(null)).toBe('task');
    expect(readTaskType({ template: { task_type: 'something_else' } })).toBe('task');
  });
});

describe('readCompressedRunway', () => {
  it('is true only for exactly true', () => {
    expect(readCompressedRunway({ template: { compressed_runway: true } })).toBe(true);
    expect(readCompressedRunway({ template: { compressed_runway: 'true' } })).toBe(false);
    expect(readCompressedRunway({ template: { compressed_runway: 1 } })).toBe(false);
  });

  it('defaults to false so a legacy row is not retroactively reclassified', () => {
    // A past-due row without the flag falls through to the normal overdue
    // treatment rather than being relabelled catch-up.
    expect(readCompressedRunway(TEMPLATE_METADATA)).toBe(false);
    expect(readCompressedRunway({})).toBe(false);
    expect(readCompressedRunway(null)).toBe(false);
  });

  it('survives approval on a manager-added activity', () => {
    // One of only two keys that branch keeps, precisely because this reader
    // and readTaskType are what classify the row.
    expect(readCompressedRunway({ template: { task_type: 'task', compressed_runway: true } })).toBe(
      true
    );
  });
});

/**
 * The asymmetry the planner documents, read end to end at this layer.
 *
 * An approved plan holds both kinds of row. A template one is fully described;
 * a manager-added one is honestly under-described, and every one of these
 * nulls is load-bearing somewhere: the timeline draws a marker instead of a
 * bar, and lib/cover-art-tasks.ts falls back to matching on the title.
 */
describe('the two shapes an approved plan contains', () => {
  const read = (metadata: unknown) => ({
    taskType: readTaskType(metadata),
    templateTaskId: readTemplateTaskId(metadata),
    durationDays: readDurationDays(metadata),
    compressedRunway: readCompressedRunway(metadata),
  });

  it('describes a template row fully', () => {
    expect(read(TEMPLATE_METADATA)).toEqual({
      taskType: 'task',
      templateTaskId: 'w5_cover_art_final_approved',
      durationDays: 7,
      compressedRunway: false,
    });
  });

  it('describes a manager-added row honestly, with nulls where it knows nothing', () => {
    expect(read(MANAGER_ADDED_METADATA)).toEqual({
      taskType: 'task',
      templateTaskId: null,
      durationDays: null,
      compressedRunway: false,
    });
  });

  it('classifies both kinds identically where they DO agree', () => {
    // task_type and compressed_runway are the two keys the manager-added
    // branch keeps, and the reason it keeps them is that these two readers are
    // what bucket a row and pick its treatment. They must not diverge.
    expect(readTaskType(TEMPLATE_METADATA)).toBe(readTaskType(MANAGER_ADDED_METADATA));
    expect(readCompressedRunway(TEMPLATE_METADATA)).toBe(
      readCompressedRunway(MANAGER_ADDED_METADATA)
    );
  });
});
