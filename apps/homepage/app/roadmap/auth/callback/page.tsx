"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

// Mirrors apps/web/app/auth/callback/page.tsx's PKCE + hash-token handling,
// simplified: no profiles upsert (the roadmap doesn't use profiles) and no
// role/onboarding logic — just resolve the session and return to /roadmap.
export default function RoadmapAuthCallbackPage() {
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const handleCallback = async () => {
      const timeout = window.setTimeout(() => {
        router.replace("/roadmap?auth_error=callback_timeout");
      }, 7000);

      try {
        const url = new URL(window.location.href);

        // PKCE/code flow.
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error("Roadmap auth callback exchangeCodeForSession error:", error);
        }

        // Implicit hash-token flow.
        const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) console.error("Roadmap auth callback setSession error:", error);
        }

        let session = (await supabase.auth.getSession()).data.session;
        if (!session && accessToken) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          session = (await supabase.auth.getSession()).data.session;
        }

        window.clearTimeout(timeout);
        router.replace(session ? "/roadmap" : "/roadmap?auth_error=callback_no_session");
      } catch (error) {
        console.error("Roadmap auth callback fatal error:", error);
        window.clearTimeout(timeout);
        router.replace("/roadmap?auth_error=callback_failed");
      }
    };

    handleCallback();
  }, [router]);

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[var(--marketing-bg)] px-4 text-[var(--marketing-text)]"
      role="status"
      aria-live="polite"
    >
      <p className="mono-label text-[var(--marketing-text-subtle)]">Finishing sign-in…</p>
    </main>
  );
}
