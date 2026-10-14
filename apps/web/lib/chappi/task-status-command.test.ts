import { describe, expect, it } from 'vitest';
import { matchTasksByTitle, parseTaskStatusCommand } from './task-status-command';

describe('parseTaskStatusCommand', () => {
  it('reads explicit status changes', () => {
    expect(parseTaskStatusCommand('Mark the cover shoot as done')).toEqual({
      query: 'cover shoot',
      status: 'done',
      strength: 'explicit',
    });
    expect(parseTaskStatusCommand('move Spotify pitch to in progress')).toMatchObject({
      query: 'Spotify pitch',
      status: 'in_progress',
      strength: 'explicit',
    });
    expect(parseTaskStatusCommand('set "Radio edit" to blocked.')).toMatchObject({ query: 'Radio edit', status: 'blocked' });
    expect(parseTaskStatusCommand('mark press release complete')).toMatchObject({ query: 'press release', status: 'done' });
    expect(parseTaskStatusCommand('change the activity mixdown to not started')).toMatchObject({
      query: 'mixdown',
      status: 'todo',
    });
    expect(parseTaskStatusCommand('put artwork in review')).toMatchObject({ query: 'artwork', status: 'in_review' });
  });

  it('reads loose phrasing as loose', () => {
    expect(parseTaskStatusCommand('Cover shoot is done')).toMatchObject({ status: 'done', strength: 'loose' });
    expect(parseTaskStatusCommand('start the mixdown')).toMatchObject({ query: 'mixdown', status: 'in_progress', strength: 'loose' });
    expect(parseTaskStatusCommand('cancel teaser video')).toMatchObject({ status: 'cancelled', strength: 'loose' });
  });

  it('leaves everything else to the model', () => {
    expect(parseTaskStatusCommand('Is the cover shoot done?')).toBeNull();
    expect(parseTaskStatusCommand('move the shoot to Friday')).toBeNull();
    expect(parseTaskStatusCommand('Plan my next single')).toBeNull();
    expect(parseTaskStatusCommand('the song is amazing')).toBeNull();
    expect(parseTaskStatusCommand('')).toBeNull();
  });
});

describe('matchTasksByTitle', () => {
  const tasks = [
    { id: '1', title: 'Cover shoot', releaseId: 'a', status: 'todo' as const },
    { id: '2', title: 'Cover shoot', releaseId: 'b', status: 'todo' as const },
    { id: '3', title: 'Pitch to Spotify editorial', releaseId: 'a', status: 'todo' as const },
    { id: '4', title: 'Book the cover shoot studio', releaseId: 'a', status: 'todo' as const },
  ];

  it('prefers an exact title, then the scoped rollout', () => {
    expect(matchTasksByTitle('cover shoot', tasks).map((t) => t.id)).toEqual(['1', '2']);
    expect(matchTasksByTitle('Cover Shoot', tasks, 'b').map((t) => t.id)).toEqual(['2']);
  });

  it('falls back to contains, then every word', () => {
    expect(matchTasksByTitle('spotify editorial', tasks).map((t) => t.id)).toEqual(['3']);
    expect(matchTasksByTitle('spotify pitch', tasks).map((t) => t.id)).toEqual(['3']);
    expect(matchTasksByTitle('mastering', tasks)).toEqual([]);
  });
});
