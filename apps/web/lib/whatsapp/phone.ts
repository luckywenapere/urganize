// Phone numbers for WhatsApp. Pure.
//
// Everything is stored as E.164 with a leading "+" so one person is one string.
// A number typed the Nigerian way (0803 123 4567) is read as +234 because the
// team is Nigeria first; any other country has to be typed with its + code.

const DEFAULT_COUNTRY_CODE = '234';

/** Returns "+<digits>" or null when the input cannot be a mobile number. */
export function normalizePhone(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (!digits) return null;

  if (!hasPlus) {
    if (digits.startsWith('0')) digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
    else if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
  }

  // E.164 allows 8 to 15 digits after the +.
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Twilio sends "whatsapp:+2348031234567". */
export function stripWhatsappPrefix(value: string): string {
  return (value || '').replace(/^whatsapp:/i, '').trim();
}

export function toWhatsappAddress(phone: string): string {
  return `whatsapp:${phone}`;
}

/** "+2348031234567" -> "+234 803 ••• 4567" for the settings list. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return phone;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ••• ${digits.slice(-4)}`;
}
