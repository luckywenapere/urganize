import { permanentRedirect } from "next/navigation";

// The press kit was folded into the consolidated /brand page (foundations,
// voice, visual identity, and the logo/asset downloads). Preserve inbound
// links — existing press coverage, bookmarks — with a permanent 308 redirect.
// The orphaned /press/urganize-logo.zip static asset was deleted (URG-150) —
// it duplicated /brand/urganize-logos.zip, the current logo pack, byte for
// byte. Any direct link to it now 404s; the /brand redirect above is unaffected.
export default function PressPage() {
  permanentRedirect("/brand");
}
