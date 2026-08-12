"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type formbricksType from "@formbricks/js";

// Survey widget. Mounted in the root layout, so it is on EVERY page — which is
// exactly why it must not be a static import: `import formbricks from
// "@formbricks/js"` put the whole SDK in the render-blocking client bundle of
// a marketing site whose entire job is to load fast on a slow phone. Nothing
// here is needed for first paint, or for the first few seconds of reading.
//
// Same idle-deferred dynamic-import pattern instrumentation-client.ts already
// uses for posthog-js: fetch the SDK once the browser has nothing better to
// do, with a timer fallback where requestIdleCallback doesn't exist (Safari).
type Formbricks = typeof formbricksType;

let formbricksPromise: Promise<Formbricks> | null = null;

function loadFormbricks(): Promise<Formbricks> {
  if (!formbricksPromise) {
    formbricksPromise = import("@formbricks/js").then((mod) => {
      const instance = mod.default;
      instance.setup({
        environmentId: "cmja8xlr9xzf0ad01xu8mpoas",
        appUrl: "https://app.formbricks.com",
      });
      return instance;
    });
  }
  return formbricksPromise;
}

export default function FormbricksProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Route changes that happen before the SDK has loaded are simply dropped:
  // the setup call itself registers the page the visitor is actually on, so
  // replaying earlier hops would only mis-report where they are.
  const isLoadedRef = useRef(false);

  useEffect(() => {
    const start = () => {
      void loadFormbricks().then(() => {
        isLoadedRef.current = true;
      });
    };

    // Feature-tested via typeof rather than `in`: the `in` narrowing makes
    // TypeScript treat the else branch as unreachable (`never`) since the DOM
    // lib declares requestIdleCallback unconditionally, even though Safari
    // doesn't ship it.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(start, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(start, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    void loadFormbricks().then((instance) => instance.registerRouteChange());
  }, [pathname, searchParams]);

  return null;
}
