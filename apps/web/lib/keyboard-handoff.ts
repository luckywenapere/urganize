/**
 * iOS Safari only opens the keyboard for a focus() that happens inside the tap
 * that asked for it. Opening UrgAns is a page change, so by the time the chat
 * box exists the tap is over and its own focus() is refused. The workaround:
 * focus a throwaway field inside the tap, which brings the keyboard up, and let
 * the chat box take focus from it when it mounts (moving focus between fields
 * while the keyboard is open is allowed).
 *
 * Call from a click handler, never from an effect.
 */
export function primeKeyboard(): void {
  if (typeof document === 'undefined') return;
  try {
    const proxy = document.createElement('input');
    proxy.type = 'text';
    proxy.setAttribute('aria-hidden', 'true');
    proxy.tabIndex = -1;
    // 16px so iOS does not zoom; off-screen but not display:none (which can
    // not take focus).
    proxy.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none;';
    document.body.appendChild(proxy);
    proxy.focus({ preventScroll: true });
    // Keep it until the chat box (or any other field) has taken over, so a
    // slow page load cannot drop the keyboard before the box exists. Gives up
    // after 10s either way.
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const active = document.activeElement;
      const handedOver =
        active !== proxy &&
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (handedOver || Date.now() - startedAt > 10000) {
        window.clearInterval(timer);
        proxy.remove();
      }
    }, 100);
  } catch {
    // A convenience only; the chat box still tries on its own.
  }
}
