import { describe, expect, it } from 'vitest';
import { parseRecordScope, recordIdFromPath, recordScopeLine } from './record-scope';

const ID = '3f1c2b8e-1d2a-4c5b-9e7f-0a1b2c3d4e5f';

describe('recordIdFromPath', () => {
  it('reads the record id from a record page', () => {
    expect(recordIdFromPath(`/dashboard/artists/art-1/records/${ID}`)).toBe(ID);
    expect(recordIdFromPath(`/dashboard/artists/art-1/records/${ID}/`)).toBe(ID);
  });

  it('reads it from the page as it lives today, /dashboard/<artistId>/records/<id>', () => {
    expect(recordIdFromPath(`/dashboard/art-1/records/${ID}`)).toBe(ID);
    expect(recordIdFromPath(`/dashboard/art-1/records/${ID}/`)).toBe(ID);
    expect(recordIdFromPath(`/dashboard/art-1/records/${ID}/edit`)).toBeNull();
  });

  it('is null anywhere else', () => {
    expect(recordIdFromPath('/dashboard/artists/art-1')).toBeNull();
    expect(recordIdFromPath('/dashboard/urgans')).toBeNull();
    expect(recordIdFromPath(`/dashboard/artists/art-1/records/${ID}/edit`)).toBeNull();
    expect(recordIdFromPath('/dashboard/artists/art-1/records/not-an-id')).toBeNull();
    expect(recordIdFromPath(null)).toBeNull();
  });
});

describe('parseRecordScope', () => {
  it('takes only a uuid', () => {
    expect(parseRecordScope({ recordScope: { id: ID } })).toBe(ID);
    expect(parseRecordScope({ recordScope: { id: 'rec-1' } })).toBeNull();
    expect(parseRecordScope({ recordScope: ID })).toBeNull();
    expect(parseRecordScope({})).toBeNull();
  });
});

describe('recordScopeLine', () => {
  it('tells AI to file into this record, with no em dash', () => {
    const line = recordScopeLine({ id: ID, title: 'Untitled EP', artistName: 'Kemi Ade' });
    expect(line).toContain(`add_to_record with this recordId`);
    expect(line).toContain(ID);
    expect(line).not.toMatch(/—/);
  });
});
