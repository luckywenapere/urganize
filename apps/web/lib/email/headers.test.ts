import { describe, it, expect } from 'vitest';
import { composeFromHeader, composeReplyTo, extractAddress } from './headers';

// Pure From / Reply-To composition, moved verbatim from the old lib/email.ts.
// A display name and a reply-to override are both user-controlled, so this is
// the layer that keeps a hostile value from smuggling a different sending
// address or an extra header. Kept as a direct unit test of the pure functions.

describe('composeFromHeader', () => {
  it('replaces only the display name, keeping the verified address', () => {
    expect(composeFromHeader('Urganize <team@send.urganize.app>', 'Oyin via Urganize')).toBe(
      'Oyin via Urganize <team@send.urganize.app>'
    );
  });

  it('wraps a bare configured address', () => {
    expect(composeFromHeader('team@send.urganize.app', 'Oyin via Urganize')).toBe(
      'Oyin via Urganize <team@send.urganize.app>'
    );
  });

  it('returns the configured value untouched with no usable label', () => {
    expect(composeFromHeader('Urganize <team@send.urganize.app>')).toBe(
      'Urganize <team@send.urganize.app>'
    );
    expect(composeFromHeader('Urganize <team@send.urganize.app>', '   ')).toBe(
      'Urganize <team@send.urganize.app>'
    );
  });

  it('strips header-injection characters from a hostile profile name', () => {
    // A display name comes from profiles.name, so angle brackets, quotes and
    // line breaks must never reach the header — any of them could smuggle a
    // different sending address or an extra header.
    const hostile = 'Evil <attacker@evil.com>\r\nBcc: x@y.z" via Urganize';
    const composed = composeFromHeader('Urganize <team@send.urganize.app>', hostile);
    expect(composed.endsWith('<team@send.urganize.app>')).toBe(true);
    expect(composed).not.toContain('attacker@evil.com>');
    expect(composed).not.toContain('\r');
    expect(composed).not.toContain('\n');
    expect(composed).not.toContain('"');
  });

  it('caps an absurdly long label', () => {
    const composed = composeFromHeader('Urganize <team@send.urganize.app>', 'x'.repeat(300));
    expect(composed.length).toBeLessThan(120);
    expect(composed.endsWith('<team@send.urganize.app>')).toBe(true);
  });
});

describe('composeReplyTo', () => {
  it('prefers the override, so a reply reaches the person rather than us', () => {
    // The whole point of the work-request answer email: the From address is
    // always our verified sender, so Reply is the only thing that can put the
    // two people in touch.
    expect(composeReplyTo('hello@urganize.app', 'dami@example.com')).toBe('dami@example.com');
  });

  it('falls back to the configured mailbox with no usable override', () => {
    expect(composeReplyTo('hello@urganize.app')).toBe('hello@urganize.app');
    expect(composeReplyTo('hello@urganize.app', '   ')).toBe('hello@urganize.app');
  });

  it('returns null when neither is set', () => {
    expect(composeReplyTo(null)).toBeNull();
  });

  it('refuses an override that is not a plain single address', () => {
    // Anything carrying a line break, a comma, angle brackets or no @ falls
    // back rather than smuggling a second recipient or an extra header.
    for (const hostile of [
      'a@b.com\r\nBcc: x@y.z',
      'a@b.com, x@y.z',
      'Evil <a@b.com>',
      'not-an-address',
      '"a"@b.com',
      `${'x'.repeat(300)}@b.com`,
    ]) {
      expect(composeReplyTo('hello@urganize.app', hostile)).toBe('hello@urganize.app');
    }
  });
});

describe('extractAddress', () => {
  it('pulls the bare address out of a full From header', () => {
    expect(extractAddress('Urganize <team@send.urganize.app>')).toBe('team@send.urganize.app');
  });

  it('returns a bare address as-is', () => {
    expect(extractAddress('team@send.urganize.app')).toBe('team@send.urganize.app');
  });
});
