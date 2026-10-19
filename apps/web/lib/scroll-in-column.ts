/**
 * Scroll an element into view vertically only (URG-380 hotfix, v1.160.6).
 *
 * `Element.scrollIntoView` scrolls EVERY scrollable ancestor on both axes,
 * including `overflow: hidden` ones. Inside the swipe pager that meant a chat
 * pane mounted off screen (UrgAns, while Home was showing) scrolled the pager
 * viewport sideways to reveal its newest message, leaving the screen stuck
 * halfway between Home and UrgAns. This helper moves only the nearest
 * vertical scroller (or the page), never anything horizontally.
 */
export type ColumnBlock = 'start' | 'center' | 'end';

function isVerticalScroller(el: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(el).overflowY;
  return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
}

export function columnScrollTop(input: {
  elementTop: number;
  elementHeight: number;
  scrollerTop: number;
  scrollerHeight: number;
  currentScrollTop: number;
  block: ColumnBlock;
}): number {
  const offset = input.elementTop - input.scrollerTop + input.currentScrollTop;
  if (input.block === 'start') return Math.max(0, offset);
  if (input.block === 'center') return Math.max(0, offset - (input.scrollerHeight - input.elementHeight) / 2);
  return Math.max(0, offset - input.scrollerHeight + input.elementHeight);
}

export function scrollIntoColumn(
  el: HTMLElement | null | undefined,
  options: { block?: ColumnBlock; behavior?: ScrollBehavior } = {}
): void {
  if (!el || typeof window === 'undefined') return;
  const block = options.block ?? 'end';
  const behavior = options.behavior ?? 'auto';
  let scroller: HTMLElement | null = el.parentElement;
  while (scroller && !isVerticalScroller(scroller)) scroller = scroller.parentElement;
  const rect = el.getBoundingClientRect();
  if (scroller) {
    const box = scroller.getBoundingClientRect();
    const top = columnScrollTop({
      elementTop: rect.top,
      elementHeight: rect.height,
      scrollerTop: box.top,
      scrollerHeight: scroller.clientHeight,
      currentScrollTop: scroller.scrollTop,
      block,
    });
    scroller.scrollTo({ top, behavior });
    return;
  }
  const top = columnScrollTop({
    elementTop: rect.top,
    elementHeight: rect.height,
    scrollerTop: 0,
    scrollerHeight: window.innerHeight,
    currentScrollTop: window.scrollY,
    block,
  });
  window.scrollTo({ top, behavior });
}
