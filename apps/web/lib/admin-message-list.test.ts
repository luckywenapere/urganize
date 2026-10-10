import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseComposePrefill } from './email/compose-prefill';
import {
  LIFECYCLE_STAGES,
  STAGE_INFO,
  messageComposeHref,
  messageDraft,
  firstName,
  isMailtoSafeEmail,
  messageMailto,
  stageLine,
  stalledStage,
  type StageFacts,
} from './admin-message-list';

const done: StageFacts = {
  realReleases: 2,
  members: 3,
  firstInviteAt: '2026-08-01T00:00:00.000Z',
  paying: true,
  firstLiveAt: '2026-08-20T00:00:00.000Z',
  secondReleaseStarted: true,
};

describe('stalledStage', () => {
  it('follows the strategy doc order: activate, convert, first release, second release, expand', () => {
    expect(stalledStage({ ...done, realReleases: 0, members: 1, firstInviteAt: null })).toEqual({
      stage: 'activate',
      missing: 'No rollout or teammate yet',
    });
    expect(stalledStage({ ...done, realReleases: 0 }).missing).toBe('No rollout yet');
    expect(stalledStage({ ...done, members: 1, firstInviteAt: null }).missing).toBe('No teammate yet');
    expect(stalledStage({ ...done, paying: false, firstLiveAt: null }).stage).toBe('convert');
    expect(stalledStage({ ...done, firstLiveAt: null, secondReleaseStarted: false }).stage).toBe('first_release');
    expect(stalledStage({ ...done, secondReleaseStarted: false }).stage).toBe('second_release');
    expect(stalledStage(done).stage).toBe('expand');
  });

  it('counts a pending invite as a teammate, even before they join', () => {
    expect(stalledStage({ ...done, members: 1 }).stage).toBe('expand');
  });

  it('puts a team that is neither paying nor activated at Activate, the earlier stage', () => {
    expect(stalledStage({ ...done, paying: false, realReleases: 0, firstLiveAt: null }).stage).toBe('activate');
  });

  it('puts a paying team with no rollout at Activate, not past it', () => {
    expect(stalledStage({ ...done, realReleases: 0, firstLiveAt: null }).stage).toBe('activate');
  });
});

describe('stage words', () => {
  it('names the stage number and its owner from the strategy doc', () => {
    expect(stageLine('convert')).toBe('Stage 4, Convert. Oyin writes');
    expect(stageLine('activate')).toBe('Stage 3, Activate. Chidera writes');
    expect(Object.values(STAGE_INFO).map((info) => info.number)).toEqual([3, 4, 5, 6, 7]);
  });

  it('firstName takes the first word, null for nothing', () => {
    expect(firstName('  Ada  Obi ')).toBe('Ada');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});

describe('messageMailto', () => {
  it('opens a draft to the owner only, with the team in the subject and a first-name greeting', () => {
    const link = messageMailto({ email: 'ada@example.com', ownerName: 'Ada Obi', teamName: 'Obi & Co', stage: 'convert' });
    expect(link).not.toBeNull();
    const url = new URL(link as string);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('ada@example.com');
    expect(url.searchParams.get('subject')).toBe('Checking in on Obi & Co');
    expect(url.searchParams.get('body')?.startsWith('Hi Ada,\n\n')).toBe(true);
    expect(url.searchParams.has('cc')).toBe(false);
    expect(url.searchParams.has('bcc')).toBe(false);
    // Spaces are %20, never "+", which some mail apps print as a plus.
    expect(link).not.toContain('+');
  });

  it('falls back to "Hi," and a plain subject when names are missing', () => {
    const url = new URL(messageMailto({ email: 'a@b.co', ownerName: null, teamName: null, stage: 'expand' }) as string);
    expect(url.searchParams.get('subject')).toBe('Checking in');
    expect(url.searchParams.get('body')?.startsWith('Hi,\n\n')).toBe(true);
  });

  it('gives no link when the email is missing or could add a recipient or header', () => {
    for (const email of [null, '', 'not-an-email', 'a@b.co,c@d.co', 'a@b.co?cc=x@y.co', 'a b@c.co', 'a@b.co#x', 'a@b.co;c@d.co']) {
      expect(isMailtoSafeEmail(email)).toBe(false);
      expect(messageMailto({ email, ownerName: 'A', teamName: 'T', stage: 'activate' })).toBeNull();
    }
    expect(isMailtoSafeEmail('first.last+urg@mail.example.ng')).toBe(true);
  });

  it('has a different opener for each stage', () => {
    const bodies = (Object.keys(STAGE_INFO) as Array<keyof typeof STAGE_INFO>).map(
      (stage) => new URL(messageMailto({ email: 'a@b.co', ownerName: null, teamName: null, stage }) as string).searchParams.get('body')
    );
    expect(new Set(bodies).size).toBe(bodies.length);
  });
});

describe('messageComposeHref (Draft in Emails)', () => {
  it('opens the admin composer aimed at the owner alone, with the subject and opener filled in', () => {
    const href = messageComposeHref({ email: 'ada@example.com', teamName: 'Obi & Co', stage: 'convert' });
    expect(href?.startsWith('/admin/emails/new?')).toBe(true);
    const draft = parseComposePrefill(new URL(href as string, 'https://app.urganize.app').searchParams);
    expect(draft).toEqual({
      to: 'ada@example.com',
      subject: 'Checking in on Obi & Co',
      body: messageDraft({ teamName: 'Obi & Co', stage: 'convert' }).ask,
    });
    // The composer adds "Hi <name>," itself, so the draft does not.
    expect(draft?.body.startsWith('Hi')).toBe(false);
  });

  it('gives no link when the email is missing or could add a recipient', () => {
    for (const email of [null, '', 'not-an-email', 'a@b.co,c@d.co', 'a@b.co?cc=x@y.co']) {
      expect(messageComposeHref({ email, teamName: 'T', stage: 'activate' })).toBeNull();
    }
  });

  it('says the same thing as the mailto draft', () => {
    for (const stage of Object.keys(STAGE_INFO) as Array<keyof typeof STAGE_INFO>) {
      const mail = new URL(messageMailto({ email: 'a@b.co', ownerName: 'Ada', teamName: 'T', stage }) as string);
      const compose = parseComposePrefill(
        new URL(messageComposeHref({ email: 'a@b.co', teamName: 'T', stage }) as string, 'https://x.test').searchParams
      );
      expect(mail.searchParams.get('subject')).toBe(compose?.subject);
      expect(mail.searchParams.get('body')).toContain(compose?.body as string);
    }
  });
});

describe('stage owners, kept in one place', () => {
  it('matches the owners in the strategy doc lifecycle table (section 6)', () => {
    const doc = readFileSync(resolve(__dirname, '../../../docs/strategy/company-strategy.md'), 'utf8');
    const section = doc.slice(doc.indexOf('## 6. Customer lifecycle'), doc.indexOf('## 7.'));
    const rows = section
      .split('\n')
      .map((line) => line.match(/^\|\s*(\d+)\.\s*([^|]+?)\s*\|[^|]*\|\s*([^|]+?)\s*\|/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => ({ number: Number(match[1]), label: match[2], owner: match[3] }));
    expect(rows).toHaveLength(LIFECYCLE_STAGES.length);
    for (const stage of LIFECYCLE_STAGES) {
      const row = rows.find((entry) => entry.number === stage.number);
      expect(row?.label).toBe(stage.label);
      // "Oyin (KB follows up)" is owned by Oyin.
      expect(row?.owner.split(' (')[0]).toBe(stage.owner);
    }
  });

  it('reads the stalled stages from that one list', () => {
    for (const info of Object.values(STAGE_INFO)) {
      expect(LIFECYCLE_STAGES).toContainEqual(info);
    }
  });
});
