"use client";

import { FaArrowRight, FaWhatsapp } from "react-icons/fa6";
import { WHATSAPP_COMMUNITY_URL } from "@/lib/community";
import { SOCIAL_LINKS } from "@/lib/socials";
import { HeaderDropdown } from "./HeaderDropdown";

// The header's Community drop menu (2026-10-29, founder call): the WhatsApp
// group first, then the socials. It replaced the footer's Community link,
// which nobody used.
export const sectionHeadingClass =
  "px-5 pb-1 pt-3 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[var(--marketing-text-subtle)]";
const linkClass =
  "flex items-center gap-3 px-5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:bg-[var(--marketing-surface)] hover:text-[var(--marketing-text)]";

function OutArrow() {
  return <FaArrowRight aria-hidden className="h-2.5 w-2.5 -rotate-45" />;
}

export function CommunityLinks({ close }: { close: () => void }) {
  return (
    <div className="sm:min-w-[15rem]">
      <p className={sectionHeadingClass}>Community</p>
      <a
        role="menuitem"
        href={WHATSAPP_COMMUNITY_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={close}
        className={`${linkClass} py-3`}
      >
        <FaWhatsapp aria-hidden className="h-4 w-4 shrink-0" />
        <span>
          <span className="flex items-center gap-1.5">
            WhatsApp community
            <OutArrow />
          </span>
          <span className="block text-xs font-normal text-[var(--marketing-text-subtle)]">
            Talk with other artist managers
          </span>
        </span>
      </a>

      <p className={sectionHeadingClass}>Social</p>
      {SOCIAL_LINKS.map(({ href, name, label, Icon }) => (
        <a
          key={href}
          role="menuitem"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          onClick={close}
          className={`${linkClass} min-h-11 py-2`}
        >
          <Icon aria-hidden className="h-4 w-4 shrink-0" />
          {name}
          <OutArrow />
        </a>
      ))}
    </div>
  );
}

export function CommunityMenu() {
  return (
    <HeaderDropdown label="Community">
      {(close) => <CommunityLinks close={close} />}
    </HeaderDropdown>
  );
}
