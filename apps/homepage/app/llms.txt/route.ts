import { FAQ_ITEMS } from "@/content/faq";
import { GUIDES } from "@/content/guides";
import { AUDIENCE_LINE, CANONICAL_DESCRIPTION, SHORT_LINE } from "@/lib/positioning";
import { SITE_URL } from "@/lib/seo";

// /llms.txt (#1217, from the Coframe review of 11 Nov 2026): a short plain-text
// guide to the site for AI tools, in the llmstxt.org shape (an H1, a one-line
// summary in a quote, then sections of links). Built from the same constants
// the pages render, positioning, FAQ and guides, so it cannot describe the
// product differently from the site. Static: generated once at build time.
export const dynamic = "force-static";

const PAGES: ReadonlyArray<readonly [string, string, string]> = [
  ["Features", "/features", "What Urganize does, screen by screen."],
  ["Pricing", "/pricing", "The plans, what each includes, and the limits on artists, team size and rollouts."],
  ["For managers", "/for-managers", "How a manager runs several artists and a team in Urganize."],
  ["For record labels", "/for-executives", "How a label runs its roster in Urganize."],
  ["Why Urganize", "/why-urganize", "Why teams move off group chats and spreadsheets."],
  ["For playlist curators", "/for-curators", "A free inbox for the songs artists pitch to curators."],
  ["Guides", "/guides", "Plain guides to planning and putting out new music."],
  ["About Urganize", "/brand", "What Urganize is, how to spell it and the logos to use."],
  ["Updates", "/changelog", "Every change to the product, newest first."],
];

function buildLlmsTxt(): string {
  const lines: string[] = [
    "# Urganize",
    "",
    `> ${SHORT_LINE} For ${AUDIENCE_LINE}.`,
    "",
    CANONICAL_DESCRIPTION,
    "",
    "## Pages",
    "",
    ...PAGES.map(([title, path, note]) => `- [${title}](${SITE_URL}${path}): ${note}`),
    "",
    "## Guides",
    "",
    ...GUIDES.map((guide) => `- [${guide.title}](${SITE_URL}/guides/${guide.slug}): ${guide.summary}`),
    "",
    "## Questions people ask",
    "",
  ];
  for (const item of FAQ_ITEMS) {
    lines.push(`### ${item.question}`, "", item.answer, "");
  }
  lines.push("## Optional", "", `- [Create an account](${SITE_URL}/signup): sign up and pick a plan.`, "");
  return lines.join("\n");
}

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
