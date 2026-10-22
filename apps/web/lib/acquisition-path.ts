// Where a checkout was started from ('wall', 'onboarding_paywall',
// 'prepay_upsell', 'settings_billing', ...), carried from the browser to the
// payments row, the charge ledger and every checkout analytics event. It comes
// from the request body, so it is cleaned to a short slug and never trusted for
// anything but counting.

const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function cleanAcquisitionPath(value: unknown): string | null {
  const text = String(value ?? '').trim().toLowerCase();
  return SLUG.test(text) ? text : null;
}
