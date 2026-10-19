"use client";

import { useEffect, useState } from "react";

// The /changelog area filter (2026-10-19). The list is rendered once on the
// server; this only sets data-filter on it and the page's own <style> block
// hides what does not match (entries, the per-month "smaller improvements"
// groups and whole months), so filtering costs no request and no re-render of
// the list. Chips render on the server too, so nothing shifts when JS lands.
export function ChangelogFilter({
  tags,
  targetId,
}: {
  tags: readonly string[];
  targetId: string;
}) {
  const [active, setActive] = useState<string>("All");

  useEffect(() => {
    const list = document.getElementById(targetId);
    if (!list) return;
    if (active === "All") list.removeAttribute("data-filter");
    else list.setAttribute("data-filter", active);
  }, [active, targetId]);

  return (
    <div
      role="group"
      aria-label="Filter updates by area"
      className="changelog-chips -mx-6 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {["All", ...tags].map((tag) => {
        const on = tag === active;
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => setActive(tag)}
            className={
              "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm transition-colors " +
              (on
                ? "border-transparent bg-[var(--marketing-text)] text-[var(--marketing-bg)]"
                : "border-[color:var(--marketing-border-strong)] text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]")
            }
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
