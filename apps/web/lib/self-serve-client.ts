// Self-serve checkout, small browser helpers. localStorage can throw (Safari
// private mode, a full quota); a lost flag only means a screen shows twice.

export function readStoredFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function writeStoredFlag(key: string): void {
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Ignore: the worst case is seeing the screen again.
  }
}
