'use client';

import { useEffect, type ReactNode } from 'react';
import { isTypingTarget } from '@/lib/tasks';

/**
 * Generic overlay chrome for the release scenes (Metadata / Files / Press kit /
 * Calendar), added 2026-08-04 when those four stopped being full pages and
 * became in-place windows over the workspace. Cloned from `TaskDetailModal`
 * (components/tasks/TaskUIProvider.tsx) so the two overlay families feel
 * identical: blurred scrim, click-outside to close, panel owns its own scroll,
 * body scroll locked while open, bottom-docked sheet on phones that floats
 * centered from sm up, same 200ms land-not-snap entrance.
 *
 * This component is chrome ONLY — it knows nothing about any scene's content,
 * data, or theming. See ReleaseSceneOverlay for the host that fills it.
 *
 * Z-TIER: z-[165]. Above the UrgAns rail/dock (z-[130]) so it covers them the
 * way the activity pop-up does; BELOW the activity pop-up (z-[170]) so if a
 * task is ever opened over a scene the task wins; well below ToastProvider
 * (z-[200]) so toasts stay readable over an open window; far below the content
 * calendar's own PostModal (z-[220]), which portals to document.body and so
 * paints above this panel with no extra work.
 */

type SceneOverlaySize = 'sm' | 'lg';

type SceneOverlayShellProps = {
  /**
   * 'sm' matches the activity pop-up almost byte-for-byte (sm:max-w-2xl) and
   * carries Metadata / Files / Press kit. 'lg' is a wider window for the
   * content calendar, whose MonthGrid is designed around ~1200px.
   *
   * ⚠️ The 'lg' variant deliberately uses a MINIMAL outer gutter and adds NO
   * inner horizontal padding. MonthGrid/AgendaList swap on Tailwind's `lg:`
   * breakpoint, which is VIEWPORT-gated (1024px), not container-gated — so any
   * chrome that steals horizontal width squeezes the 7-column grid at
   * 1024–1300px viewports and the show/hide toggle cannot compensate. Giving
   * this variant a roomier "floating card" margin for visual parity with 'sm'
   * would directly reintroduce that squeeze.
   */
  size: SceneOverlaySize;
  ariaLabel: string;
  onClose: () => void;
  /**
   * FULL REPLACEMENT (not an append) of the panel's surface/border classes.
   * Passing this drops `border-t border-stroke-strong bg-bg-surface sm:border`
   * entirely — that is the point: the calendar renders inside its own
   * Brand Bible `.cc-island` colour scope and must not inherit the neutral app
   * surface tokens, or a visible colour seam appears between chrome and
   * content. Leave unset for anything using normal app surfaces.
   */
  panelClassName?: string;
  /** Default true. Pass false for content that is deliberately sharp-cornered
   * (the calendar's Brand Bible styling uses no rounded corners anywhere, so a
   * rounded frame around it reads as a mismatch). */
  rounded?: boolean;
  /**
   * Default true: the shell installs the Escape-to-close listener.
   *
   * Pass FALSE when the content mounts its own nested modal that has its own
   * unguarded window-level Escape listener — today that means the calendar,
   * whose PostModal listens on `window` without stopping propagation. Two
   * listeners on the same target both fire for one keydown regardless of
   * propagation calls, so a shell-owned handler would close the window
   * *underneath* the post modal on the same keypress. Content that opts out
   * owns Escape itself and guards on its nested modal's state.
   */
  ownsEscape?: boolean;
  children: ReactNode;
};

const DEFAULT_PANEL_SURFACE = 'border-t border-stroke-strong bg-bg-surface sm:border';

export function SceneOverlayShell({
  size,
  ariaLabel,
  onClose,
  panelClassName,
  rounded = true,
  ownsEscape = true,
  children,
}: SceneOverlayShellProps) {
  // The shell is only ever mounted when a scene is open (the host returns null
  // otherwise), so the lock needs no isOpen flag of its own.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!ownsEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Guard matters concretely: the Metadata form has eight text inputs, and
      // Escape while typing in one must not throw the window away.
      if (isTypingTarget(event.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, ownsEscape]);

  const scrimPadding = size === 'lg' ? 'sm:p-3' : 'sm:p-6';
  const panelSize =
    size === 'lg'
      ? 'max-h-[94dvh] sm:max-h-[94dvh] sm:max-w-[1280px]'
      : 'max-h-[92dvh] sm:max-h-[85dvh] sm:max-w-2xl';
  const roundedClasses = rounded ? 'rounded-t-2xl sm:rounded-2xl' : '';
  // 'lg' adds no inner padding — the calendar brings its own
  // `mx-auto max-w-[1200px] px-4 sm:px-6` wrapper and does all the width math
  // itself, exactly as it did as a full page.
  const contentPadding = size === 'lg' ? '' : 'p-5 sm:p-6';

  return (
    <div
      className={`fixed inset-0 z-[165] flex items-end justify-center bg-black/55 backdrop-blur-[2px] animate-in fade-in duration-200 sm:items-center ${scrimPadding}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`flex w-full flex-col overflow-hidden shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 ${roundedClasses} ${panelSize} ${panelClassName ?? DEFAULT_PANEL_SURFACE}`}
      >
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${contentPadding}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
