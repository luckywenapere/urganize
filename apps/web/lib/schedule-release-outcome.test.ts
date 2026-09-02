import { describe, expect, it } from 'vitest';

import { interpretScheduleResponse } from './schedule-release-outcome';

describe('interpretScheduleResponse', () => {
  it('200 with activities → saved, counting them in the toast', () => {
    expect(interpretScheduleResponse(200, { activitiesCreated: 64 })).toEqual({
      kind: 'saved',
      message: 'Release date set. 64 activities scheduled.',
    });
  });

  it('200 with no activities (nothing was pending) → plain saved copy', () => {
    expect(interpretScheduleResponse(200, {})).toEqual({
      kind: 'saved',
      message: 'Release date set.',
    });
    expect(interpretScheduleResponse(200, { activitiesCreated: 0 })).toEqual({
      kind: 'saved',
      message: 'Release date set.',
    });
  });

  it('tolerates a non-numeric activitiesCreated', () => {
    expect(interpretScheduleResponse(200, { activitiesCreated: 'garbage' })).toEqual({
      kind: 'saved',
      message: 'Release date set.',
    });
  });

  it('207 → partial, preferring the server sentence — the date IS saved', () => {
    expect(
      interpretScheduleResponse(207, { error: 'Plan build failed upstream.' })
    ).toEqual({ kind: 'partial', message: 'Plan build failed upstream.' });
    expect(interpretScheduleResponse(207, {})).toEqual({
      kind: 'partial',
      message: 'Your release date was saved, but the plan could not be built.',
    });
  });

  it('4xx/5xx → error, preferring the server sentence', () => {
    expect(interpretScheduleResponse(400, { error: 'Release date is required.' })).toEqual({
      kind: 'error',
      message: 'Release date is required.',
    });
    expect(interpretScheduleResponse(500, {})).toEqual({
      kind: 'error',
      message: 'Could not save the release date.',
    });
  });
});
