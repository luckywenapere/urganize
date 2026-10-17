import { describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase, type FakeDb } from './test-support/fake-supabase';
import {
  checkReleaseForDistribution,
  loadDistributionFacts,
  loadDistributionPayload,
  loadRejections,
  recordDistributionHandoff,
  recordDistributionRejection,
} from './distribution-server';

type Db = FakeDb;
const makeClient = makeFakeSupabase;

const NOW = new Date('2026-10-09T10:00:00Z');

/** A rollout that passes every rule. */
function completeDb(): Db {
  return {
    releases: [
      {
        id: 'rel-1',
        title: 'Lagos Nights',
        artist_name: 'Dorian',
        release_date: '2026-12-31',
        artwork_asset_id: 'art-1',
        owner_user_id: 'owner-1',
      },
    ],
    release_metadata: [{ release_id: 'rel-1', genre: 'Afrobeats', language: 'English', explicit: false }],
    assets: [
      {
        id: 'art-1',
        release_id: 'rel-1',
        category: 'cover_art',
        mime_type: 'image/jpeg',
        metadata: { image: { width: 3000, height: 3000 } },
      },
      {
        id: 'aud-1',
        release_id: 'rel-1',
        category: 'audio',
        mime_type: 'audio/wav',
        file_name: 'master.wav',
        created_at: '2026-10-01T00:00:00Z',
      },
    ],
    release_credit_submissions: [
      { release_id: 'rel-1', roles: ['songwriter'], songwriter_split: 100, master_split: 100 },
    ],
    billing_events: [],
    workspaces: [{ id: 'ws-1', owner_id: 'owner-1' }],
    distribution_rejections: [],
  };
}

describe('loadDistributionFacts', () => {
  it('reads a rollout into the facts the rules use', async () => {
    const { client } = makeClient(completeDb());
    const facts = await loadDistributionFacts(client, 'rel-1');
    expect(facts).toEqual({
      title: 'Lagos Nights',
      primaryArtist: 'Dorian',
      releaseDate: '2026-12-31',
      genre: 'Afrobeats',
      language: 'English',
      explicit: false,
      artwork: { mimeType: 'image/jpeg', width: 3000, height: 3000 },
      credits: [{ roles: ['songwriter'], songwriterSplit: 100, masterSplit: 100 }],
    });
  });

  it('reads an explicit flag that was never answered as unset, not as false', async () => {
    const db = completeDb();
    db.release_metadata[0].explicit = null;
    const facts = await loadDistributionFacts(makeClient(db).client, 'rel-1');
    expect(facts?.explicit).toBeNull();
  });

  it('reads no metadata row at all as empty fields', async () => {
    const db = completeDb();
    db.release_metadata = [];
    const facts = await loadDistributionFacts(makeClient(db).client, 'rel-1');
    expect(facts).toMatchObject({ genre: null, language: null, explicit: null });
  });

  it('ignores audio uploads: Urganize does not take the song', async () => {
    const facts = await loadDistributionFacts(makeClient(completeDb()).client, 'rel-1');
    expect(facts).not.toHaveProperty('audio');
    expect(facts).not.toHaveProperty('hasSong');
  });

  it('has no artwork when there is no pointer', async () => {
    const db = completeDb();
    db.assets = [];
    db.releases[0].artwork_asset_id = null;
    const facts = await loadDistributionFacts(makeClient(db).client, 'rel-1');
    expect(facts).toMatchObject({ artwork: null });
  });

  it('reads an artwork uploaded before sizes were recorded as unknown size', async () => {
    const db = completeDb();
    db.assets[0].metadata = {};
    const facts = await loadDistributionFacts(makeClient(db).client, 'rel-1');
    expect(facts?.artwork).toEqual({ mimeType: 'image/jpeg', width: null, height: null });
  });

  it('reads a stale artwork pointer as no artwork', async () => {
    const db = completeDb();
    db.releases[0].artwork_asset_id = 'gone';
    const facts = await loadDistributionFacts(makeClient(db).client, 'rel-1');
    expect(facts?.artwork).toBeNull();
  });

  it('reads split numbers that arrive as strings, and ignores junk', async () => {
    const db = completeDb();
    db.release_credit_submissions = [
      { release_id: 'rel-1', roles: ['songwriter'], songwriter_split: '33.30', master_split: null },
      { release_id: 'rel-1', roles: [], songwriter_split: 'abc', master_split: '' },
    ];
    const facts = await loadDistributionFacts(makeClient(db).client, 'rel-1');
    expect(facts?.credits).toEqual([
      { roles: ['songwriter'], songwriterSplit: 33.3, masterSplit: null },
      { roles: [], songwriterSplit: null, masterSplit: null },
    ]);
  });

  it('answers null for a rollout that is not there', async () => {
    const db = completeDb();
    db.releases = [];
    expect(await loadDistributionFacts(makeClient(db).client, 'rel-1')).toBeNull();
  });

  it('FAILS CLOSED: any read that errors makes the whole check unavailable', async () => {
    for (const table of ['releases', 'release_metadata', 'assets', 'release_credit_submissions']) {
      const { client } = makeClient(completeDb(), { failSelectOn: [table] });
      expect(await loadDistributionFacts(client, 'rel-1'), table).toBeNull();
      expect(await checkReleaseForDistribution(client, 'rel-1', NOW), table).toBeNull();
    }
  });
});

describe('checkReleaseForDistribution', () => {
  it('passes a complete rollout with nothing raised', async () => {
    const result = await checkReleaseForDistribution(makeClient(completeDb()).client, 'rel-1', NOW);
    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it('raises errors for an empty rollout', async () => {
    const db = completeDb();
    db.releases[0] = { ...db.releases[0], title: 'Untitled rollout', release_date: null, artwork_asset_id: null };
    db.release_metadata = [];
    db.assets = [];
    db.release_credit_submissions = [];
    const result = await checkReleaseForDistribution(makeClient(db).client, 'rel-1', NOW);
    expect(result?.errors.map((issue) => issue.code)).toEqual([
      'missing_title',
      'missing_release_date',
      'missing_genre',
      'missing_language',
      'missing_explicit_flag',
      'missing_songwriter_credits',
      'artwork_missing',
    ]);
  });

});

describe('rejections', () => {
  it('stores a rejection with the raw payload, on the rollout, stamped with its team', async () => {
    const db = completeDb();
    const { client, inserts } = makeClient(db);
    const id = await recordDistributionRejection(client, {
      releaseId: 'rel-1',
      ownerUserId: 'owner-1',
      reasonCode: 'ARTWORK_REJECTED',
      reasonText: 'The cover has a QR code on it.',
      raw: { status: 'rejected', detail: { stores: ['spotify'] } },
    });
    expect(id).toBe('new-1');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe('distribution_rejections');
    expect(inserts[0].row).toMatchObject({
      release_id: 'rel-1',
      workspace_id: 'ws-1',
      partner: 'therealmusicdistro',
      reason_code: 'ARTWORK_REJECTED',
      reason_text: 'The cover has a QR code on it.',
      raw: { status: 'rejected', detail: { stores: ['spotify'] } },
    });
  });

  it('still stores a rejection that comes with no reason, keeping whatever the payload held', async () => {
    const { client, inserts } = makeClient(completeDb());
    await recordDistributionRejection(client, {
      releaseId: 'rel-1',
      ownerUserId: 'owner-1',
      raw: { status: 'rejected' },
    });
    expect(inserts[0].row).toMatchObject({ reason_code: null, reason_text: null, raw: { status: 'rejected' } });
  });

  it('cuts an over-long reason rather than losing the rejection', async () => {
    const { client, inserts } = makeClient(completeDb());
    await recordDistributionRejection(client, {
      releaseId: 'rel-1',
      ownerUserId: 'owner-1',
      reasonText: 'x'.repeat(5000),
    });
    expect((inserts[0].row.reason_text as string).length).toBe(2000);
  });

  it('never throws, and answers null when the write fails', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = makeClient(completeDb(), { failInsertOn: 'distribution_rejections' });
    await expect(
      recordDistributionRejection(client, { releaseId: 'rel-1', ownerUserId: 'owner-1', reasonText: 'x' })
    ).resolves.toBeNull();
    quiet.mockRestore();
  });

  it('shows what the distributor sent back, newest first', async () => {
    const db = completeDb();
    db.distribution_rejections = [
      { id: 'a', release_id: 'rel-1', partner: 'therealmusicdistro', reason_code: null, reason_text: 'Old one', created_at: '2026-10-01T00:00:00Z' },
      { id: 'b', release_id: 'rel-1', partner: 'therealmusicdistro', reason_code: 'X', reason_text: 'New one', created_at: '2026-10-08T00:00:00Z' },
      { id: 'c', release_id: 'other', partner: 'therealmusicdistro', reason_code: null, reason_text: 'Not ours', created_at: '2026-10-09T00:00:00Z' },
    ];
    const rejections = await loadRejections(makeClient(db).client, 'rel-1');
    expect(rejections.map((row) => row.reasonText)).toEqual(['New one', 'Old one']);
    expect(rejections[0]).toMatchObject({ id: 'b', reasonCode: 'X', partner: 'therealmusicdistro' });
  });

  it('answers none when the read fails, since it is shown beside the check and never decides it', async () => {
    const { client } = makeClient(completeDb(), { failSelectOn: ['distribution_rejections'] });
    expect(await loadRejections(client, 'rel-1')).toEqual([]);
  });
});

describe('loadDistributionPayload', () => {
  it('puts the check, the rejections and the last hand-off together', async () => {
    const db = completeDb();
    db.distribution_rejections = [
      { id: 'b', release_id: 'rel-1', partner: 'therealmusicdistro', reason_code: null, reason_text: 'Sent back', created_at: '2026-10-08T00:00:00Z' },
    ];
    db.billing_events = [
      { type: 'distribution_handoff', metadata: { releaseId: 'rel-1' }, created_at: '2026-10-07T09:00:00Z' },
      { type: 'distribution_handoff', metadata: { releaseId: 'other' }, created_at: '2026-10-09T09:00:00Z' },
    ];
    const payload = await loadDistributionPayload(makeClient(db).client, 'rel-1', NOW);
    expect(payload).toMatchObject({
      errors: [],
      warnings: [],
      lastHandoffAt: '2026-10-07T09:00:00Z',
    });
    expect(payload?.rejections.map((row) => row.reasonText)).toEqual(['Sent back']);
  });

  it('is null when the check could not run, rather than an all clear', async () => {
    const { client } = makeClient(completeDb(), { failSelectOn: ['releases'] });
    expect(await loadDistributionPayload(client, 'rel-1', NOW)).toBeNull();
  });
});

describe('recordDistributionHandoff', () => {
  it('records the hand-off against the rollout, with the warnings the person ordered past', async () => {
    const { client, inserts } = makeClient(completeDb());
    const landed = await recordDistributionHandoff(client, {
      releaseId: 'rel-1',
      ownerUserId: 'owner-1',
      actorUserId: 'user-2',
      acknowledgedWarnings: ['title_all_caps'],
    });
    expect(landed).toBe(true);
    expect(inserts[0].table).toBe('billing_events');
    expect(inserts[0].row).toMatchObject({
      type: 'distribution_handoff',
      workspace_id: 'ws-1',
      owner_user_id: 'owner-1',
      actor_user_id: 'user-2',
      metadata: { releaseId: 'rel-1', partner: 'therealmusicdistro', acknowledgedWarnings: ['title_all_caps'] },
    });
  });

  it('records no warnings key when there was nothing to acknowledge', async () => {
    const { client, inserts } = makeClient(completeDb());
    await recordDistributionHandoff(client, { releaseId: 'rel-1', ownerUserId: 'owner-1', actorUserId: 'u' });
    expect(inserts[0].row.metadata).toEqual({ releaseId: 'rel-1', partner: 'therealmusicdistro' });
  });
});
