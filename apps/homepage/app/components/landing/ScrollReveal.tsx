"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

// Sections fade in as they scroll into view. The content is shown by default
// and only hidden once this component has run in the browser AND the section
// is still below the fold (the data-reveal="armed" hook in globals.css). That
// order matters: when the script is blocked, slow to hydrate or throws, the
// visitor still reads the page. Hiding by default left everything below the
// first screen blank, the pricing and the waitlist form included.
export function ScrollReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;

    if (!node || isVisible) {
      return;
    }

    // Already on screen, or already scrolled past (a reload that restored the
    // scroll position, a jump link): leave it showing. Only sections wholly
    // below the fold wait for their moment.
    if (node.getBoundingClientRect().top < window.innerHeight) {
      return;
    }

    node.dataset.reveal = "armed";

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -8% 0px",
      },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div
      ref={ref}
      className={clsx("scroll-reveal", isVisible && "is-visible", className)}
    >
      {children}
    </div>
  );
}
