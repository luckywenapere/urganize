import { describe, expect, it } from 'vitest';
import {
  CREDIT_VALUE_KOBO,
  CSV_BOM,
  HOME_SPEND_DAYS,
  MAX_NOTE_LENGTH,
  MAX_PAID_TO_LENGTH,
  MAX_SPEND_KOBO,
  PAYBACK_CATCH_UP_DAYS,
  SPEND_CATEGORIES,
  SPEND_CATEGORY_LABELS,
  SPEND_COPY,
  SPEND_ERRORS,
  buildSpendCsv,
  creditsDedupeKey,
  creditsLineAmountKobo,
  creditsLineNote,
  creditsSweepDays,
  groupCreditsByReleaseDay,
  homeSpendSince,
  isSpendCategory,
  lagosDayStartIso,
  neutraliseFormula,
  parsePaybackAnswer,
  parseSpendCreate,
  parseSpendDate,
  parseSpendPatch,
  paybackDueDay,
  paybackQuestion,
  paybackWindow,
  sortSpendLines,
  spendByCategory,
  spendCsvFileName,
  toPayback,
  toSpendLine,
  totalKobo,
  type SpendLine,
  type SpendLineRow,
} from './release-spend';

const TODAY = '2026-10-09';
const TASK_ID = '11111111-2222-4333-8444-555555555555';

const row = (over: Partial<SpendLineRow> = {}): SpendLineRow => ({
  id: 'line-1',
  release_id: 'rel-1',
  category: 'promo',
  amount_kobo: 5_000_000,
  paid_to: 'DJ Spinall',
  spent_on: '2026-10-01',
  task_id: null,
  source: 'manual',
  note: null,
  created_at: '2026-10-01T10:00:00.000Z',
  ...over,
});

const line = (over: Partial<SpendLine> = {}): SpendLine => ({ ...toSpendLine(row()), ...over });

describe('the brief\'s words', () => {
  it('has the eight categories, labelled exactly as the brief says', () => {
    expect([...SPEND_CATEGORIES]).toEqual([
      'distribution',
      'promo',
      'playlists',
      'video',
      'design',
      'writing_pr',
      'shows',
      'other',
    ]);
    expect(SPEND_CATEGORIES.map((c) => SPEND_CATEGORY_LABELS[c])).toEqual([
      'Distribution',
      'Promo (DJs and blogs)',
      'Playlists',
      'Video',
      'Design',
      'Writing and PR',
      'Shows',
      'Other',
    ]);
  });

  it('uses the brief\'s text for the section, the form, the tag and the export', () => {
    expect(SPEND_COPY.title).toBe('Spend');
    expect(SPEND_COPY.empty).toBe(
      'Nothing logged yet. Add what you pay for on this release, so you can see where the money went.'
    );
    expect(SPEND_COPY.addButton).toBe('Add spend');
    expect(SPEND_COPY.labels).toEqual({
      category: 'What for',
      amount: 'How much (₦)',
      paidTo: 'Paid to',
      date: 'Date',
      task: 'Task',
      note: 'Note',
    });
    expect(SPEND_COPY.automaticTag).toBe('Ordered in Urganize');
    expect(SPEND_COPY.totalLabel).toBe('Spent on this release');
    expect(SPEND_COPY.exportButton).toBe('Download CSV');
    expect(SPEND_COPY.homeTitle).toBe('Where the money went');
    expect(SPEND_COPY.paybackLabels).toEqual({ amount: 'Amount (₦)', note: 'Anything to add?' });
  });

  it('asks the payback question as the brief words it', () => {
    expect(paybackQuestion('Midnight EP')).toBe('What did Midnight EP pay back?');
    expect(paybackQuestion('  Midnight EP  ')).toBe('What did Midnight EP pay back?');
    expect(paybackQuestion('')).toBe('What did this rollout pay back?');
    expect(paybackQuestion(null)).toBe('What did this rollout pay back?');
  });

  it('puts no em dash, "ship" or "workspace" in anything a person reads', () => {
    const everything = [
      ...Object.values(SPEND_COPY).flatMap((value) => (typeof value === 'string' ? [value] : Object.values(value))),
      ...Object.values(SPEND_ERRORS),
      ...Object.values(SPEND_CATEGORY_LABELS),
    ];
    for (const text of everything) {
      expect(text, text).not.toMatch(/[—–]/);
      expect(text, text).not.toMatch(/\bship(ped|ping)?\b/i);
      expect(text, text).not.toMatch(/workspace/i);
    }
  });
});

describe('isSpendCategory', () => {
  it('accepts the eight and nothing else', () => {
    for (const category of SPEND_CATEGORIES) expect(isSpendCategory(category)).toBe(true);
    for (const bad of ['merch', 'Promo', '', null, undefined, 5, {}]) expect(isSpendCategory(bad)).toBe(false);
  });
});

describe('toSpendLine and toPayback', () => {
  it('maps a row, reading a bigint that arrives as text', () => {
    const result = toSpendLine(row({ amount_kobo: '1234500' as unknown as number }));
    expect(result.amountKobo).toBe(1_234_500);
    expect(result.releaseId).toBe('rel-1');
    expect(result.isAutomatic).toBe(false);
  });

  it('marks an Urganize line as automatic, which is what locks it', () => {
    expect(toSpendLine(row({ source: 'urganize' })).isAutomatic).toBe(true);
    expect(toSpendLine(row({ source: 'manual' })).isAutomatic).toBe(false);
  });

  it('never loses a line to a value it does not recognise', () => {
    const odd = toSpendLine(row({ category: 'merch', source: 'something-new' }));
    expect(odd.category).toBe('other');
    expect(odd.source).toBe('manual');
  });

  it('keeps only the date part of a spent_on timestamp', () => {
    expect(toSpendLine(row({ spent_on: '2026-10-01T00:00:00+00:00' })).spentOn).toBe('2026-10-01');
  });

  it('reads an unanswered payback as no amount, and zero as a real answer', () => {
    const asked = toPayback({ release_id: 'r', asked_at: 'a', amount_kobo: null, note: null, answered_at: null });
    expect(asked.amountKobo).toBeNull();
    expect(asked.answeredAt).toBeNull();
    const zero = toPayback({ release_id: 'r', asked_at: 'a', amount_kobo: 0, note: 'nothing', answered_at: 'b' });
    expect(zero.amountKobo).toBe(0);
    expect(zero.answeredAt).toBe('b');
  });
});

describe('totals and order', () => {
  it('adds the lines in kobo', () => {
    expect(totalKobo([])).toBe(0);
    expect(totalKobo([{ amountKobo: 5_000_000 }, { amountKobo: 1_250_050 }])).toBe(6_250_050);
  });

  it('is exact where floats are not (many small amounts)', () => {
    expect(totalKobo(Array.from({ length: 1000 }, () => ({ amountKobo: 10 })))).toBe(10_000);
  });

  it('puts the newest day first, then the latest added', () => {
    const lines = [
      line({ id: 'a', spentOn: '2026-10-01', createdAt: '2026-10-01T09:00:00Z' }),
      line({ id: 'b', spentOn: '2026-10-03', createdAt: '2026-10-03T09:00:00Z' }),
      line({ id: 'c', spentOn: '2026-10-03', createdAt: '2026-10-03T11:00:00Z' }),
    ];
    expect(sortSpendLines(lines).map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not change the list it was given', () => {
    const lines = [line({ id: 'a', spentOn: '2026-10-01' }), line({ id: 'b', spentOn: '2026-10-05' })];
    const copy = [...lines];
    sortSpendLines(lines);
    expect(lines).toEqual(copy);
  });
});

describe('spendByCategory (the Home card)', () => {
  it('sums each category, largest first, leaving out the ones with nothing', () => {
    const result = spendByCategory([
      { category: 'promo', amountKobo: 100 },
      { category: 'design', amountKobo: 900 },
      { category: 'promo', amountKobo: 300 },
    ]);
    expect(result).toEqual([
      { category: 'design', label: 'Design', amountKobo: 900 },
      { category: 'promo', label: 'Promo (DJs and blogs)', amountKobo: 400 },
    ]);
  });

  it('breaks a tie in the brief\'s category order', () => {
    const result = spendByCategory([
      { category: 'shows', amountKobo: 500 },
      { category: 'distribution', amountKobo: 500 },
    ]);
    expect(result.map((r) => r.category)).toEqual(['distribution', 'shows']);
  });

  it('is empty when nothing was spent', () => {
    expect(spendByCategory([])).toEqual([]);
    expect(spendByCategory([{ category: 'promo', amountKobo: 0 }])).toEqual([]);
  });
});

describe('homeSpendSince', () => {
  it('counts today and the 89 days before it, so 90 days in all', () => {
    expect(HOME_SPEND_DAYS).toBe(90);
    // 2026-10-09 minus 89 days is 2026-07-12.
    expect(homeSpendSince(new Date('2026-10-09T10:00:00Z'))).toBe('2026-07-12');
  });

  it('reads the day in Lagos, not UTC', () => {
    // 23:30 UTC on the 9th is already the 10th in Lagos.
    expect(homeSpendSince(new Date('2026-10-09T23:30:00Z'))).toBe('2026-07-13');
  });
});

describe('parseSpendDate', () => {
  it('takes a real day', () => {
    expect(parseSpendDate('2026-10-01', TODAY)).toBe('2026-10-01');
    expect(parseSpendDate('2024-02-29', TODAY)).toBe('2024-02-29');
  });

  it('refuses a day that does not exist, and junk', () => {
    expect(parseSpendDate('2026-02-30', TODAY)).toBeNull();
    expect(parseSpendDate('2026-13-01', TODAY)).toBeNull();
    expect(parseSpendDate('2026-10-1', TODAY)).toBeNull();
    expect(parseSpendDate('01/10/2026', TODAY)).toBeNull();
    expect(parseSpendDate('2026-10-01T10:00:00Z', TODAY)).toBeNull();
    expect(parseSpendDate('', TODAY)).toBeNull();
    expect(parseSpendDate(20261001, TODAY)).toBeNull();
    expect(parseSpendDate(null, TODAY)).toBeNull();
  });

  it('refuses a year that is almost certainly a typo', () => {
    expect(parseSpendDate('1999-12-31', TODAY)).toBeNull();
    expect(parseSpendDate('2000-01-01', TODAY)).toBe('2000-01-01');
    // A year ahead is fine (a booked show); two is not.
    expect(parseSpendDate('2027-10-09', TODAY)).toBe('2027-10-09');
    expect(parseSpendDate('2027-10-11', TODAY)).toBeNull();
    expect(parseSpendDate('2099-01-01', TODAY)).toBeNull();
  });
});

describe('parseSpendCreate', () => {
  const valid = { category: 'promo', amountNaira: '50,000', paidTo: 'DJ Spinall', spentOn: '2026-10-01' };

  it('reads a complete line, converting the naira once', () => {
    expect(parseSpendCreate(valid, TODAY)).toEqual({
      ok: true,
      value: {
        category: 'promo',
        amountKobo: 5_000_000,
        paidTo: 'DJ Spinall',
        spentOn: '2026-10-01',
        taskId: null,
        note: null,
      },
    });
  });

  it('defaults the date to today, the brief\'s default', () => {
    const result = parseSpendCreate({ category: 'design', amountNaira: 1000 }, TODAY);
    expect(result.ok && result.value.spentOn).toBe(TODAY);
    const blank = parseSpendCreate({ category: 'design', amountNaira: 1000, spentOn: '' }, TODAY);
    expect(blank.ok && blank.value.spentOn).toBe(TODAY);
  });

  it('accepts every category and refuses an unknown or missing one', () => {
    for (const category of SPEND_CATEGORIES) {
      expect(parseSpendCreate({ ...valid, category }, TODAY).ok).toBe(true);
    }
    expect(parseSpendCreate({ ...valid, category: 'merch' }, TODAY)).toEqual({ ok: false, error: SPEND_ERRORS.category });
    expect(parseSpendCreate({ amountNaira: 100 }, TODAY)).toEqual({ ok: false, error: SPEND_ERRORS.category });
    expect(parseSpendCreate(null, TODAY).ok).toBe(false);
    expect(parseSpendCreate('promo', TODAY).ok).toBe(false);
    expect(parseSpendCreate([], TODAY).ok).toBe(false);
  });

  it('refuses an amount that is not above zero', () => {
    for (const amountNaira of [0, '0', '', '  ', -5, '-5', 'abc', '5.001', null, undefined, {}, NaN]) {
      expect(parseSpendCreate({ ...valid, amountNaira }, TODAY), String(amountNaira)).toEqual({
        ok: false,
        error: SPEND_ERRORS.amount,
      });
    }
  });

  it('reads an amount typed with the sign, commas, spaces or kobo', () => {
    const kobo = (amountNaira: string | number) => {
      const result = parseSpendCreate({ ...valid, amountNaira }, TODAY);
      return result.ok ? result.value.amountKobo : null;
    };
    expect(kobo('₦5,000')).toBe(500_000);
    expect(kobo(' 5000.5 ')).toBe(500_050);
    expect(kobo(12_000)).toBe(1_200_000);
  });

  it('draws the ceiling at ₦1 billion', () => {
    const maxNaira = MAX_SPEND_KOBO / 100;
    expect(parseSpendCreate({ ...valid, amountNaira: String(maxNaira) }, TODAY).ok).toBe(true);
    expect(parseSpendCreate({ ...valid, amountNaira: `${maxNaira}.01` }, TODAY)).toEqual({
      ok: false,
      error: SPEND_ERRORS.amountTooLarge,
    });
    expect(parseSpendCreate({ ...valid, amountNaira: '99999999999999999999' }, TODAY).ok).toBe(false);
  });

  it('refuses a date that is not real', () => {
    expect(parseSpendCreate({ ...valid, spentOn: '2026-02-30' }, TODAY)).toEqual({ ok: false, error: SPEND_ERRORS.date });
    expect(parseSpendCreate({ ...valid, spentOn: 'yesterday' }, TODAY).ok).toBe(false);
  });

  it('trims paid to and the note, and treats blank as nothing', () => {
    const result = parseSpendCreate({ ...valid, paidTo: '  Blog  ', note: '   ' }, TODAY);
    expect(result.ok && result.value.paidTo).toBe('Blog');
    expect(result.ok && result.value.note).toBeNull();
  });

  it('holds paid to to 200 characters and the note to 1000', () => {
    expect(parseSpendCreate({ ...valid, paidTo: 'x'.repeat(MAX_PAID_TO_LENGTH) }, TODAY).ok).toBe(true);
    expect(parseSpendCreate({ ...valid, paidTo: 'x'.repeat(MAX_PAID_TO_LENGTH + 1) }, TODAY)).toEqual({
      ok: false,
      error: SPEND_ERRORS.paidTo,
    });
    expect(parseSpendCreate({ ...valid, note: 'x'.repeat(MAX_NOTE_LENGTH) }, TODAY).ok).toBe(true);
    expect(parseSpendCreate({ ...valid, note: 'x'.repeat(MAX_NOTE_LENGTH + 1) }, TODAY)).toEqual({
      ok: false,
      error: SPEND_ERRORS.note,
    });
  });

  it('takes a task id only if it is a uuid', () => {
    const ok = parseSpendCreate({ ...valid, taskId: TASK_ID.toUpperCase() }, TODAY);
    expect(ok.ok && ok.value.taskId).toBe(TASK_ID);
    expect(parseSpendCreate({ ...valid, taskId: 'not-a-uuid' }, TODAY)).toEqual({ ok: false, error: SPEND_ERRORS.task });
    expect(parseSpendCreate({ ...valid, taskId: 5 }, TODAY).ok).toBe(false);
    for (const empty of [null, undefined, '']) {
      const result = parseSpendCreate({ ...valid, taskId: empty }, TODAY);
      expect(result.ok && result.value.taskId).toBeNull();
    }
  });

  it('ignores any extra field, so a client cannot set the source or the owner', () => {
    const result = parseSpendCreate({ ...valid, source: 'urganize', createdBy: 'someone', dedupeKey: 'x', releaseId: 'other' }, TODAY);
    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.value).sort()).toEqual(
      ['amountKobo', 'category', 'note', 'paidTo', 'spentOn', 'taskId']
    );
  });
});

describe('parseSpendPatch', () => {
  it('changes only what was sent', () => {
    expect(parseSpendPatch({ amountNaira: '2,500' }, TODAY)).toEqual({ ok: true, value: { amountKobo: 250_000 } });
    expect(parseSpendPatch({ category: 'video' }, TODAY)).toEqual({ ok: true, value: { category: 'video' } });
  });

  it('clears the optional fields with null and leaves absent ones alone', () => {
    expect(parseSpendPatch({ paidTo: null, taskId: null, note: null }, TODAY)).toEqual({
      ok: true,
      value: { paidTo: null, taskId: null, note: null },
    });
    const onlyAmount = parseSpendPatch({ amountNaira: 100 }, TODAY);
    expect(onlyAmount.ok && 'note' in onlyAmount.value).toBe(false);
    expect(onlyAmount.ok && 'paidTo' in onlyAmount.value).toBe(false);
  });

  it('cannot clear what for, how much or the date', () => {
    expect(parseSpendPatch({ category: null }, TODAY).ok).toBe(false);
    expect(parseSpendPatch({ amountNaira: null }, TODAY).ok).toBe(false);
    expect(parseSpendPatch({ spentOn: null }, TODAY).ok).toBe(false);
  });

  it('refuses an empty edit and a body that is not an object', () => {
    expect(parseSpendPatch({}, TODAY)).toEqual({ ok: false, error: SPEND_ERRORS.nothing });
    expect(parseSpendPatch({ source: 'urganize' }, TODAY)).toEqual({ ok: false, error: SPEND_ERRORS.nothing });
    expect(parseSpendPatch(null, TODAY).ok).toBe(false);
    expect(parseSpendPatch('x', TODAY).ok).toBe(false);
  });

  it('applies the same checks as a new line', () => {
    expect(parseSpendPatch({ amountNaira: 0 }, TODAY).ok).toBe(false);
    expect(parseSpendPatch({ spentOn: '2026-02-30' }, TODAY).ok).toBe(false);
    expect(parseSpendPatch({ category: 'merch' }, TODAY).ok).toBe(false);
    expect(parseSpendPatch({ taskId: 'nope' }, TODAY).ok).toBe(false);
  });
});

describe('parsePaybackAnswer', () => {
  it('reads an amount and an optional note', () => {
    expect(parsePaybackAnswer({ amountNaira: '300,000', note: ' Two playlists added. ' })).toEqual({
      ok: true,
      value: { amountKobo: 30_000_000, note: 'Two playlists added.' },
    });
    expect(parsePaybackAnswer({ amountNaira: 5000 })).toEqual({ ok: true, value: { amountKobo: 500_000, note: null } });
  });

  it('takes zero, because nothing coming back is a real answer', () => {
    for (const amountNaira of [0, '0', '0.00', '₦0', '000']) {
      expect(parsePaybackAnswer({ amountNaira }), String(amountNaira)).toEqual({
        ok: true,
        value: { amountKobo: 0, note: null },
      });
    }
  });

  it('refuses a missing, negative or non-number amount', () => {
    for (const amountNaira of [undefined, null, '', 'abc', '-5', -1, '5.001', NaN]) {
      expect(parsePaybackAnswer({ amountNaira }).ok, String(amountNaira)).toBe(false);
    }
    expect(parsePaybackAnswer(null).ok).toBe(false);
  });

  it('holds the amount under ₦1 billion and the note under 1000 characters', () => {
    expect(parsePaybackAnswer({ amountNaira: `${MAX_SPEND_KOBO / 100}` }).ok).toBe(true);
    expect(parsePaybackAnswer({ amountNaira: `${MAX_SPEND_KOBO / 100}.01` }).ok).toBe(false);
    expect(parsePaybackAnswer({ amountNaira: 1, note: 'x'.repeat(MAX_NOTE_LENGTH + 1) }).ok).toBe(false);
  });
});

describe('the spreadsheet', () => {
  const lines = [
    line({ id: 'a', category: 'promo', amountKobo: 5_000_000, paidTo: 'DJ Spinall', spentOn: '2026-10-01', taskId: TASK_ID }),
    line({ id: 'b', category: 'distribution', amountKobo: 250_050, paidTo: null, spentOn: '2026-10-03', source: 'urganize', isAutomatic: true }),
  ];
  const parse = (csv: string) => csv.replace(CSV_BOM, '').split('\r\n');

  it('starts with a byte-order mark so Excel reads the naira sign and not mojibake', () => {
    expect(buildSpendCsv({ lines, payback: null }).startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM).toBe('﻿');
  });

  it('has the brief\'s column labels, then the lines newest first', () => {
    const rows = parse(buildSpendCsv({ lines, payback: null, taskTitles: new Map([[TASK_ID, 'Book the DJ']]) }));
    expect(rows[0]).toBe('"Date","What for","How much (₦)","Paid to","Task","Note","Source"');
    expect(rows[1]).toBe('"2026-10-03","Distribution","2500.50","","","","Ordered in Urganize"');
    expect(rows[2]).toBe('"2026-10-01","Promo (DJs and blogs)","50000","DJ Spinall","Book the DJ","",""');
  });

  it('writes amounts as plain numbers, so a spreadsheet can sum them', () => {
    const rows = parse(buildSpendCsv({ lines, payback: null }));
    for (const body of rows.slice(1, 3)) {
      const amount = body.split('","')[2];
      expect(amount).toMatch(/^\d+(\.\d{2})?$/);
      expect(amount).not.toMatch(/[₦,]/);
    }
  });

  it('ends with the total under a blank row, using only the first two columns', () => {
    const rows = parse(buildSpendCsv({ lines, payback: null }));
    expect(rows[3]).toBe('');
    expect(rows[4]).toBe('"Spent on this release","52500.50"');
    expect(rows.length).toBe(5);
  });

  it('adds the payback answer and its note when there is one', () => {
    const payback = { askedAt: 'a', amountKobo: 30_000_000, note: 'Two playlists added.', answeredAt: 'b' };
    const rows = parse(buildSpendCsv({ lines, payback }));
    expect(rows).toContain('"Paid back","300000"');
    expect(rows).toContain('"Payback note","Two playlists added."');
  });

  it('writes a payback of zero, and leaves out one nobody has answered', () => {
    const zero = parse(buildSpendCsv({ lines, payback: { askedAt: 'a', amountKobo: 0, note: null, answeredAt: 'b' } }));
    expect(zero).toContain('"Paid back","0"');
    expect(zero.some((r) => r.startsWith('"Payback note"'))).toBe(false);
    const unanswered = parse(buildSpendCsv({ lines, payback: { askedAt: 'a', amountKobo: null, note: null, answeredAt: null } }));
    expect(unanswered.some((r) => r.startsWith('"Paid back"'))).toBe(false);
  });

  it('is only the header and a zero total for a rollout with no lines', () => {
    const rows = parse(buildSpendCsv({ lines: [], payback: null }));
    expect(rows).toEqual(['"Date","What for","How much (₦)","Paid to","Task","Note","Source"', '', '"Spent on this release","0"']);
  });

  it('quotes a comma, a quote and a line break inside a note without breaking the row', () => {
    const csv = buildSpendCsv({ lines: [line({ note: 'Said "yes", then\nchanged it' })], payback: null });
    expect(csv).toContain('"Said ""yes"", then\nchanged it"');
  });

  it('uses CRLF between rows, which Excel and Sheets both read', () => {
    expect(buildSpendCsv({ lines, payback: null })).toContain('\r\n');
  });

  it('stops a typed formula from running when the file is opened', () => {
    const csv = buildSpendCsv({
      lines: [line({ paidTo: '=HYPERLINK("http://evil.test","pay")', note: '+1234', category: 'other' })],
      payback: { askedAt: 'a', amountKobo: 1, note: '@SUM(A1)', answeredAt: 'b' },
      taskTitles: new Map(),
    });
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.test"",""pay"")"`);
    expect(csv).toContain(`"'+1234"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
    expect(csv).not.toMatch(/,"=HYPERLINK/);
  });

  it('leaves ordinary text alone', () => {
    expect(neutraliseFormula('DJ Spinall')).toBe('DJ Spinall');
    expect(neutraliseFormula('')).toBe('');
    expect(neutraliseFormula('2 playlists')).toBe('2 playlists');
    for (const risky of ['=1+1', '+1', '-1', '@x', '\tx', '\rx']) {
      expect(neutraliseFormula(risky), JSON.stringify(risky)).toBe(`'${risky}`);
    }
  });

  it('names the file for the rollout and the day', () => {
    expect(spendCsvFileName('Midnight EP', '2026-10-09')).toBe('midnight-ep-spend-2026-10-09.csv');
    expect(spendCsvFileName('  Ọmọ & the Band!! ', '2026-10-09')).toBe('m-the-band-spend-2026-10-09.csv');
    expect(spendCsvFileName('', '2026-10-09')).toBe('rollout-spend-2026-10-09.csv');
    expect(spendCsvFileName(null, '2026-10-09')).toBe('rollout-spend-2026-10-09.csv');
    expect(spendCsvFileName('x'.repeat(80), '2026-10-09')).toBe(`${'x'.repeat(40)}-spend-2026-10-09.csv`);
  });
});

describe('the payback window', () => {
  it('is due 30 days after release day, to the calendar day', () => {
    expect(paybackDueDay('2026-09-01')).toBe('2026-10-01');
    expect(paybackDueDay('2026-01-31')).toBe('2026-03-02');
    expect(paybackDueDay('2024-01-30')).toBe('2024-02-29');
    expect(paybackDueDay(null)).toBeNull();
    expect(paybackDueDay('not a date')).toBeNull();
  });

  it('is not yet the day before it is due', () => {
    expect(paybackWindow('2026-09-01', new Date('2026-09-30T10:00:00Z'))).toBe('not_yet');
  });

  it('is open on the due day and the two days after it', () => {
    expect(PAYBACK_CATCH_UP_DAYS).toBe(3);
    expect(paybackWindow('2026-09-01', new Date('2026-10-01T07:00:00Z'))).toBe('open');
    expect(paybackWindow('2026-09-01', new Date('2026-10-02T07:00:00Z'))).toBe('open');
    expect(paybackWindow('2026-09-01', new Date('2026-10-03T07:00:00Z'))).toBe('open');
  });

  it('is past from the fourth day on, so a rollout from months ago is never asked', () => {
    expect(paybackWindow('2026-09-01', new Date('2026-10-04T07:00:00Z'))).toBe('past');
    expect(paybackWindow('2025-01-01', new Date('2026-10-09T07:00:00Z'))).toBe('past');
  });

  it('counts the day in Lagos', () => {
    // 23:30 UTC on 30 Sept is already 1 Oct in Lagos: the due day.
    expect(paybackWindow('2026-09-01', new Date('2026-09-30T23:30:00Z'))).toBe('open');
  });

  it('is no_date with no release day', () => {
    expect(paybackWindow(null, new Date())).toBe('no_date');
    expect(paybackWindow('', new Date())).toBe('no_date');
  });
});

describe('the credits line', () => {
  it('values a credit at ₦15, which is $0.01 at ₦1,500 to the dollar', () => {
    expect(CREDIT_VALUE_KOBO).toBe(1500);
    expect(creditsLineAmountKobo(1)).toBe(1500);
    expect(creditsLineAmountKobo(12)).toBe(18_000);
  });

  it('is nothing for no credits', () => {
    expect(creditsLineAmountKobo(0)).toBe(0);
    expect(creditsLineAmountKobo(-3)).toBe(0);
    expect(creditsLineAmountKobo(Number.NaN)).toBe(0);
  });

  it('says how many credits it was', () => {
    expect(creditsLineNote(1)).toBe('1 UrgAns credit');
    expect(creditsLineNote(12)).toBe('12 UrgAns credits');
  });

  it('keys a line by rollout and day, so the same day is one line', () => {
    expect(creditsDedupeKey('rel-1', '2026-10-08')).toBe('credits:rel-1:2026-10-08');
    expect(creditsDedupeKey('rel-1', '2026-10-08')).not.toBe(creditsDedupeKey('rel-2', '2026-10-08'));
    expect(creditsDedupeKey('rel-1', '2026-10-08')).not.toBe(creditsDedupeKey('rel-1', '2026-10-07'));
  });

  it('sweeps the last three finished Lagos days, oldest first, leaving today out', () => {
    expect(creditsSweepDays(new Date('2026-10-09T07:00:00Z'))).toEqual(['2026-10-06', '2026-10-07', '2026-10-08']);
    // Across a month end.
    expect(creditsSweepDays(new Date('2026-11-01T07:00:00Z'))).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
  });

  it('starts a Lagos day an hour before the UTC day', () => {
    expect(lagosDayStartIso('2026-10-08')).toBe('2026-10-07T23:00:00.000Z');
    expect(lagosDayStartIso('nope')).toBeNull();
  });

  describe('adding a day\'s usage up per rollout', () => {
    const usage = (releaseId: string, createdAt: string, creditsCharged: number) => ({ releaseId, createdAt, creditsCharged });

    it('sums one rollout\'s credits for one Lagos day', () => {
      const result = groupCreditsByReleaseDay([
        usage('r1', '2026-10-08T08:00:00Z', 5),
        usage('r1', '2026-10-08T15:00:00Z', 7),
      ]);
      expect(result).toEqual([{ releaseId: 'r1', day: '2026-10-08', credits: 12 }]);
    });

    it('puts a call after 23:00 UTC on the next Lagos day', () => {
      const result = groupCreditsByReleaseDay([
        usage('r1', '2026-10-08T22:59:59Z', 1),
        usage('r1', '2026-10-08T23:00:00Z', 2),
      ]);
      expect(result).toEqual([
        { releaseId: 'r1', day: '2026-10-08', credits: 1 },
        { releaseId: 'r1', day: '2026-10-09', credits: 2 },
      ]);
    });

    it('keeps rollouts apart', () => {
      const result = groupCreditsByReleaseDay([
        usage('r2', '2026-10-08T08:00:00Z', 3),
        usage('r1', '2026-10-08T08:00:00Z', 4),
      ]);
      expect(result).toEqual([
        { releaseId: 'r1', day: '2026-10-08', credits: 4 },
        { releaseId: 'r2', day: '2026-10-08', credits: 3 },
      ]);
    });

    it('leaves out a day that was not asked for', () => {
      const result = groupCreditsByReleaseDay(
        [usage('r1', '2026-10-05T08:00:00Z', 9), usage('r1', '2026-10-08T08:00:00Z', 2)],
        ['2026-10-08']
      );
      expect(result).toEqual([{ releaseId: 'r1', day: '2026-10-08', credits: 2 }]);
    });

    it('ignores a call that cost nothing, a bad date and a call with no rollout', () => {
      const result = groupCreditsByReleaseDay([
        usage('r1', '2026-10-08T08:00:00Z', 0),
        usage('r1', 'not a date', 5),
        usage('', '2026-10-08T08:00:00Z', 5),
        usage('r1', '2026-10-08T08:00:00Z', Number.NaN),
      ]);
      expect(result).toEqual([]);
    });
  });
});
