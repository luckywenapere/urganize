// Quick verification — run with: node --experimental-strip-types apps/web/lib/paywall-allowlist.test.mts
//
// Imports the real config and walks the matrix the user spec cares about:
// each listed email is allowlisted, whitespace + casing variants normalize,
// non-listed emails are still blocked, missing/null is safe.

import { isAllowlistedEmail, PAYWALL_ALLOWLIST_EMAILS } from './paywall-allowlist.ts';

type Case = { input: unknown; expected: boolean; label: string };

const cases: Case[] = [
  // Each address from the spec, verbatim.
  { input: 'luckydio10@gmail.com',            expected: true,  label: 'spec #1' },
  { input: 'luckywenapere@gmail.com',         expected: true,  label: 'spec #2' },
  { input: 'aesthetique.toine@gmail.com',     expected: true,  label: 'spec #3' },
  { input: 'adamukabiru772@gmail.com',        expected: true,  label: 'spec #4' },
  { input: 'itsderah@gmail.com',              expected: true,  label: 'spec #5' },
  { input: 'ewaoluwaadenaiye@gmail.com',      expected: true,  label: 'spec #6' },

  // Normalization — casing / whitespace must not break.
  { input: 'LUCKYDIO10@GMAIL.COM',            expected: true,  label: 'uppercase' },
  { input: '  itsderah@gmail.com  ',          expected: true,  label: 'whitespace pad' },
  { input: 'Itsderah@Gmail.com',              expected: true,  label: 'mixed case' },

  // Non-listed emails must NOT bypass.
  { input: 'random.person@gmail.com',         expected: false, label: 'random gmail' },
  { input: 'lucky.wenapere@pentagonsecurities.net', expected: false, label: 'similar non-listed' },
  { input: '',                                expected: false, label: 'empty string' },
  { input: null,                              expected: false, label: 'null' },
  { input: undefined,                         expected: false, label: 'undefined' },
  { input: 42 as unknown,                     expected: false, label: 'non-string' },
];

let passed = 0;
let failed = 0;

for (const { input, expected, label } of cases) {
  const actual = isAllowlistedEmail(input as string | null | undefined);
  const ok = actual === expected;
  const inputStr = (JSON.stringify(input) ?? String(input)).padEnd(50);
  console.log(
    `${ok ? '✓' : '✗'} ${label.padEnd(24)} input=${inputStr} expected=${expected} got=${actual}`
  );
  if (ok) passed++;
  else failed++;
}

console.log('');
console.log(`Allowlist size: ${PAYWALL_ALLOWLIST_EMAILS.length}`);
console.log(`Entries (normalized, sorted):`);
for (const email of PAYWALL_ALLOWLIST_EMAILS) console.log(`  - ${email}`);

console.log('');
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
