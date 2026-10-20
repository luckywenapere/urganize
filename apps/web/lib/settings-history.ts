// How the settings pop-up and the browser's history agree (QA, 2026-10-20).
//
// Opening from closed pushes ONE history entry, so the OS back-swipe closes the
// pop-up. Closing then has to give that entry back, or every open/close cycle
// leaves a duplicate page behind and Back walks through them. Pure, in lib/, so
// vitest can hold the rules; the components only call these.

import { SETTINGS_PARAM } from './settings-nav';

let pushedByUs = false;

/** This page life pushed the open-Settings entry. */
export function markSettingsEntryPushed(): void {
  pushedByUs = true;
}

/** Forget it: the pop-up is closed, or the entry was replaced away. */
export function clearSettingsEntryMark(): void {
  pushedByUs = false;
}

export function settingsEntryWasPushed(): boolean {
  return pushedByUs;
}

/**
 * Close by going back one entry only when WE pushed the open entry and the URL
 * still carries the settings param. A deep link (no entry of ours) or a URL the
 * param already left must replace instead: back() there would leave the app or
 * the wrong page.
 */
export function shouldPopSettingsEntry(input: { pushedByUs: boolean; search: string }): boolean {
  return input.pushedByUs && new URLSearchParams(input.search.replace(/^\?/, '')).has(SETTINGS_PARAM);
}

export type SettingsPopstateAction = 'reprompt' | 'closed' | 'ignore';

/**
 * The browser moved while the pop-up was showing (OS back-swipe, Back button).
 * Still open in the URL: nothing to do. Gone and nothing unsaved: let it
 * close. Gone with unsaved edits: put the entry back and ask first.
 */
export function decideSettingsPopstate(input: { settingsInUrl: boolean; dirty: boolean }): SettingsPopstateAction {
  if (input.settingsInUrl) return 'ignore';
  return input.dirty ? 'reprompt' : 'closed';
}
