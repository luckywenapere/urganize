import { DISTRIBUTION_ALLOWANCE, getTier, type PricingTierId } from '@urganize/pricing';

/**
 * What the small picture on a plan card shows (#978), read from the plan
 * itself so a reprice redraws it: how many artists and faces, which artists
 * carry the Distribute tag, and the people count. Every name is made up.
 * Drawn by components/billing/PlanPicture.tsx.
 */

const ARTISTS = ['Kanmi Gold', 'Hadiza Moon', 'Lagoon Theory'];
const PEOPLE = ['Dami Okafor', 'Tolu Ade', 'Ada Eze', 'Seyi Bello', 'Bayo Lawal'];

export type PlanPictureFacts = {
  artists: { name: string; distributed: boolean }[];
  faces: string[];
  peopleLabel: string;
};

export function planPictureFacts(tierId: PricingTierId): PlanPictureFacts {
  const { artists, seats } = getTier(tierId).limits;
  // An unlimited plan shows the most the picture has room for.
  const artistCount = Math.min(artists ?? ARTISTS.length, ARTISTS.length);
  const faceCount = Math.min(seats ?? PEOPLE.length, PEOPLE.length);
  const distributed = DISTRIBUTION_ALLOWANCE[tierId]?.artists ?? 0;
  return {
    artists: ARTISTS.slice(0, artistCount).map((name, index) => ({ name, distributed: index < distributed })),
    faces: PEOPLE.slice(0, faceCount),
    peopleLabel: seats === null ? 'Your whole team' : `${seats} ${seats === 1 ? 'person' : 'people'}`,
  };
}
