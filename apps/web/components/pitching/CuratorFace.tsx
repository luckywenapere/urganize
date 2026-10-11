// The face of a curator, everywhere pitching shows one: the picture grid, the
// send card, the checkout, the sent list and the replies.
//
// Pitching is a person-to-person moment (an artist hoping a real human hears
// their song), so the product leads with faces rather than rows of names
// (founder brief, 2026-10-11). A curator with no photo still gets a tile that
// looks chosen: a soft gradient picked from her name, the same every time.

const TILE_HUES = [262, 200, 330, 20, 160, 45, 290, 180];

function hueFor(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) | 0;
  return TILE_HUES[Math.abs(hash) % TILE_HUES.length];
}

export const curatorInitials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

type CuratorFaceProps = {
  name: string;
  photoUrl?: string | null;
  /** 'fill' covers its (relative) parent, for tiles; a number is a round avatar of that many px. */
  size?: 'fill' | number;
  className?: string;
};

export function CuratorFace({ name, photoUrl, size = 'fill', className = '' }: CuratorFaceProps) {
  const fill = size === 'fill';
  const hue = hueFor(name);
  const box = fill
    ? 'absolute inset-0 h-full w-full'
    : 'relative inline-flex shrink-0 overflow-hidden rounded-full';
  const style = fill ? undefined : { width: size, height: size };

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; the optimizer would cache it past expiry
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        style={style}
        className={`${box} object-cover ${className}`}
      />
    );
  }

  const textSize = fill ? 'text-4xl sm:text-5xl' : (size as number) >= 48 ? 'text-base' : 'text-[11px]';
  return (
    <span
      aria-hidden="true"
      className={`${box} items-center justify-center font-display font-semibold text-white/90 ${fill ? 'flex' : ''} ${textSize} ${className}`}
      style={{
        ...style,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 65% 35%))`,
      }}
    >
      {curatorInitials(name)}
    </span>
  );
}
