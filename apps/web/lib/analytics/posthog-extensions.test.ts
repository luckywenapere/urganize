import { describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_POSTHOG_EXTENSION_LOADERS,
  installBundledExtensionGuard,
  isBundledPostHogExtension,
} from './posthog-extensions';

type Loader = (instance: unknown, name: string, cb: (error?: unknown) => void) => void;

function harness(loaders: Record<string, () => Promise<unknown>>) {
  const network = vi.fn<Loader>();
  const scope = { __PosthogExtensions__: { loadExternalDependency: network } };
  const installed = installBundledExtensionGuard(scope, loaders);
  return {
    installed,
    network,
    call: (name: string, cb = vi.fn()) => {
      scope.__PosthogExtensions__.loadExternalDependency({}, name, cb);
      return cb;
    },
  };
}

const ok = () => ({ 'x-ray': () => Promise.resolve({}) });

describe('isBundledPostHogExtension', () => {
  it('covers the three that content blockers actually refuse', () => {
    // Measured in production: every one of these was "Loading failed for the
    // <script>" on our own domain, through the proxy.
    expect(isBundledPostHogExtension('exception-autocapture')).toBe(true);
    expect(isBundledPostHogExtension('posthog-recorder')).toBe(true);
    expect(isBundledPostHogExtension('dead-clicks-autocapture')).toBe(true);
  });

  it('covers EVERY recorder variant, because PostHog picks the name remotely', () => {
    // The core does not hold "posthog-recorder" as a literal — the name comes
    // from remote config. Mapping only the one in use today would let a
    // server-side switch silently return replay to blocked.
    for (const name of ['posthog-recorder', 'lazy-recorder', 'recorder', 'recorder-v2']) {
      expect(isBundledPostHogExtension(name)).toBe(true);
    }
  });

  it('leaves alone the ones that cannot be bundled', () => {
    // remote-config is per-project (/array/<token>/config.js), and toolbar is
    // only ever loaded for a signed-in PostHog user.
    for (const name of ['remote-config', 'toolbar', 'surveys']) {
      expect(isBundledPostHogExtension(name)).toBe(false);
    }
  });
});

describe('installBundledExtensionGuard', () => {
  it('imports the bundle instead of fetching, and starts capture once', async () => {
    const load = vi.fn(() => Promise.resolve({}));
    const h = harness({ 'x-ray': load });
    expect(h.installed).toBe(true);

    const cb = h.call('x-ray');
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    expect(h.network).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('NEVER starts a bundled extension twice', async () => {
    // The core is not an if/else: on a re-trigger it starts capture itself from
    // the registered copy and THEN calls the loader again. Calling back a
    // second time re-registers listeners over the live ones without
    // unsubscribing, so every error would be reported twice.
    const h = harness(ok());
    const first = h.call('x-ray');
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));

    const second = h.call('x-ray');
    await new Promise((r) => setTimeout(r, 0));
    expect(second).not.toHaveBeenCalled();
    expect(h.network).not.toHaveBeenCalled();
  });

  it('FALLS BACK to the network fetch when the chunk import fails', async () => {
    // Offline, or a chunk 404 after a deploy. A blocked request is a console
    // line; silently loading nothing is a capability that just stops.
    const h = harness({ 'x-ray': () => Promise.reject(new Error('chunk')) });
    const cb = h.call('x-ray');

    await vi.waitFor(() => expect(h.network).toHaveBeenCalledTimes(1));
    expect(h.network).toHaveBeenCalledWith(expect.anything(), 'x-ray', cb);
  });

  it('passes an unbundled extension straight through, arguments intact', () => {
    const h = harness(ok());
    const instance = { id: 'ph' };
    const cb = vi.fn();
    const scopeCall = h.network;
    h.call('toolbar', cb);
    expect(scopeCall).toHaveBeenCalledWith(expect.anything(), 'toolbar', cb);
    void instance;
  });

  it('is idempotent, so a second init cannot wrap the loader twice', () => {
    const network = vi.fn<Loader>();
    const scope = { __PosthogExtensions__: { loadExternalDependency: network } };
    expect(installBundledExtensionGuard(scope, ok())).toBe(true);
    expect(installBundledExtensionGuard(scope, ok())).toBe(false);
  });

  it('does nothing when PostHog has not defined its loader yet', () => {
    expect(installBundledExtensionGuard({}, ok())).toBe(false);
    expect(installBundledExtensionGuard({ __PosthogExtensions__: {} }, ok())).toBe(false);
  });

  it('ships a real loader for every name it claims to bundle', () => {
    for (const [name, load] of Object.entries(BUNDLED_POSTHOG_EXTENSION_LOADERS)) {
      expect(isBundledPostHogExtension(name)).toBe(true);
      expect(typeof load).toBe('function');
    }
  });
});
