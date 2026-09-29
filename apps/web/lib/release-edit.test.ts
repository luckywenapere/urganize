import { describe, expect, it } from 'vitest';
import { planReleaseEdit, type ReleaseEditCurrent } from './release-edit';

const CURRENT: ReleaseEditCurrent = {
  title: 'Untitled release',
  slug: 'untitled-release',
  releaseDate: '2026-10-30',
  description: 'A slow one for the rainy season.',
  status: 'draft',
  artistName: 'Victory',
};

function plan(body: unknown, over: Partial<ReleaseEditCurrent> = {}, artistNameEditable = false) {
  return planReleaseEdit(body, { ...CURRENT, ...over }, { artistNameEditable });
}

describe('planReleaseEdit — the reported bug', () => {
  it('a rename writes the title and slug and NOTHING else', () => {
    const result = plan({ title: 'Trust' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The whole bug: an omitted releaseDate used to be written as NULL, which
    // hid a 64-activity plan behind "Set a release date first".
    expect(Object.keys(result.update).sort()).toEqual(['slug', 'title']);
    expect(result.update).not.toHaveProperty('release_date');
    expect(result.update).not.toHaveProperty('description');
    expect(result.update).not.toHaveProperty('status');
    expect(result.update.title).toBe('Trust');
    expect(result.update.slug).toBe('trust');
    expect(result.changed).toEqual(['title']);
  });

  it('never writes a column the body did not mention, whichever one field is sent', () => {
    const bodies: Record<string, unknown>[] = [
      { title: 'Trust' },
      { description: 'New words.' },
      { status: 'ready' },
    ];
    for (const body of bodies) {
      const result = plan(body);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.update).not.toHaveProperty('release_date');
      expect(result.update).not.toHaveProperty('artist_name');
    }
  });
});

describe('planReleaseEdit — title', () => {
  it('refuses to blank the title', () => {
    for (const title of ['', '   ', '\n\t']) {
      const result = plan({ title });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBe('Rollout title is required.');
    }
  });

  it('refuses a title that is not text', () => {
    const result = plan({ title: 42 });
    expect(result.ok).toBe(false);
  });

  it('cleans the title the same way creating a rollout does', () => {
    const result = plan({ title: '  Trust   me \n now  ' });
    expect(result.ok && result.update.title).toBe('Trust me now');
  });

  it('caps the title at 140 characters, like the create route', () => {
    const result = plan({ title: 'x'.repeat(500) });
    expect(result.ok && String(result.update.title).length).toBe(140);
  });

  it('is a no-op when the title does not change', () => {
    const result = plan({ title: 'Untitled release' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update).toEqual({});
    expect(result.changed).toEqual([]);
  });

  it('keeps the old slug when the new title has no letters or numbers to slug', () => {
    const result = plan({ title: '!!!' });
    expect(result.ok && result.update.slug).toBe('untitled-release');
  });
});

describe('planReleaseEdit — release date', () => {
  it('accepts the CURRENT date echoed back unchanged (a full-row client stays safe)', () => {
    const result = plan({ title: 'Trust', releaseDate: '2026-10-30' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update).not.toHaveProperty('release_date');
    expect(result.changed).toEqual(['title']);
  });

  it('refuses to CHANGE the date here, and says where to do it', () => {
    const result = plan({ releaseDate: '2026-11-20' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('date_via_schedule');
  });

  it('refuses to CLEAR the date here — clearing it is what hid the plan', () => {
    for (const releaseDate of ['', null, '   ']) {
      const result = plan({ title: 'Trust', releaseDate });
      expect(result.ok, String(releaseDate)).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('date_via_schedule');
    }
  });

  it('a release with no date may send an empty date back without error', () => {
    const result = plan({ title: 'Trust', releaseDate: '' }, { releaseDate: null });
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed date as a 400 rather than letting Postgres cast-error', () => {
    const result = plan({ releaseDate: '30/10/2026' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid_date');
  });

  it('treats an ISO timestamp for the same day as the same date', () => {
    // A client that read a timestamp and sent it back must not trip the guard.
    const result = plan({ title: 'Trust', releaseDate: '2026-10-30T00:00:00+00:00' });
    expect(result.ok).toBe(true);
  });
});

describe('planReleaseEdit — description', () => {
  it('writes a changed description', () => {
    const result = plan({ description: 'Different words.' });
    expect(result.ok && result.update.description).toBe('Different words.');
  });

  it('clears the description when explicitly sent empty or null', () => {
    for (const description of ['', null]) {
      const result = plan({ description });
      expect(result.ok, String(description)).toBe(true);
      if (!result.ok) continue;
      expect(result.update).toHaveProperty('description', null);
      expect(result.changed).toEqual(['description']);
    }
  });

  it('is a no-op to clear a description that is already empty', () => {
    const result = plan({ description: '' }, { description: '' });
    expect(result.ok && result.update).toEqual({});
  });

  it('caps the description at 400 characters', () => {
    const result = plan({ description: 'y'.repeat(900) });
    expect(result.ok && String(result.update.description).length).toBe(400);
  });
});

describe('planReleaseEdit — status', () => {
  it('writes a valid changed status', () => {
    const result = plan({ status: 'released' });
    expect(result.ok && result.update.status).toBe('released');
  });

  it('rejects an unknown status', () => {
    const result = plan({ status: 'shipped' });
    expect(result.ok).toBe(false);
  });

  it('ignores an empty status instead of writing it', () => {
    const result = plan({ title: 'Trust', status: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update).not.toHaveProperty('status');
  });
});

describe('planReleaseEdit — artist name', () => {
  it('ignores artistName entirely when it is managed through the roster', () => {
    const result = plan({ title: 'Trust', artistName: 'Someone else' }, {}, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update).not.toHaveProperty('artist_name');
    expect(result.next.artistName).toBe('Victory');
  });

  it('writes artistName only where the release row owns it', () => {
    const result = plan({ artistName: 'Someone else' }, {}, true);
    expect(result.ok && result.update.artist_name).toBe('Someone else');
  });
});

describe('planReleaseEdit — body shape', () => {
  it('rejects a body that is not an object', () => {
    for (const body of [null, 'Trust', ['Trust'], 7]) {
      expect(plan(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('ignores fields it does not own, like the retired pipeline ones', () => {
    const result = plan({ title: 'Trust', state: 'released', readinessScore: 100, slug: 'x' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.update).sort()).toEqual(['slug', 'title']);
    expect(result.update.slug).toBe('trust');
  });

  it('an empty body is a no-op, not a wipe', () => {
    const result = plan({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update).toEqual({});
  });

  it('reports the final title and artist for the audit trail', () => {
    const result = plan({ title: 'Trust' });
    expect(result.ok && result.next).toEqual({ title: 'Trust', artistName: 'Victory' });
  });
});
