import { SALES_CONTACT_EMAIL } from "@urganize/pricing";

// The one mailto every "talk to us" control on the marketing site opens
// (2026-09-02). It used to be a private helper inside PricingTierCards; the
// homepage's roster beat needed the same link with the same subject line,
// and two copies of a subject line is how one of them drifts.
export function salesMailto(tierLabel: string): string {
  const subject = `Urganize ${tierLabel} plan`;
  return `mailto:${SALES_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
