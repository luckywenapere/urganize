'use client';

import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import { showHomeChat } from '@/stores/useChappiHistoryStore';

const HISTORY_ENABLED = isChappiHistoryEnabled();

/**
 * Main is Home's permanent chat: what UrgAns opens on, where Home cards and the
 * composer post (URG-380). Its own tiny module so Home's card (OneThing, in
 * everyone's bundle) can reach it without pulling the UrgAns tab in.
 */
export async function showMain(): Promise<void> {
  if (HISTORY_ENABLED) await showHomeChat();
}
