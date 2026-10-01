import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import type { AppLockStatus } from '@urganize/native-bridge';

/**
 * The app lock's storage and the phone's own check. Off until someone turns it
 * on in Settings. The choice lives in the phone's secure store, not in the page,
 * so a person cannot be locked out by clearing the website's data and a page
 * cannot quietly switch the lock off.
 *
 * "Supported" means the phone can check at all: Face ID, a fingerprint, or just
 * a passcode. The phone's passcode is always allowed as the fallback, so someone
 * whose face is not recognised is never locked out of their own work.
 */
const STORAGE_KEY = 'urganize.appLock';

async function isLockSupported(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

async function readEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

async function writeEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(STORAGE_KEY, '1');
  else await SecureStore.deleteItemAsync(STORAGE_KEY);
}

/** Asks the phone to check the person. True only when it said yes. */
export async function authenticate(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      // Passcode is allowed as the fallback (the default), on purpose.
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

/**
 * What the page and the shell both need to know. The lock reads as OFF whenever
 * the phone can no longer check (the passcode was removed after the lock was
 * turned on), because keeping it on would lock the person out for good.
 */
export async function getLockStatus(): Promise<AppLockStatus> {
  const supported = await isLockSupported();
  const enabled = supported && (await readEnabled());
  return { supported, enabled };
}

/**
 * Turns the lock on or off. Turning it ON asks the phone to check once first,
 * so the person has proved it works before it can keep them out; if they cancel,
 * it stays off. Turning it off needs no check: they are already inside.
 */
export async function setLock(enabled: boolean): Promise<AppLockStatus> {
  if (enabled) {
    if (!(await isLockSupported())) {
      throw new Error('Set a passcode, Face ID or fingerprint on this phone first.');
    }
    if (!(await authenticate('Turn on the Urganize lock'))) return getLockStatus();
    await writeEnabled(true);
  } else {
    await writeEnabled(false);
  }
  return getLockStatus();
}
