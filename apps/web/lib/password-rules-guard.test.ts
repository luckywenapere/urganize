import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attribute, openingTags } from './jsx-scan';

/**
 * One password rule, held across the whole app.
 *
 * lib/password-rules.ts says what it is. This reads the source to keep every
 * place that creates or changes a password on it, because vitest here has no
 * DOM and the forms themselves cannot be rendered: the three sign-up forms took
 * 6 characters while the reset page and Settings demanded 8, and nothing failed
 * when they disagreed.
 */

const WEB = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next') return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const rel = (path: string) => relative(WEB, path).split(sep).join('/');

const SOURCES = ['app', 'components', 'lib', 'stores']
  .flatMap((dir) => walk(join(WEB, dir)))
  .filter((path) => /\.tsx?$/.test(path))
  .filter((path) => !/\.test\.tsx?$/.test(path))
  .filter((path) => rel(path) !== 'lib/password-rules.ts');

const read = (path: string) => readFileSync(path, 'utf8');

describe('no screen restates the password rule', () => {
  it('finds the source it is meant to be reading', () => {
    expect(SOURCES.length).toBeGreaterThan(300);
  });

  it('never compares a password length against a literal number', () => {
    // `\w*` on both sides so `newPassword.length` and `passwordConfirm.length`
    // are caught, not only a variable called exactly `password`.
    const pattern = /\w*password\w*\.length\s*(?:<=|>=|===|!==|<|>)\s*\d/i;
    const found = SOURCES.filter((path) => pattern.test(read(path))).map(rel);
    expect(found).toEqual([]);
  });

  it('never prints a literal character count as a password rule', () => {
    // "At least 6 characters", "a password of 6 or more characters".
    const pattern = /\bat least \d+ characters|\b\d+ or more characters|\b\d+ characters or more/i;
    const found = SOURCES.filter((path) => pattern.test(read(path))).map(rel);
    expect(found).toEqual([]);
  });

  it('never gives a password field a literal minLength', () => {
    const found: string[] = [];
    for (const path of SOURCES.filter((file) => file.endsWith('.tsx'))) {
      const source = read(path);
      for (const tag of openingTags(source, ['input', 'Input'])) {
        if (attribute(tag, 'type') !== 'password') continue;
        const minLength = attribute(tag, 'minLength');
        if (minLength !== null && minLength.trim() !== 'MIN_PASSWORD_LENGTH') {
          found.push(`${rel(path)}:${tag.line} minLength={${minLength}}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});

describe('creating or changing a password is held to the rule', () => {
  // These are the places that set a NEW password. Each must use the shared
  // module, so raising or lowering the minimum is one edit.
  const CREATE_OR_CHANGE = [
    'app/onboarding/OnboardingPageClient.tsx',
    'app/invite/accept/InviteAcceptPageClient.tsx',
    'app/curator/join/[code]/CuratorJoinPageClient.tsx',
    'app/auth/reset-password/page.tsx',
    'components/settings/SecuritySection.tsx',
    'lib/onboarding-next-hint.ts',
  ];

  for (const file of CREATE_OR_CHANGE) {
    it(`${file} reads the shared rule`, () => {
      expect(read(join(WEB, file))).toMatch(/from '@\/lib\/password-rules'|from '\.\/password-rules'/);
    });
  }

  it('every new-password field in the app is in the list above', () => {
    // A new form that sets a password has to be added to the list, which is
    // the moment someone is reminded the shared rule exists.
    const setsAPassword = SOURCES.filter((path) => path.endsWith('.tsx'))
      .filter((path) =>
        openingTags(read(path), ['input', 'Input']).some(
          (tag) => attribute(tag, 'autoComplete') === 'new-password'
        )
      )
      .map(rel)
      .sort();
    expect(setsAPassword).toEqual([...CREATE_OR_CHANGE.filter((file) => file.endsWith('.tsx'))].sort());
  });
});

describe('signing in is never held to the minimum', () => {
  it('the login password field has no minLength', () => {
    // Accounts made before the minimum moved up can have a 6-character
    // password. A minLength here would turn them away from their own login.
    const source = read(join(WEB, 'app/auth/AuthPageClient.tsx'));
    const passwords = openingTags(source, ['input', 'Input']).filter((tag) => attribute(tag, 'type') === 'password');
    expect(passwords.length).toBeGreaterThan(0);
    for (const tag of passwords) expect(attribute(tag, 'minLength')).toBeNull();
  });

  it('the login form does not import the password rule', () => {
    expect(read(join(WEB, 'app/auth/AuthPageClient.tsx'))).not.toContain('password-rules');
  });
});
