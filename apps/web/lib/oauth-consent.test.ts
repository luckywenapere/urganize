import { describe, expect, it } from 'vitest';
import { describeRedirectTarget } from './oauth-consent';

describe('describeRedirectTarget', () => {
  it('names the site an https connection returns to', () => {
    expect(describeRedirectTarget('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai');
    expect(describeRedirectTarget('https://Chatgpt.COM/connector/oauth/abc')).toBe('chatgpt.com');
  });

  it('keeps a subdomain, because that is the part a lookalike changes', () => {
    expect(describeRedirectTarget('https://claude.ai.evil.example/cb')).toBe('claude.ai.evil.example');
  });

  it('describes a loopback address as an app on this computer, not as a website', () => {
    for (const uri of [
      'http://localhost:6274/oauth/callback',
      'http://127.0.0.1:33418/callback',
      'http://[::1]:8080/cb',
    ]) {
      expect(describeRedirectTarget(uri)).toBe('an app running on this computer');
    }
  });

  it('says nothing for a plain http address that is not loopback', () => {
    expect(describeRedirectTarget('http://example.com/cb')).toBeNull();
  });

  it('says nothing for schemes the registration route never accepts', () => {
    expect(describeRedirectTarget('javascript:alert(1)')).toBeNull();
    expect(describeRedirectTarget('cursor://anysphere.cursor/oauth')).toBeNull();
    expect(describeRedirectTarget('ftp://files.example.com/x')).toBeNull();
  });

  it('says nothing for a value that is not an address', () => {
    expect(describeRedirectTarget('')).toBeNull();
    expect(describeRedirectTarget('not a url')).toBeNull();
  });

  it('is not fooled by a loopback name in the path or the userinfo', () => {
    expect(describeRedirectTarget('http://example.com/localhost')).toBeNull();
    expect(describeRedirectTarget('http://localhost@example.com/cb')).toBeNull();
  });
});
