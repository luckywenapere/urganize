import { prisma } from "@/lib/prisma";

// URG-178: read-time config for marketing-site toggles that need to flip
// without a redeploy. Currently one key: pricing_page_mode.
export type PricingPageMode = "free" | "paid";

const PRICING_PAGE_MODE_KEY = "pricing_page_mode";
const DEFAULT_PRICING_PAGE_MODE: PricingPageMode = "paid";

function isPricingPageMode(value: string | null | undefined): value is PricingPageMode {
  return value === "free" || value === "paid";
}

// Env var takes precedence when set (quick override without touching the
// DB row — e.g. for local dev), otherwise reads the Neon-backed AppConfig
// row, otherwise falls back to 'paid' (today's real pricing table) so a
// missing row or a DB blip never silently hides pricing.
export async function getPricingPageMode(): Promise<PricingPageMode> {
  const envOverride = process.env.PRICING_PAGE_MODE?.trim();
  if (isPricingPageMode(envOverride)) {
    return envOverride;
  }

  try {
    const row = await prisma.appConfig.findUnique({
      where: { key: PRICING_PAGE_MODE_KEY },
    });
    if (isPricingPageMode(row?.value)) {
      return row.value;
    }
  } catch {
    // Fail closed to the real pricing table, not open to a mode nobody set.
  }

  return DEFAULT_PRICING_PAGE_MODE;
}

export async function setPricingPageMode(mode: PricingPageMode): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: PRICING_PAGE_MODE_KEY },
    create: { key: PRICING_PAGE_MODE_KEY, value: mode },
    update: { value: mode },
  });
}
