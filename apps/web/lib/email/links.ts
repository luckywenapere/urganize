// Constant links used inside email bodies. React-free leaf module, so templates
// and tasks-server can import it with no cycle and no react-email pulled along.
//
// Templates NEVER resolve a base URL themselves — any environment-aware link
// (an invite accept URL) is built at the call site with resolveAppBaseUrl and
// passed in as a prop. These two are the hardcoded-to-production links the
// welcome and assignment notes have always used (matching the old
// lib/email-templates.ts APP_URL), which is correct: those emails only ever go
// out from production.
export const APP_URL = 'https://app.urganize.app';

/** The founder's WhatsApp deep link — the app's real support channel. The
 *  welcome note points here rather than a support@ address because this is where
 *  the founder actually answers. */
export const FOUNDER_WHATSAPP_URL = 'https://wa.me/2347067367057';
