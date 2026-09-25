import { describe, expect, it } from 'vitest';
import { resolvePageAppearance } from './native-appearance';

// What the Expo shell is told about the page, so the bars above and below the
// webview match it. The design token is preferred because it does not animate:
// a computed background read mid-transition would report a colour between two
// themes.

describe('resolvePageAppearance', () => {
  it('reads the ground colour token and pairs it with readable bar text', () => {
    expect(resolvePageAppearance({ token: ' 245 240 230', computed: 'rgb(0, 0, 0)' })).toEqual({
      background: '#f5f0e6',
      statusBar: 'dark',
    });
    expect(resolvePageAppearance({ token: '13 18 14', computed: null })).toEqual({
      background: '#0d120e',
      statusBar: 'light',
    });
  });

  it('falls back to the computed background when the token is missing or unreadable', () => {
    expect(resolvePageAppearance({ token: '', computed: 'rgb(245, 240, 230)' })).toEqual({
      background: '#f5f0e6',
      statusBar: 'dark',
    });
    expect(resolvePageAppearance({ token: 'not a colour', computed: 'rgb(13, 18, 14)' })?.background).toBe('#0d120e');
  });

  it('says nothing rather than guess when neither can be read', () => {
    expect(resolvePageAppearance({ token: undefined, computed: 'rgba(0, 0, 0, 0)' })).toBeNull();
    expect(resolvePageAppearance({ token: null, computed: undefined })).toBeNull();
  });
});
