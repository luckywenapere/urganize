import { wideContainerClass } from "./shared";

// The affiliations strip under the hero (2026-10-07, founder call).
//
// THE LINE IS "Built with people from", AND EVERY WORD HAS TO STAY TRUE. Each
// logo is backed by a real person, not by the company: people from CBA use
// Urganize (a customer), the founder used to work at The CAP Music, and an
// artist who used to be signed to Chocolate City has been talking with the
// team about the app (not a user yet). That is "with", not "built by" or
// "trusted by"; if all three ever use it, "Built and used by people from" is
// the stronger true line. The companies themselves
// have not endorsed Urganize, so do not reword this into a claim they have.
// The founder confirmed the people involved agree to the names and logos.
//
// ALL ONE COLOUR, on purpose (founder call). The three logos come in three
// colour schemes, and Chocolate City's is white on a see-through background,
// so it vanished on the light theme. Each file in /images/affiliations is a
// black-on-transparent MASK made from the company's own logo; the colour comes
// from --marketing-text-muted, so it follows the light and dark theme with no
// second set of files. To add a logo, make the same kind of mask (alpha is the
// logo, colour does not matter) and add a row below with its pixel size.
const AFFILIATIONS = [
  {
    name: "Creative Business Academy for Africa",
    src: "/images/affiliations/creative-business-academy-for-africa.png",
    width: 389,
    height: 160,
    // Shown height in px. The three are tuned by eye so they carry similar
    // weight: the wide wordmark is shorter, the boxed and stacked marks taller.
    shown: 44,
  },
  {
    name: "Chocolate City",
    src: "/images/affiliations/chocolate-city.png",
    width: 841,
    height: 160,
    shown: 30,
  },
  {
    name: "The CAP Music",
    src: "/images/affiliations/the-cap-music.png",
    width: 278,
    height: 160,
    shown: 46,
  },
] as const;

export function AffiliationsSection() {
  return (
    <section aria-labelledby="affiliations-heading" className="pb-16 sm:pb-20">
      <div className={`mx-auto ${wideContainerClass}`}>
        <p
          id="affiliations-heading"
          className="text-balance text-center text-sm leading-6 text-[var(--marketing-text-muted)]"
        >
          Built with people from
        </p>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 sm:gap-x-16">
          {AFFILIATIONS.map((logo) => (
            <li key={logo.name} className="flex items-center">
              <span
                role="img"
                aria-label={logo.name}
                title={logo.name}
                className="block bg-[var(--marketing-text-muted)]"
                style={{
                  height: logo.shown,
                  width: Math.round((logo.shown * logo.width) / logo.height),
                  WebkitMaskImage: `url(${logo.src})`,
                  maskImage: `url(${logo.src})`,
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
