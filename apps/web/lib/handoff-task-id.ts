// The task id for one handoff row of one rollout (URG-322): a stable UUID built
// from both, so two tabs opening the Distribute step at once cannot make two
// tasks for the same row. Server only (node:crypto).

import { createHash } from 'node:crypto';
import type { HandoffItemKey } from './handoff';

export function handoffTaskId(releaseId: string, item: HandoffItemKey): string {
  const hex = createHash('sha1').update(`urganize:handoff:${releaseId}:${item}`).digest('hex');
  // Shaped as a version-5 UUID (name-based, SHA-1).
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}
