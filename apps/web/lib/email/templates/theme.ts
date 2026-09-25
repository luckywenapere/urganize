// Shared colours and fonts for every email body. Plain literals, not theme
// tokens, and a system font stack, for the reasons lib/email-templates.ts spelled
// out and this module inherits:
//
//  - INLINE STYLES / LITERAL COLOURS ONLY. Outlook and several webmail clients
//    strip <style> blocks and none of them resolve var(). react-email inlines
//    everything, which is exactly what mail clients need — but the values still
//    have to be literals here, never CSS custom properties.
//  - NO WEB FONTS. @font-face is unreliable-to-blocked in mail clients. Do not
//    add react-email's <Font>. Space Grotesk / Fraunces are deliberately absent.
//  - A LIGHT GROUND. Gmail and Outlook apply their own dark-mode inversion to
//    mail, which mangles a dark-designed message far worse than a light one. The
//    brand shows up as the ink/spring accent pair, which survives inversion.

export const INK = '#0d120e';
export const SPRING = '#7fd99a';
export const BODY_TEXT = '#33403a';
export const MUTED_TEXT = '#6b7a72';
export const HAIRLINE = '#e4e9e5';
export const PAGE_BG = '#f6f8f6';
export const CARD_BG = '#ffffff';

export const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
