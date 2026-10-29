"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa6";

// The click-to-toggle drop menu behind the header's Product and Community
// entries. Click (not hover) so it works on touch screens; it closes on an
// outside tap, Escape, or when a child calls `close`.
//
// The panel is ALWAYS rendered and only hidden when closed, never mounted on
// open: crawlers don't click, and the Product menu is the only home of its
// pages (see ProductMenu.tsx). `hidden` keeps closed links out of the
// accessibility tree and the tab order.
//
// Below sm the panel is fixed and full width under the header, because two
// triggers sit in the middle of a 375px row and a right-anchored panel would
// run off the left edge. (`fixed` here resolves against the header, which
// has a backdrop filter, so top-[76px] is measured from the header's top.)
export function HeaderDropdown({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="sm:relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="-mx-2 flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
      >
        {label}
        <FaChevronDown
          aria-hidden
          className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        role="menu"
        hidden={!open}
        className="fixed inset-x-4 top-[76px] z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto border border-[color:var(--marketing-border)] bg-[var(--marketing-bg)] py-2 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:min-w-[11rem]"
      >
        {children(() => setOpen(false))}
      </div>
    </div>
  );
}
