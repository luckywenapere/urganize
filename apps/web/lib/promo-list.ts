import { DEFAULT_PROMO_COUNTRY, suggestPromoChannels, type PromoChannel } from '@/lib/promo-channels';

// Promo inside Pitch this! (2026-10-16): a plain list. The five best fits
// first (genre, then Nigeria, then free), topped up from the rest in listed
// order so there are always five when five exist; "All N channels" shows the
// whole list.

export const PROMO_LIST_FIRST = 5;

export function promoListHead(
  channels: PromoChannel[],
  genre: string | null,
  count = PROMO_LIST_FIRST
): PromoChannel[] {
  const fits = suggestPromoChannels(channels, { genre, country: DEFAULT_PROMO_COUNTRY }, count);
  const seen = new Set(fits.map((channel) => channel.id));
  const head = [...fits];
  for (const channel of channels) {
    if (head.length >= count) break;
    if (!seen.has(channel.id)) {
      head.push(channel);
      seen.add(channel.id);
    }
  }
  return head;
}

/** The rest, in listed order, after the head. */
export function promoListRest(channels: PromoChannel[], head: PromoChannel[]): PromoChannel[] {
  const ids = new Set(head.map((channel) => channel.id));
  return channels.filter((channel) => !ids.has(channel.id));
}
