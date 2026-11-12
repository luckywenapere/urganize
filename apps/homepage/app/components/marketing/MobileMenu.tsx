"use client";

import { CommunityLinks, sectionHeadingClass } from "./CommunityMenu";
import { HeaderDropdown } from "./HeaderDropdown";
import { ProductLinks } from "./ProductMenu";

// Below sm the header has no room for both Product and Community (measured
// 2026-10-29: the row needed ~433px against 327px at 375), so phones get one
// "Menu" drop menu holding both. From sm up the two are separate drop menus.
export function MobileMenu() {
  return (
    <HeaderDropdown label="Menu">
      {(close) => (
        <>
          <p className={sectionHeadingClass}>Product</p>
          <ProductLinks close={close} />
          <div className="mt-2 border-t border-[color:var(--marketing-border)] pt-1">
            <CommunityLinks close={close} />
          </div>
          {/* Log in steps aside in the header below sm to make room for the
              main button, so a returning user on a phone needs it here
              (#1220: before this there was no way to log in from a phone). */}
          <div className="mt-2 border-t border-[color:var(--marketing-border)] pt-1">
            <a
              role="menuitem"
              href="/login"
              onClick={close}
              className="block px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text)] hover:bg-[var(--marketing-surface)]"
            >
              Log in
            </a>
          </div>
        </>
      )}
    </HeaderDropdown>
  );
}
