import { describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_POSTHOG_EXTENSIONS,
  installBundledExtensionGuard,
  shouldLoadExternalPostHogExtension,
} from './posthog-extensions';

type Loader = (instance: unknown, name: string, cb: (error?: unknown) => void) => void;

function scopeWith(overrides: Record<string, unknown> = {}) {
  const loadExternalDependency = vi.fn<Loader>();
  return {
    scope: {
      __PosthogExtensions__: {
        loadExternalDependency,
        errorWrappingFunctions: {},
        ...overrides,
      },
    },
    loadExternalDependency,
  };
}

describe('shouldLoadExternalPostHogExtension', () => {
  it('refuses the extensions we bundle ourselves', () => {
    for (const name of BUNDLED_POSTHOG_EXTENSIONS) {
      expect(shouldLoadExternalPostHogExtension(name)).toBe(false);
    }
  });

  it('bundles exception-autocapture, which is the whole point of this module', () => {
    expect(shouldLoadExternalPostHogExtension('exception-autocapture')).toBe(false);
  });

  it('lets every other extension load over the network as before', () => {
    for (const name of ['toolbar', 'remote-config', 'posthog-recorder', 'surveys']) {
      expect(shouldLoadExternalPostHogExtension(name)).toBe(true);
    }
  });
});

describe('installBundledExtensionGuard', () => {
  it('swallows the redundant fetch for a bundled extension', () => {
    const { scope, loadExternalDependency } = scopeWith();
    expect(installBundledExtensionGuard(scope)).toBe(true);

    const cb = vi.fn();
    scope.__PosthogExtensions__.loadExternalDependency({}, 'exception-autocapture', cb);

    expect(loadExternalDependency).not.toHaveBeenCalled();
    // The core already invoked its callback from the bundled copy; invoking it
    // again here is what would double-register the error handlers.
    expect(cb).not.toHaveBeenCalled();
  });

  it('passes every other extension straight through, arguments intact', () => {
    const { scope, loadExternalDependency } = scopeWith();
    installBundledExtensionGuard(scope);

    const instance = { id: 'ph' };
    const cb = vi.fn();
    scope.__PosthogExtensions__.loadExternalDependency(instance, 'posthog-recorder', cb);

    expect(loadExternalDependency).toHaveBeenCalledWith(instance, 'posthog-recorder', cb);
  });

  it('REFUSES to install when the bundled copy did not register', () => {
    // The safety property: if importing the bundle failed (a blocked chunk, an
    // offline load), skipping the network fetch as well would leave exception
    // capture off entirely — strictly worse than the redundant request.
    const { scope, loadExternalDependency } = scopeWith({ errorWrappingFunctions: undefined });
    expect(installBundledExtensionGuard(scope)).toBe(false);

    scope.__PosthogExtensions__.loadExternalDependency({}, 'exception-autocapture', vi.fn());
    expect(loadExternalDependency).toHaveBeenCalledTimes(1);
  });

  it('is idempotent, so a second init cannot wrap the loader twice', () => {
    const { scope } = scopeWith();
    expect(installBundledExtensionGuard(scope)).toBe(true);
    expect(installBundledExtensionGuard(scope)).toBe(false);
  });

  it('does nothing when PostHog has not defined its extension bag yet', () => {
    expect(installBundledExtensionGuard({})).toBe(false);
    expect(installBundledExtensionGuard({ __PosthogExtensions__: {} })).toBe(false);
  });
});
