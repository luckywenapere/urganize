// Hold to talk in the UrgAns box on a phone (2026-11-02, founder approved
// docs/mocks/hold-to-talk). Pure pieces, so vitest holds them.

/** How long a press must last before it counts as a hold, not a tap. */
export const HOLD_DELAY_MS = 300;

/** How far left (px) a held finger slides before letting go cancels. */
export const CANCEL_SLIDE_PX = 70;

/** The box's empty text on a phone where the mic can be held: "Type or hold
 *  to talk" for a chat with no messages yet, "Reply or hold to talk" once it
 *  has some (founder, 2026-11-03). Null keeps the box's own text. */
export function holdToTalkPlaceholder(input: {
  phone: boolean;
  micReady: boolean;
  hasMessages: boolean;
}): string | null {
  if (!input.phone || !input.micReady) return null;
  return input.hasMessages ? 'Reply or hold to talk' : 'Type or hold to talk';
}

/** True once a held finger has slid far enough left to cancel. */
export function slidToCancel(startX: number, currentX: number): boolean {
  return startX - currentX >= CANCEL_SLIDE_PX;
}

/** "0:07" for the recording readout. */
export function formatHoldElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
