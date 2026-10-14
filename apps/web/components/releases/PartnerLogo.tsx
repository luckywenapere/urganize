/**
 * A partner's own logo, from public/partners (founder, 2026-10-14: "source
 * their logos and just put their logos"). Both logos are drawn for a light
 * background, so they sit on a light tile in both themes. The alt text is the
 * brand name, so the logo still says who the partner is to a screen reader.
 */
export function PartnerLogo({
  src,
  alt,
  logoClassName = 'h-10',
}: {
  src: string;
  alt: string;
  /** The logo's height. A squarer logo needs a little more to read the same. */
  logoClassName?: string;
}) {
  return (
    <div className="mt-3 flex h-16 w-fit items-center self-start rounded-lg border border-stroke-default bg-white px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={`${logoClassName} w-auto max-w-full object-contain`} />
    </div>
  );
}
