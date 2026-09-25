import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeRequest,
  encodeResponse,
  type BridgeRequestMessage,
  type BridgeRequestType,
  type ShellInfo,
} from '@urganize/native-bridge';

// The share helpers inside the Expo shell. Each test stands up a fake shell:
// the injected description, a post channel that records every request, and an
// answer delivered back through the receiver the page installs — the same
// path react-native-webview's injectJavaScript takes in the real app.

type Answer = { ok: true; result: unknown } | { ok: false; error: string };

function stubShell(capabilities: BridgeRequestType[], answer: (message: BridgeRequestMessage) => Answer) {
  const sent: BridgeRequestMessage[] = [];
  const win: Record<string, unknown> = {
    __URGANIZE_NATIVE__: { platform: 'android', shellVersion: 'test', protocol: 1, capabilities } satisfies ShellInfo,
    ReactNativeWebView: {
      postMessage: (raw: string) => {
        const message = decodeRequest(raw);
        if (!message) throw new Error(`the page posted something that is not a request: ${raw}`);
        sent.push(message);
        const outcome = message.type === 'ready' ? { ok: true as const, result: { ok: true } } : answer(message);
        // Asynchronous, as a real round trip through the webview is.
        setTimeout(() => (win.__urganizeBridgeReceive as (raw: string) => void)(encodeResponse(message.id, outcome)), 0);
      },
    },
  };
  vi.stubGlobal('window', win);
  return { sent };
}

async function loadShare() {
  return import('./share-file');
}

const PNG = new File([new Uint8Array([137, 80, 78, 71])], 'rollout-post.png', { type: 'image/png' });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('sharing a file inside the app', () => {
  it('can share when the shell says it can', async () => {
    stubShell(['shareFile'], () => ({ ok: true, result: { outcome: 'shared' } }));
    const { canShareFilesToApps } = await loadShare();
    expect(canShareFilesToApps(PNG)).toBe(true);
  });

  it('cannot share when this shell build has no file sharing', async () => {
    stubShell(['openExternal'], () => ({ ok: true, result: { outcome: 'shared' } }));
    const { canShareFilesToApps, shareFileToApps } = await loadShare();
    expect(canShareFilesToApps(PNG)).toBe(false);
    await expect(shareFileToApps({ file: PNG, title: 'Midnight' })).resolves.toBe('unsupported');
  });

  it('hands the bytes, name and type to the shell', async () => {
    const { sent } = stubShell(['shareFile'], () => ({ ok: true, result: { outcome: 'shared' } }));
    const { shareFileToApps } = await loadShare();
    await expect(shareFileToApps({ file: PNG, title: 'Midnight', text: 'Out Friday' })).resolves.toBe('shared');
    const share = sent.find((message) => message.type === 'shareFile');
    expect(share?.payload).toEqual({
      kind: 'base64',
      data: btoa(String.fromCharCode(137, 80, 78, 71)),
      fileName: 'rollout-post.png',
      mimeType: 'image/png',
      title: 'Midnight',
    });
  });

  it('reports a closed share sheet as cancelled, not as a failure', async () => {
    stubShell(['shareFile'], () => ({ ok: true, result: { outcome: 'cancelled' } }));
    const { shareFileToApps } = await loadShare();
    await expect(shareFileToApps({ file: PNG })).resolves.toBe('cancelled');
  });

  it('says it cannot share when the shell fails, rather than claiming success', async () => {
    stubShell(['shareFile'], () => ({ ok: false, error: 'Sharing is not available on this device.' }));
    const { shareFileToApps } = await loadShare();
    await expect(shareFileToApps({ file: PNG })).resolves.toBe('unsupported');
  });
});

describe('sharing text inside the app', () => {
  it('asks the shell to share the text', async () => {
    const { sent } = stubShell(['shareText'], () => ({ ok: true, result: { outcome: 'shared' } }));
    const { canShareTextToApps, shareTextToApps } = await loadShare();
    expect(canShareTextToApps()).toBe(true);
    await expect(shareTextToApps({ text: 'Hey! Pre-save it here', title: 'Midnight' })).resolves.toBe('shared');
    expect(sent.find((message) => message.type === 'shareText')?.payload).toEqual({
      text: 'Hey! Pre-save it here',
      title: 'Midnight',
    });
  });

  it('offers no share button when the shell cannot share text', async () => {
    const { sent } = stubShell(['shareFile'], () => ({ ok: true, result: { outcome: 'shared' } }));
    const { canShareTextToApps, shareTextToApps } = await loadShare();
    expect(canShareTextToApps()).toBe(false);
    await expect(shareTextToApps({ text: 'Hey!' })).resolves.toBe('unsupported');
    expect(sent.some((message) => message.type === 'shareText')).toBe(false);
  });

  it('reports a closed sheet as cancelled', async () => {
    stubShell(['shareText'], () => ({ ok: true, result: { outcome: 'cancelled' } }));
    const { shareTextToApps } = await loadShare();
    await expect(shareTextToApps({ text: 'Hey!' })).resolves.toBe('cancelled');
  });
});
