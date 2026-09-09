import { describe, expect, it } from 'vitest';
import {
  buildCreditDetailRows,
  buildCreditSubmissionPush,
  collaboratorLabel,
  creditSubmissionTag,
  creditSubmissionUrl,
  fillCreditPlaceholders,
  formatRoles,
  formatSplit,
  releaseLabel,
  type CreditSubmissionNotice,
} from './credit-notifications';
import { DEFAULT_NOTIFICATION_PRESETS } from './notification-presets';

const notice = (overrides: Partial<CreditSubmissionNotice> = {}): CreditSubmissionNotice => ({
  releaseId: 'rel-1',
  releaseTitle: 'Midnight EP',
  submissionId: 'sub-1',
  legalName: 'Adaeze Okonkwo',
  stageName: 'Ada',
  roles: ['songwriter'],
  email: 'ada@example.com',
  phone: '',
  country: '',
  songwriterSplit: 50,
  masterSplit: null,
  proAffiliation: '',
  ipiNumber: '',
  publisherName: '',
  publisherIpi: '',
  contribution: '',
  ...overrides,
});

describe('collaboratorLabel', () => {
  it('pairs the legal name with the stage name', () => {
    expect(collaboratorLabel({ legalName: 'Adaeze Okonkwo', stageName: 'Ada' })).toBe(
      'Adaeze Okonkwo (Ada)'
    );
  });

  it('does not repeat the name when the two match', () => {
    expect(collaboratorLabel({ legalName: 'Ada', stageName: 'ada' })).toBe('Ada');
  });

  it('falls back through stage name to a placeholder', () => {
    expect(collaboratorLabel({ legalName: '', stageName: 'Ada' })).toBe('Ada');
    expect(collaboratorLabel({ legalName: '  ', stageName: '  ' })).toBe('Someone');
  });
});

describe('releaseLabel', () => {
  it('defaults an untitled release rather than rendering a blank', () => {
    expect(releaseLabel('  ')).toBe('your rollout');
    expect(releaseLabel('Midnight EP')).toBe('Midnight EP');
  });
});

describe('fillCreditPlaceholders', () => {
  const values = { collaboratorName: 'Ada', releaseTitle: 'Midnight EP' };

  it('substitutes both placeholders, every occurrence', () => {
    expect(fillCreditPlaceholders('{collaboratorName} sent {collaboratorName}', values)).toBe(
      'Ada sent Ada'
    );
    expect(fillCreditPlaceholders('credits for “{releaseTitle}”', values)).toBe(
      'credits for “Midnight EP”'
    );
  });

  it('leaves an unknown placeholder alone rather than blanking it', () => {
    // A silently-emptied word reads as a broken product to whoever receives it.
    expect(fillCreditPlaceholders('hi {whatever}', values)).toBe('hi {whatever}');
  });

  it('handles copy with no placeholders at all', () => {
    expect(fillCreditPlaceholders('New credits arrived', values)).toBe('New credits arrived');
  });
});

describe('creditSubmissionUrl', () => {
  it('lands on the metadata scene, not the catalog', () => {
    expect(creditSubmissionUrl('rel-1')).toBe('/dashboard?release=rel-1&scene=metadata');
  });

  it('encodes the release id', () => {
    expect(creditSubmissionUrl('a b&c')).toBe('/dashboard?release=a%20b%26c&scene=metadata');
  });
});

describe('creditSubmissionTag', () => {
  it('is keyed on the submission, so two people never collapse into one', () => {
    // A per-release tag would make the push service REPLACE the first
    // notification with the second, showing the owner only the later person.
    expect(creditSubmissionTag('sub-1')).not.toBe(creditSubmissionTag('sub-2'));
  });

  it('is stable for the same submission', () => {
    expect(creditSubmissionTag('sub-1')).toBe(creditSubmissionTag('sub-1'));
  });

  it('does not contain the release id', () => {
    expect(creditSubmissionTag('sub-1')).not.toContain('rel-1');
  });
});

describe('buildCreditSubmissionPush', () => {
  it('renders the shipped default copy with real values', () => {
    const push = buildCreditSubmissionPush(notice(), DEFAULT_NOTIFICATION_PRESETS.creditSubmissions.copy);
    expect(push.title).toBe('New credits for “Midnight EP”');
    expect(push.body).toContain('Adaeze Okonkwo (Ada)');
    expect(push.url).toBe('/dashboard?release=rel-1&scene=metadata');
    expect(push.tag).toBe('credits-sub-1');
  });

  it('never leaves a placeholder visible in the shipped defaults', () => {
    const push = buildCreditSubmissionPush(notice(), DEFAULT_NOTIFICATION_PRESETS.creditSubmissions.copy);
    expect(push.title).not.toMatch(/\{|\}/);
    expect(push.body).not.toMatch(/\{|\}/);
  });

  it('survives a blank release title and a blank name', () => {
    const push = buildCreditSubmissionPush(
      notice({ releaseTitle: '', legalName: '', stageName: '' }),
      DEFAULT_NOTIFICATION_PRESETS.creditSubmissions.copy
    );
    expect(push.title).toContain('your rollout');
    expect(push.body).toContain('Someone');
  });

  it('uses whatever copy the admin saved', () => {
    const push = buildCreditSubmissionPush(notice(), {
      title: 'Ping',
      body: '{collaboratorName} on {releaseTitle}',
    });
    expect(push.title).toBe('Ping');
    expect(push.body).toBe('Adaeze Okonkwo (Ada) on Midnight EP');
  });
});

describe('formatSplit', () => {
  it('shows one decimal place at most', () => {
    expect(formatSplit(50)).toBe('50%');
    expect(formatSplit(33.3)).toBe('33.3%');
    expect(formatSplit(33.33)).toBe('33.3%');
  });

  it('says so plainly when there is no number', () => {
    expect(formatSplit(null)).toBe('not given');
  });

  it('keeps a zero share, which is a real answer', () => {
    expect(formatSplit(0)).toBe('0%');
  });
});

describe('formatRoles', () => {
  it('uses the human labels', () => {
    expect(formatRoles(['songwriter', 'producer'])).toBe('Songwriter, Producer');
  });

  it('degrades rather than rendering an empty string', () => {
    expect(formatRoles([])).toBe('not given');
  });
});

describe('buildCreditDetailRows', () => {
  it('drops every field they left blank', () => {
    const rows = buildCreditDetailRows(notice());
    const labels = rows.map((row) => row.label);
    expect(labels).toContain('Legal name');
    expect(labels).toContain('Writing share');
    // A wall of "not given" is worse than a short list.
    expect(labels).not.toContain('Phone');
    expect(labels).not.toContain('Publisher');
    expect(labels).not.toContain('Recording share');
  });

  it('carries every publishing field a distributor asks for when given', () => {
    const rows = buildCreditDetailRows(
      notice({
        masterSplit: 25,
        proAffiliation: 'COSON',
        ipiNumber: '00123456789',
        publisherName: 'SELF',
        publisherIpi: '00987654321',
        phone: '+2348012345678',
        country: 'Nigeria',
        contribution: 'Wrote the hook',
      })
    );
    const byLabel = new Map(rows.map((row) => [row.label, row.value]));
    expect(byLabel.get('Roles')).toBe('Songwriter');
    expect(byLabel.get('Writing share')).toBe('50%');
    expect(byLabel.get('Recording share')).toBe('25%');
    expect(byLabel.get('Society ID (IPI)')).toBe('00123456789');
    expect(byLabel.get('Publisher IPI')).toBe('00987654321');
    expect(byLabel.get('Country')).toBe('Nigeria');
    expect(byLabel.get('What they did')).toBe('Wrote the hook');
  });

  it('never emits a row with an empty value', () => {
    for (const row of buildCreditDetailRows(notice())) {
      expect(row.value.trim()).not.toBe('');
    }
  });
});
