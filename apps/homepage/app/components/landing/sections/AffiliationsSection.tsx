import { wideContainerClass } from "./shared";

// The affiliations strip under the hero (2026-10-07, founder call; trimmed
// 2026-10-17, URG-333).
//
// TWO TRUE LINES, SIDE BY SIDE. "Backed by" is Greylight alone: Urganize is in
// Greylight's Tangent Cohort 002, a venture-building programme. "Built with
// people from" is backed by real people, not by the company: people from CBA
// use Urganize. The company has not endorsed Urganize, so do not reword this
// into a claim it has. The founder confirmed the people involved agree to the
// name and logo.
//
// REMOVED 2026-10-17 (founder call, URG-333): the Chocolate City and The CAP
// Music logos no longer render. Their mask files stay in
// /images/affiliations (chocolate-city.png, the-cap-music.png) and are unused.
// With one logo per line, the two lines sit side by side as one strip (stacked
// on phones) instead of two thin centred rows.
//
// ALL ONE COLOUR, on purpose (founder call). Each file in /images/affiliations
// is a black-on-transparent MASK made from the company's own logo; the colour
// comes from --marketing-text-muted, so it follows the light and dark theme
// with no second set of files. To add a logo, make the same kind of mask
// (alpha is the logo, colour does not matter) and add a row with its pixel
// size. Shown heights are tuned by eye so the marks carry similar weight.
const BACKERS = [
  {
    name: "Greylight",
    src: "/images/affiliations/greylight.png",
    width: 926,
    height: 160,
    shown: 28,
  },
] as const;

const AFFILIATIONS = [
  {
    name: "Creative Business Academy for Africa",
    src: "/images/affiliations/creative-business-academy-for-africa.png",
    width: 389,
    height: 160,
    shown: 40,
  },
] as const;

type Logo = (typeof AFFILIATIONS)[number] | (typeof BACKERS)[number];

function LogoMark({ logo }: { logo: Logo }) {
  return (
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
  );
}

function LogoGroup({
  label,
  logos,
  id,
}: {
  label: string;
  logos: readonly Logo[];
  id?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p
        id={id}
        className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[var(--marketing-text-muted)]"
      >
        {label}
      </p>
      <ul className="flex h-11 flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {logos.map((logo) => (
          <li key={logo.name} className="flex items-center">
            <LogoMark logo={logo} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AffiliationsSection() {
  return (
    <section aria-labelledby="affiliations-heading" className="pb-16 sm:pb-20">
      <div className={`mx-auto ${wideContainerClass}`}>
        <div className="flex flex-col items-center justify-center gap-10 sm:flex-row sm:items-start sm:gap-0">
          <LogoGroup id="affiliations-heading" label="Backed by" logos={BACKERS} />
          <span
            aria-hidden="true"
            className="mx-14 hidden h-16 w-px self-center bg-[var(--marketing-border-strong)] sm:block"
          />
          <LogoGroup label="Built with people from" logos={AFFILIATIONS} />
        </div>
      </div>
    </section>
  );
}
