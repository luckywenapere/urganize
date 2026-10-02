import { describe, expect, it } from 'vitest';
import { RELEASE_MENU_ORDER, type ReleaseMenuKey } from './release-menu';
import { SCENE_NAMES, type SceneName } from './scene-cache';
import {
  buildRolloutMenu,
  type RolloutMenuEntry,
  type RolloutMenuFlags,
  type RolloutMenuInput,
} from './rollout-menu';

const ALL_ON: RolloutMenuFlags = {
  timeline: true,
  releaseChat: true,
  contentCalendar: true,
  pitching: true,
  pitchKit: true,
  metadata: true,
  notes: true,
  coverArt: true,
  songUpload: true,
  files: true,
  capture: true,
};

/** The three rows that open a dialog rather than a panel. WorkspaceView owns
 *  the state behind them, so the builder only ever sees a label and a
 *  disabled flag — never a handler. */
const MODALS = {
  share: { label: 'Share' },
  changeArtist: { label: 'Change artist' },
  archive: { label: 'Archive' },
};

function build(over: Partial<RolloutMenuInput> = {}): RolloutMenuEntry[] {
  return buildRolloutMenu({
    releaseId: 'rel-1',
    activeScene: null,
    variant: 'rail',
    flags: ALL_ON,
    ...MODALS,
    ...over,
  });
}

const keysOf = (entries: RolloutMenuEntry[]) => entries.map((entry) => entry.key);

/** Which row each feature switch owns. The mapping is the thing being tested,
 *  so it is written out here rather than derived from the module. */
const ROW_BY_FLAG: Record<keyof RolloutMenuFlags, ReleaseMenuKey> = {
  timeline: 'activities',
  releaseChat: 'chat',
  contentCalendar: 'calendar',
  pitching: 'pitch',
  pitchKit: 'pitchkit',
  metadata: 'metadata',
  notes: 'note',
  coverArt: 'coverart',
  songUpload: 'song',
  files: 'files',
  capture: 'capture',
};

/** Rows that swap the panel body for a scene. Everything else in the menu
 *  navigates away or opens a dialog. */
const SCENE_ROWS: ReleaseMenuKey[] = [
  'activities',
  'chat',
  'calendar',
  'pitch',
  'pitchkit',
  'metadata',
  'coverart',
  'song',
  'files',
  'capture',
];

describe('buildRolloutMenu', () => {
  it('holds every ranked row, in the canonical order, when everything is on', () => {
    // Two failures this catches: a key added to RELEASE_MENU_ORDER with no row
    // built for it (so a ranked entry silently never appears), and a row built
    // in an order the ranking does not agree with.
    expect(keysOf(build())).toEqual([...RELEASE_MENU_ORDER]);
    expect(keysOf(build({ variant: 'phone' }))).toEqual([...RELEASE_MENU_ORDER]);
  });

  it('is empty without a rollout, however much else is passed', () => {
    expect(build({ releaseId: null })).toEqual([]);
    expect(build({ releaseId: '' })).toEqual([]);
    expect(build({ releaseId: undefined as unknown as null })).toEqual([]);
  });

  it('drops exactly one row for each feature that is switched off', () => {
    for (const flag of Object.keys(ROW_BY_FLAG) as (keyof RolloutMenuFlags)[]) {
      const row = ROW_BY_FLAG[flag];
      const keys = keysOf(build({ flags: { ...ALL_ON, [flag]: false } }));
      expect(keys, `${flag} off`).toEqual(RELEASE_MENU_ORDER.filter((key) => key !== row));
    }
  });

  it('is only the dialog rows when every feature is off', () => {
    const allOff = Object.fromEntries(
      Object.keys(ALL_ON).map((flag) => [flag, false])
    ) as RolloutMenuFlags;
    expect(keysOf(build({ flags: allOff }))).toEqual(['share', 'change-artist', 'archive']);
  });

  it('shows each dialog row only when its action is passed', () => {
    const cases: [keyof typeof MODALS, ReleaseMenuKey][] = [
      ['share', 'share'],
      ['changeArtist', 'change-artist'],
      ['archive', 'archive'],
    ];
    for (const [input, row] of cases) {
      for (const absent of [null, undefined]) {
        const keys = keysOf(build({ [input]: absent } as Partial<RolloutMenuInput>));
        expect(keys, `${input}=${String(absent)}`).toEqual(
          RELEASE_MENU_ORDER.filter((key) => key !== row)
        );
      }
    }
  });

  it('carries the caller’s label and disabled state through unchanged', () => {
    const entries = build({
      archive: { label: 'Restore', disabled: true },
      share: { label: 'Share' },
    });
    const archive = entries.find((entry) => entry.key === 'archive');
    const share = entries.find((entry) => entry.key === 'share');
    expect(archive?.label).toBe('Restore');
    expect(archive?.disabled).toBe(true);
    expect(share?.label).toBe('Share');
    expect(share?.disabled).toBeFalsy();
  });

  it('never marks a scene row disabled', () => {
    for (const entry of build().filter((row) => SCENE_ROWS.includes(row.key))) {
      expect(entry.disabled, entry.key).toBeFalsy();
    }
  });
});

describe('which row is lit', () => {
  it('lights nothing when no scene is open', () => {
    expect(build({ activeScene: null }).filter((entry) => entry.isActive)).toEqual([]);
  });

  it('lights exactly the open scene’s row, for every scene that has one', () => {
    for (const scene of SCENE_ROWS) {
      const lit = build({ activeScene: scene as SceneName }).filter((entry) => entry.isActive);
      expect(lit.map((entry) => entry.key), scene).toEqual([scene]);
    }
  });

  it('lights nothing for the timeline, which is a main view and not a row', () => {
    // The timeline is what a rollout LANDS on; the Activities row points at
    // the OTHER main view. Lighting it here would say "you are on the buckets"
    // while the timeline is showing.
    expect(build({ activeScene: 'timeline' }).filter((entry) => entry.isActive)).toEqual([]);
  });

  it('lights nothing when the open scene’s own feature is off', () => {
    const entries = build({
      activeScene: 'files',
      flags: { ...ALL_ON, files: false },
    });
    expect(entries.filter((entry) => entry.isActive)).toEqual([]);
    expect(keysOf(entries)).not.toContain('files');
  });

  it('never reports a lit state on a row that is not a scene', () => {
    // Notes navigates away and the last three open a dialog: there is no open
    // panel for a lit row to describe, and a stray aria-pressed would announce
    // them as toggles.
    for (const scene of SCENE_NAMES) {
      for (const entry of build({ activeScene: scene })) {
        if (SCENE_ROWS.includes(entry.key)) continue;
        expect(entry.isActive, `${scene} / ${entry.key}`).toBeUndefined();
      }
    }
  });

  it('keeps Content and Fan capture in the menu while ANY scene is open', () => {
    // The old desktop footer hid these two as soon as a scene opened. In a
    // menu that is always on screen, hiding them would make the menu shift
    // every time a row was pressed.
    for (const scene of SCENE_NAMES) {
      const keys = keysOf(build({ activeScene: scene }));
      expect(keys, scene).toContain('calendar');
      expect(keys, scene).toContain('capture');
    }
  });

  it('keeps every row where it was when a scene opens', () => {
    const before = keysOf(build({ activeScene: null }));
    for (const scene of SCENE_NAMES) {
      expect(keysOf(build({ activeScene: scene })), scene).toEqual(before);
    }
  });
});

describe('what each row does', () => {
  it('points every scene row at the scene of the same name', () => {
    for (const entry of build().filter((row) => SCENE_ROWS.includes(row.key))) {
      expect(entry.target, entry.key).toEqual({ kind: 'scene', scene: entry.key });
    }
  });

  it('opens a dialog from the last three, identified by their key', () => {
    for (const key of ['share', 'change-artist', 'archive'] as const) {
      const entry = build().find((row) => row.key === key);
      expect(entry?.target, key).toEqual({ kind: 'modal' });
    }
  });

  it('labels the scene rows the way their desktop pills always have', () => {
    const labels = Object.fromEntries(build().map((entry) => [entry.key, entry.label]));
    expect(labels).toMatchObject({
      activities: 'Activities',
      chat: 'Chat',
      calendar: 'Content',
      pitch: 'Pitch',
      pitchkit: 'Pitch kit',
      metadata: 'Metadata',
      coverart: 'Cover art',
      song: 'Song',
      files: 'Files',
      capture: 'Fan capture',
    });
  });
});

describe('the two variants', () => {
  it('is a plain Notes link on desktop, pre-filtered to the rollout', () => {
    const note = build({ variant: 'rail' }).find((entry) => entry.key === 'note');
    expect(note?.label).toBe('Notes');
    expect(note?.target).toEqual({ kind: 'link', href: '/dashboard/notes?release=rel-1' });
  });

  it('is “Note this” on a phone and asks for a blank note straight away', () => {
    // A phone's Notes tab carries no rollout, so this row is the one that
    // closes that gap; `&new=1` is consumed once by the notes page.
    const note = build({ variant: 'phone' }).find((entry) => entry.key === 'note');
    expect(note?.label).toBe('Note this');
    expect(note?.target).toEqual({
      kind: 'link',
      href: '/dashboard/notes?release=rel-1&new=1',
    });
  });

  it('encodes a rollout id that is not URL-safe', () => {
    const note = build({ releaseId: 'a b/c' }).find((entry) => entry.key === 'note');
    expect(note?.target).toEqual({ kind: 'link', href: '/dashboard/notes?release=a%20b%2Fc' });
  });

  it('differs only in the notes row', () => {
    // Everything else must be identical, or a rollout would read differently on
    // a phone and a laptop for no reason anybody chose.
    const strip = (entries: RolloutMenuEntry[]) => entries.filter((entry) => entry.key !== 'note');
    expect(strip(build({ variant: 'phone' }))).toEqual(strip(build({ variant: 'rail' })));
  });
});

describe('purity', () => {
  it('returns a fresh array each call and leaves its input alone', () => {
    const flags = { ...ALL_ON };
    const snapshot = JSON.stringify({ flags, MODALS });
    const first = build({ flags });
    const second = build({ flags });
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(JSON.stringify({ flags, MODALS })).toBe(snapshot);
  });
});
