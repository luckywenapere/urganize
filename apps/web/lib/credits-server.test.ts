import { describe, expect, it } from 'vitest';
import { CREDIT_TOKEN_SHAPE, classifyCreditLinkRow } from './credits-server';

// Only the pure halves are covered here: loadPublicCreditForm itself needs a
// service-role Supabase client, and this suite runs with no network.

describe('classifyCreditLinkRow', () => {
  it('reads a missing row as missing', () => {
    expect(classifyCreditLinkRow(null)).toBe('missing');
    expect(classifyCreditLinkRow(undefined)).toBe('missing');
  });

  it('reads a row with no release as missing', () => {
    // maybeSingle() can hand back a row shape with nothing useful in it; a link
    // that points at no release is indistinguishable from no link at all.
    expect(classifyCreditLinkRow({})).toBe('missing');
    expect(classifyCreditLinkRow({ release_id: '' })).toBe('missing');
    expect(classifyCreditLinkRow({ release_id: null, closed_at: '2026-08-27T10:00:00Z' })).toBe(
      'missing'
    );
  });

  it('reads a live link as open', () => {
    expect(classifyCreditLinkRow({ release_id: 'rel-1' })).toBe('open');
    expect(classifyCreditLinkRow({ release_id: 'rel-1', closed_at: null })).toBe('open');
    expect(classifyCreditLinkRow({ release_id: 'rel-1', closed_at: undefined })).toBe('open');
  });

  it('reads a stamped closed_at as closed', () => {
    expect(classifyCreditLinkRow({ release_id: 'rel-1', closed_at: '2026-08-27T10:00:00Z' })).toBe(
      'closed'
    );
  });
});

describe('CREDIT_TOKEN_SHAPE', () => {
  it('accepts the 24-char base64url tokens the route mints', () => {
    expect(CREDIT_TOKEN_SHAPE.test('abcDEF123456_-abcDEF12345')).toBe(true);
  });

  it('rejects junk paths before they ever reach the database', () => {
    expect(CREDIT_TOKEN_SHAPE.test('')).toBe(false);
    expect(CREDIT_TOKEN_SHAPE.test('short')).toBe(false);
    expect(CREDIT_TOKEN_SHAPE.test('has spaces in it here')).toBe(false);
    expect(CREDIT_TOKEN_SHAPE.test('../../etc/passwd-aaaaaaaa')).toBe(false);
    expect(CREDIT_TOKEN_SHAPE.test('a'.repeat(65))).toBe(false);
  });
});
