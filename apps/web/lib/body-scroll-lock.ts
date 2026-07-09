// Shared body scroll lock for stacked modals.
//
// Each modal previously saved/restored document.body.style.overflow and
// paddingRight independently, which breaks the moment two modals overlap
// (the 'c' quick-create shortcut can open over CreateReleaseModal): the
// second modal captures the first's lock as its "original", so closing in
// either order left the page scroll-locked or with a stuck scrollbar-width
// padding. A single ref-counted lock makes any number of concurrent modals
// compose: styles are captured once when the first lock is taken and
// restored once when the last is released.

let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

/** Take the lock. Returns a release function that is safe to call once
 * (subsequent calls are no-ops), so it can be returned directly from a
 * useEffect. */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    // Pad by the scrollbar width so desktop layouts don't jump when the
    // scrollbar disappears.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    lockCount -= 1;
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow;
      document.body.style.paddingRight = savedPaddingRight;
    }
  };
}
