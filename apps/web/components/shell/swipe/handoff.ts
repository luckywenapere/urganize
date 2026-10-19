'use client';

import { springAtRest, springStep } from '@/lib/swipe-nav';
import { prefersReducedMotion } from '@/lib/home-chat-glide';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';
import { showMain } from './main-thread';

type CardHandoff = {
  cardId: string;
  title: string;
  body: string;
  actionLabel: string | null;
  onAction: (() => void) | null;
  onDismiss: (() => void) | null;
};

/**
 * Home card → UrgAns (URG-380, frame 8 of the approved mocks). The card body was
 * tapped: it lifts, the pages glide to UrgAns on the one spring, and a copy of
 * the card flies to the newest-turn slot above the composer, where the real
 * turn ("From Home · …", its action, Not now) crossfades in with a green ring.
 *
 *  Tap 0ms: scale 0.98. Lift 0–90ms: 1.02 and a shadow, the rest of Home dims.
 *  Glide 90–~350ms: the pager and the card copy on stiffness 380 / damping 34.
 *  Settle: the copy fades out over 120ms as the turn fades in (CSS, globals.css
 *  .swipe-turn-in), the ring fades over 600ms. The composer gets a soft ring;
 *  the keyboard does not open on its own.
 *  Reduced motion: no lift, no flight; the pager crossfades and the turn shows
 *  with the ring.
 *
 * Main always: the turn is added there, never in a session. A second tap on the
 * same card does not add it twice.
 */
export function carryCardToUrgAns(card: HTMLElement | null, handoff: CardHandoff): void {
  const store = useSwipeNavStore.getState();
  const go = store.go;
  void showMain();
  try {
    navigator.vibrate?.(8);
  } catch {
    // Haptics are a nicety.
  }
  if (store.handoff?.cardId === handoff.cardId) {
    go?.('urgans');
    return;
  }
  store.setHandoff({ ...handoff, at: Date.now() });

  if (!card || !go || prefersReducedMotion()) {
    go?.('urgans');
    return;
  }

  const from = card.getBoundingClientRect();
  const homePane = document.querySelector<HTMLElement>('[data-swipe-pane="home"]');
  card.animate(
    [
      { transform: 'scale(0.98)' },
      { transform: 'scale(1.02)', boxShadow: '0 0 24px rgba(0,0,0,0.45)' },
    ],
    { duration: 90, easing: 'ease-out', fill: 'none' }
  );
  homePane?.animate([{ opacity: 1 }, { opacity: 0.4 }], { duration: 90, fill: 'forwards' });

  window.setTimeout(() => {
    // The copy that flies: the card itself, lifted onto an overlay.
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('id');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: '0',
      zIndex: '150',
      pointerEvents: 'none',
      transform: 'scale(1.02)',
      boxShadow: '0 0 24px rgba(0,0,0,0.45)',
      borderRadius: '22px',
      overflow: 'hidden',
    });
    document.body.appendChild(ghost);

    go('urgans');

    // Where the newest turn sits once UrgAns is on screen: the column's inner
    // edges, just above the composer.
    const urgansPane = document.querySelector<HTMLElement>('[data-swipe-pane="urgans"]');
    const column = urgansPane?.querySelector<HTMLElement>('.swipe-urgans');
    const composer = urgansPane?.querySelector<HTMLElement>('[data-chappi-composer]');
    const paneRect = urgansPane?.getBoundingClientRect();
    const columnRect = column?.getBoundingClientRect();
    const composerTop = composer?.getBoundingClientRect().top ?? window.innerHeight - 100;
    const toWidth = columnRect ? columnRect.width - 40 : from.width;
    const toLeft = columnRect && paneRect ? columnRect.left - paneRect.left + 20 : from.left;
    const toHeight = Math.min(from.height, 200);
    const toTop = composerTop - 16 - toHeight;

    let state = { position: 0, velocity: 0 };
    let last = performance.now();
    const tick = (now: number) => {
      let elapsed = Math.min(0.064, (now - last) / 1000);
      last = now;
      while (elapsed > 0) {
        const dt = Math.min(1 / 120, elapsed);
        state = springStep(state, 1, dt);
        elapsed -= dt;
      }
      const p = state.position;
      ghost.style.left = `${from.left + (toLeft - from.left) * p}px`;
      ghost.style.top = `${from.top + (toTop - from.top) * p}px`;
      ghost.style.width = `${from.width + (toWidth - from.width) * p}px`;
      ghost.style.height = `${from.height + (toHeight - from.height) * p}px`;
      ghost.style.transform = `scale(${1.02 - 0.02 * Math.min(1, p)})`;
      if (!springAtRest(state, 1)) {
        requestAnimationFrame(tick);
        return;
      }
      const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      fade.onfinish = () => ghost.remove();
      window.setTimeout(() => ghost.remove(), 400);
    };
    requestAnimationFrame(tick);

    // Home is off screen by now; put it back for the way back.
    window.setTimeout(() => {
      homePane?.getAnimations().forEach((animation) => animation.cancel());
    }, 450);
  }, 90);
}
