import { Chappi, CHAPPI_POSES, CHAPPI_GLOW, CHAPPI_MIN_SIZE } from '@urganize/ui';

export const metadata = { title: 'Chappi · Urganize admin' };

const SIZES = [CHAPPI_MIN_SIZE, 96, 160] as const;

/**
 * The mascot's model sheet, rendered from the real component.
 *
 * Internal only, like the rest of /admin — this is where a pose gets checked
 * after the sheet is revised, and where the smallest legible size gets
 * eyeballed. It reads no data, so it has no backing API to gate on; there is
 * nothing here a signed-in stranger could learn.
 */
export default function ChappiPreviewPage() {
  return (
    <div className="space-y-10">
      <div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-brand">
          Character model sheet
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Chappi</h1>
        <p className="mt-2 max-w-[42rem] text-sm leading-6 text-content-secondary">
          Six poses at {SIZES.join(', ')} pixels. Below {CHAPPI_MIN_SIZE} he stops reading, so the
          component clamps up to it. The float is transform only and goes static under reduced
          motion.
        </p>
      </div>

      {SIZES.map((size) => (
        <section key={size} className="space-y-4">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-content-tertiary">
            {size} px
          </h2>
          <div className="flex flex-wrap items-end gap-6">
            {CHAPPI_POSES.map((pose) => (
              <figure key={pose} className="flex flex-col items-center gap-2">
                <Chappi pose={pose} size={size} />
                <figcaption className="text-xs text-content-secondary">{pose}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-content-tertiary">
          On a dark surface
        </h2>
        <p className="max-w-[42rem] text-sm leading-6 text-content-secondary">
          His hood is ink, so a dark background needs the forest glow behind him. It goes on the
          container as a background, never on the character.
        </p>
        <div
          className="flex flex-wrap items-center gap-6 rounded-xl p-8"
          style={{ backgroundColor: '#0D120E' }}
        >
          {(['idle', 'thinking', 'resting'] as const).map((pose) => (
            <div
              key={pose}
              className="grid h-40 w-40 place-items-center rounded-full"
              style={{ background: CHAPPI_GLOW }}
            >
              <Chappi pose={pose} size={96} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-content-tertiary">
          Static
        </h2>
        <div className="flex flex-wrap items-end gap-6">
          {CHAPPI_POSES.map((pose) => (
            <Chappi key={pose} pose={pose} size={CHAPPI_MIN_SIZE} animate={false} />
          ))}
        </div>
      </section>
    </div>
  );
}
