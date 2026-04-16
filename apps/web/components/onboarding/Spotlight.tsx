'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type SpotlightCardPosition = {
  top: number;
  left: number;
};

type SpotlightProps = {
  isOpen: boolean;
  targetSelector?: string;
  targetElement?: HTMLElement | null;
  eyebrow?: string;
  title: string;
  body: string;
  skipLabel?: string;
  onSkip?: () => void;
  footer?: ReactNode;
  onTargetClick?: (event: MouseEvent) => void;
};

const CARD_WIDTH = 360;
const CARD_MIN_MARGIN = 16;
const SPOTLIGHT_PADDING = 12;

function resolveTargetElement(
  targetSelector?: string,
  targetElement?: HTMLElement | null
): HTMLElement | null {
  if (targetElement) {
    return targetElement;
  }

  if (!targetSelector || typeof document === 'undefined') {
    return null;
  }

  return document.querySelector<HTMLElement>(targetSelector);
}

function getViewportRect(element: HTMLElement): SpotlightRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getCardPosition(rect: SpotlightRect): SpotlightCardPosition {
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const cardWidth = Math.min(CARD_WIDTH, Math.max(280, viewportWidth - CARD_MIN_MARGIN * 2));
  const spaceBelow = viewportHeight - (rect.top + rect.height);
  const cardTop =
    spaceBelow >= 220
      ? Math.min(rect.top + rect.height + 18, viewportHeight - 220)
      : Math.max(CARD_MIN_MARGIN, rect.top - 220 - 18);
  const cardLeft = Math.min(
    Math.max(CARD_MIN_MARGIN, rect.left),
    Math.max(CARD_MIN_MARGIN, viewportWidth - cardWidth - CARD_MIN_MARGIN)
  );

  return {
    top: cardTop,
    left: cardLeft,
  };
}

function getPaneStyles(rect: SpotlightRect) {
  const paddedTop = Math.max(0, rect.top - SPOTLIGHT_PADDING);
  const paddedLeft = Math.max(0, rect.left - SPOTLIGHT_PADDING);
  const paddedWidth = rect.width + SPOTLIGHT_PADDING * 2;
  const paddedHeight = rect.height + SPOTLIGHT_PADDING * 2;
  const paddedRight = paddedLeft + paddedWidth;
  const paddedBottom = paddedTop + paddedHeight;
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;

  return {
    top: { top: 0, left: 0, width: viewportWidth, height: paddedTop },
    left: { top: paddedTop, left: 0, width: paddedLeft, height: paddedHeight },
    right: {
      top: paddedTop,
      left: paddedRight,
      width: Math.max(0, viewportWidth - paddedRight),
      height: paddedHeight,
    },
    bottom: {
      top: paddedBottom,
      left: 0,
      width: viewportWidth,
      height: Math.max(0, viewportHeight - paddedBottom),
    },
    highlight: {
      top: paddedTop,
      left: paddedLeft,
      width: paddedWidth,
      height: paddedHeight,
    },
  };
}

export function Spotlight({
  isOpen,
  targetSelector,
  targetElement,
  eyebrow,
  title,
  body,
  skipLabel,
  onSkip,
  footer,
  onTargetClick,
}: SpotlightProps) {
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const [cardPosition, setCardPosition] = useState<SpotlightCardPosition>({
    top: CARD_MIN_MARGIN,
    left: CARD_MIN_MARGIN,
  });
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setTargetRect(null);
      return;
    }

    const element = resolveTargetElement(targetSelector, targetElement);
    if (!element) {
      return;
    }

    let frameId = 0;
    const updateLayout = () => {
      const nextElement = resolveTargetElement(targetSelector, targetElement);
      if (!nextElement) {
        return;
      }

      const nextRect = getViewportRect(nextElement);
      setTargetRect(nextRect);
      setCardPosition(getCardPosition(nextRect));
    };

    const requestLayout = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(updateLayout);
    };

    requestLayout();

    const resizeObserver = new ResizeObserver(requestLayout);
    resizeObserver.observe(element);

    window.addEventListener('resize', requestLayout);
    window.addEventListener('scroll', requestLayout, true);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', requestLayout);
      window.removeEventListener('scroll', requestLayout, true);
    };
  }, [isOpen, targetElement, targetSelector]);

  useEffect(() => {
    if (!isOpen || !onTargetClick) {
      return;
    }

    const element = resolveTargetElement(targetSelector, targetElement);
    if (!element) {
      return;
    }

    element.addEventListener('click', onTargetClick, true);
    return () => element.removeEventListener('click', onTargetClick, true);
  }, [isOpen, onTargetClick, targetElement, targetSelector]);

  const paneStyles = useMemo(
    () => (targetRect ? getPaneStyles(targetRect) : null),
    [targetRect]
  );

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {paneStyles ? (
        <>
          {(['top', 'left', 'right', 'bottom'] as const).map((pane) => (
            <div
              key={pane}
              className="absolute bg-black/60 transition-all duration-300 ease-out"
              style={paneStyles[pane]}
            />
          ))}

          <div
            className="pointer-events-none absolute rounded-[16px] border border-brand shadow-[0_0_0_4px_rgba(62,207,142,0.22)] transition-all duration-300 ease-out"
            style={{
              ...paneStyles.highlight,
              transform: 'scale(1)',
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60 transition-opacity duration-200 ease-out" />
      )}

      <div
        className="absolute w-[min(360px,calc(100vw-2rem))] rounded-[28px] border border-stroke-default bg-bg-surface/98 p-5 shadow-[0_30px_90px_-36px_rgba(0,0,0,0.8)] transition-all duration-300 ease-out"
        style={{
          top: cardPosition.top,
          left: cardPosition.left,
        }}
      >
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            {eyebrow}
          </p>
        ) : null}
        <h3 className="mt-3 text-2xl tracking-tight text-content-primary">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-content-secondary">{body}</p>

        {footer ? <div className="mt-5">{footer}</div> : null}

        {skipLabel && onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="mt-5 text-sm font-medium text-content-secondary transition hover:text-content-primary"
          >
            {skipLabel}
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
