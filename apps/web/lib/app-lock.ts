import type { AppLockStatus } from '@urganize/native-bridge';

/**
 * Words for the app lock row in Settings (the lock itself lives in the phone
 * app; see apps/mobile/src/useAppLock.ts). Kept here, away from the screen, so
 * the wording can be tested and so the row and its tests agree.
 */
export type AppLockCopy = {
  title: string;
  description: string;
  /** The button label, or null when there is nothing the person can press. */
  action: 'Turn on' | 'Turn off' | null;
};

export function describeAppLock(status: AppLockStatus): AppLockCopy {
  if (!status.supported) {
    return {
      title: 'App lock',
      description:
        'Set up Face ID, a fingerprint or a passcode on your phone, then come back to turn this on.',
      action: null,
    };
  }
  if (status.enabled) {
    return {
      title: 'App lock',
      description:
        'Urganize asks for Face ID, your fingerprint or your passcode when you open it after being away.',
      action: 'Turn off',
    };
  }
  return {
    title: 'App lock',
    description:
      'Ask for Face ID, your fingerprint or your passcode when you open Urganize. Good for unreleased music.',
    action: 'Turn on',
  };
}
