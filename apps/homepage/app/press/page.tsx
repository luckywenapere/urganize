import { permanentRedirect } from "next/navigation";

// The press kit was folded into the consolidated /brand page (foundations,
// voice, visual identity, and the logo/asset downloads). Preserve inbound
// links — existing press coverage, bookmarks — with a permanent 308 redirect.
// The static asset /press/urganize-logo.zip still resolves directly (it's a
// file in public/press, not a route).
export default function PressPage() {
  permanentRedirect("/brand");
}
