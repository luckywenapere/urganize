import { describe, expect, it } from 'vitest';
import {
  availableBios,
  coverTitleSize,
  creditRoleChipShows,
  curatorStatsLine,
  defaultBioLength,
  initialsOf,
  pitchingSteps,
  planPublicBoard,
  playlistWants,
  safeSwatches,
  sharedByName,
  type BoardContent,
} from './public-pages-desktop';

function board(over: Partial<BoardContent> = {}): BoardContent {
  return { headline: '', idea: '', feelsLike: [], notThis: [], palette: [], dates: 0, links: 0, images: 0, ...over };
}

describe('coverTitleSize', () => {
  it('draws short titles largest', () => {
    expect(coverTitleSize('Owambe Season')).toEqual({ size: 'xl', breakable: false });
  });

  it('steps down by the longest word so no word breaks', () => {
    expect(coverTitleSize('Unbelievable')).toEqual({ size: 'md', breakable: false });
    expect(coverTitleSize('Supercalifragilistic')).toEqual({ size: 'sm', breakable: true });
    expect(coverTitleSize('Overwhelmingness')).toEqual({ size: 'sm', breakable: false });
  });

  it('steps down for a long title of short words', () => {
    expect(coverTitleSize('All the small things we did')).toEqual({ size: 'lg', breakable: false });
  });
});

describe('safeSwatches', () => {
  it('keeps hex colours and drops anything else', () => {
    expect(safeSwatches(['#c9b89a', ' #7A2A1E ', '#abc', 'red', 'url(x)', '#12345'])).toEqual(['#c9b89a', '#7A2A1E', '#abc']);
  });
});

describe('planPublicBoard', () => {
  it('lays out a full brief like the mock', () => {
    const plan = planPublicBoard(
      board({ headline: 'Build it slowly.', feelsLike: ['Sweaty'], palette: ['#c9b89a'], dates: 1, links: 1, images: 4 })
    );
    expect(plan).toEqual({
      coverRows: 2,
      beside: [
        { key: 'idea', span: 3 },
        { key: 'feels', span: 1 },
        { key: 'colours', span: 1 },
        { key: 'dates', span: 1 },
      ],
      below: [
        { key: 'sound', span: 2 },
        { key: 'look', span: 2 },
      ],
    });
  });

  it('leaves out every empty card and widens the rest', () => {
    const plan = planPublicBoard(board({ idea: 'A warm record.', dates: 3, images: 2 }));
    expect(plan.beside).toEqual([
      { key: 'idea', span: 3 },
      { key: 'dates', span: 3 },
    ]);
    expect(plan.below).toEqual([{ key: 'look', span: 4 }]);
  });

  it('counts not-this words as feels and ignores bad colours', () => {
    const plan = planPublicBoard(board({ notThis: ['Glossy'], palette: ['red'] }));
    expect(plan).toEqual({ coverRows: 1, beside: [{ key: 'feels', span: 3 }], below: [] });
  });

  it('keeps the cover one row tall on an empty brief', () => {
    expect(planPublicBoard(board())).toEqual({ coverRows: 1, beside: [], below: [] });
  });
});

describe('sharedByName', () => {
  it('uses the first name and nothing when unknown', () => {
    expect(sharedByName('Maya Patel')).toBe('Maya');
    expect(sharedByName('  ')).toBe('');
    expect(sharedByName(null)).toBe('');
  });
});

describe('press kit bios', () => {
  it('lists only written bios, shortest first', () => {
    expect(availableBios({ long: ' Long one ', short: 'Short one', medium: '' })).toEqual([
      { key: 'short', label: 'Short', text: 'Short one' },
      { key: 'long', label: 'Long', text: 'Long one' },
    ]);
  });

  it('opens on medium, else the shortest there is', () => {
    expect(defaultBioLength(availableBios({ short: 'a', medium: 'b', long: 'c' }))).toBe('medium');
    expect(defaultBioLength(availableBios({ long: 'c' }))).toBe('long');
    expect(defaultBioLength([])).toBeNull();
  });
});

describe('creditRoleChipShows', () => {
  it('shows the first roles everywhere and the rest on a computer', () => {
    expect(creditRoleChipShows('songwriter', { showAll: false, picked: false })).toBe('always');
    expect(creditRoleChipShows('mastering_engineer', { showAll: false, picked: false })).toBe('computer');
  });

  it('shows a picked role or every role after More everywhere', () => {
    expect(creditRoleChipShows('mastering_engineer', { showAll: false, picked: true })).toBe('always');
    expect(creditRoleChipShows('other', { showAll: true, picked: false })).toBe('always');
  });
});

describe('curator page', () => {
  it('makes initials, never an empty tile', () => {
    expect(initialsOf('Ayo Kalu')).toBe('AK');
    expect(initialsOf('owambe season selects')).toBe('OS');
    expect(initialsOf('  ')).toBe('?');
  });

  it('writes the playlist and follower line', () => {
    expect(curatorStatsLine(3, 2820)).toBe('3 playlists · 2,820 followers');
    expect(curatorStatsLine(1, 0)).toBe('1 playlist');
    expect(curatorStatsLine(0, 500)).toBe('');
  });

  it('says what a playlist wants only when genres exist', () => {
    expect(playlistWants(['Afrobeats', ' Amapiano '])).toBe('Wants: Afrobeats, Amapiano');
    expect(playlistWants(['', ' '])).toBeNull();
  });

  it('never promises a reply in how pitching works', () => {
    const steps = pitchingSteps('Ayo Kalu');
    expect(steps.map((step) => step.title)).toEqual(['Pick a playlist', 'Ayo listens', 'You hear back in Urganize']);
    expect(JSON.stringify(steps)).not.toMatch(/every pitch gets a reply/i);
  });
});
