import type { Metadata } from "next";

const SITE_URL = "https://urganize.app";
const SITE_NAME = "Urganize";

// Shared per-page metadata shape (canonical + OG + Twitter) so every
// marketing page gets the same fields instead of hand-rolling them.
// Root layout still owns metadataBase, keywords, and robots defaults.
export function buildPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = `${SITE_URL}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
