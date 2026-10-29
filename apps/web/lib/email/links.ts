import { APP_ORIGIN } from '../app-hosts';
// Constant links used inside email bodies. React-free leaf module, so templates
// and tasks-server can import it with no cycle and no react-email pulled along.
//
// Templates NEVER resolve a base URL themselves — any environment-aware link
// (an invite accept URL) is built at the call site with resolveAppBaseUrl and
// passed in as a prop. These two are the hardcoded-to-production links the
// welcome and assignment notes have always used (matching the old
// lib/email-templates.ts APP_URL), which is correct: those emails only ever go
// out from production.
export const APP_URL = APP_ORIGIN;

/** The founder's WhatsApp deep link — the app's real support channel. The
 *  welcome note points here rather than a support@ address because this is where
 *  the founder actually answers. */
export const FOUNDER_WHATSAPP_URL = 'https://wa.me/2347067367057';

/** Urganize's social accounts, in the order and with the addresses the marketing
 *  site's footer uses (apps/homepage/app/components/marketing/MarketingFooter.tsx).
 *  apps/homepage cannot import from apps/web, so this is a second copy, held in
 *  step by social-links.test.ts, which reads that footer and fails if the two
 *  differ. The label is the visible word: plain text, because mail clients block
 *  images by default and none of them render SVG. */
export const SOCIAL_LINKS = [
  { label: 'X', href: 'https://x.com/urganize' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/urganize' },
  { label: 'Instagram', href: 'https://www.instagram.com/urganize' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@urganize' },
  { label: 'YouTube', href: 'https://www.youtube.com/@urganize' },
  { label: 'Threads', href: 'https://www.threads.net/@urganize' },
] as const;
