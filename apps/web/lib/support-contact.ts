// The product's one support channel: a WhatsApp deep link to the founder.
//
// Canonical home for the number. Four earlier call sites hardcode the same
// literal (SupportChat, ChappiDock, ChappiSidePanel, ChappiPageClient) — they
// predate this module and are deliberately left alone rather than swept into an
// error-handling change. Point them here when one of them is next touched; do
// not add a fifth copy.
export const SUPPORT_WHATSAPP_URL = 'https://wa.me/2347067367057';
