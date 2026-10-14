// The send arrow: the one filled, brand-coloured button on Home (the phone's
// docked "Message UrgAns" box, and the conversation beside Home on a computer),
// so it is Home's main call to action. One look everywhere it appears.
//
// URG-294 (2026-10-15), from a live onboarding demo where it read as broken:
// - Empty box: it used to be the brand fill at 40% opacity, a muddy green disc
//   with a dark arrow that looked faded rather than "not yet". Now a plain
//   neutral disc with a quiet arrow, and the brand fill only once there is
//   something to send.
// - The arrow is drawn a touch heavier than the long-tail lucide weight
//   (globals.css pulls .lucide to 1.7), which looked thin and spindly inside a
//   filled 40px circle. An arbitrary class, because the CSS rule beats the prop.
// - 44px to tap on a phone (Apple's minimum); 36px on a computer, where the
//   row's other controls are 36px and a mouse needs less.

/** The disabled look is neutral, never a faded brand fill. */
const SEND_BASE =
  'motion-press grid shrink-0 place-items-center rounded-full bg-brand text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-bg-elevated disabled:text-content-tertiary disabled:hover:bg-bg-elevated';

/** The phone's docked box on Home: always 44px. */
export const SEND_BUTTON_DOCK_CLASS = `${SEND_BASE} h-11 w-11`;

/** A composer used on both phones and computers: 44px on a phone, 36px from lg. */
export const SEND_BUTTON_CLASS = `${SEND_BASE} h-11 w-11 lg:h-9 lg:w-9`;

/** The arrow inside: centred, and heavy enough to read on the fill. */
export const SEND_ARROW_CLASS = 'h-5 w-5 [stroke-width:2.25]';
