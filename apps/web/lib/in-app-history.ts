/**
 * Whether this page life has visited an Urganize page other than Settings, so
 * the computer Settings page's X can go back instead of leaving the app when
 * Settings was opened from an outside link (Codex review on #1045). Memory
 * only: a reload starts again, and the X then goes Home.
 */
let lastPath: string | null = null;

export function noteInAppPath(path: string, settingsPath: string): void {
  if (path && path !== settingsPath) lastPath = path;
}

export function hasInAppPredecessor(): boolean {
  return lastPath !== null;
}
