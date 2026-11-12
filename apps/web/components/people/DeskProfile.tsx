import { DirectoryBackLink, ProfileDeskActions } from '@/components/people/ProfileDeskActions';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';
import { initialsOf } from '@/lib/person-page';
import { formatCalendarDate } from '@/lib/artist-page';
import type { WorkPiece } from '@/lib/person-work';
import type { ProfileRole } from '@/types/directory';

// The app's dark tokens, as on the rest of /p/{slug} (see that page's comment).
const GROUND = '#0c0c0d';
const SURFACE = '#171719';
const MUTED = '#929291';
const ACCENT = '#7fd99a';
const LINE = '#202023';

function Tick() {
  return (
    <span
      role="img"
      aria-label="Claimed"
      className="ml-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full align-[6px] text-xs font-black text-black"
      style={{ backgroundColor: ACCENT, fontFamily: 'system-ui, sans-serif' }}
    >
      ✓
    </span>
  );
}

/** The page on a computer (lg and up, #1221, approved mock directory-desktop):
 *  one header with the ask beside it, the full bio, the work itself, and who
 *  they work with. Same dark palette; phones keep the page above. */
export function DeskProfile({
  slug,
  name,
  photoUrl,
  role,
  openToWork,
  bio,
  work,
  coverById,
  roles,
  partners,
  links,
}: {
  slug: string;
  name: string;
  photoUrl: string | null;
  role: string | null;
  openToWork: boolean;
  bio: string;
  work: WorkPiece[];
  coverById: Map<string, string>;
  roles: ProfileRole[];
  partners: string[];
  links: { label: string; url: string }[];
}) {
  const card = 'rounded-2xl p-5';
  const cardStyle = { backgroundColor: SURFACE, border: `1px solid ${LINE}` };
  return (
    <main className="mx-auto hidden w-full max-w-[1120px] flex-col gap-4 px-8 pt-10 lg:flex">
      <DirectoryBackLink color={MUTED} />
      <header className="flex items-center gap-6 rounded-[20px] p-7" style={cardStyle}>
        <div
          className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-3xl"
          style={{ backgroundColor: GROUND }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            initialsOf(name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[32px] leading-10">
            {name}
            <Tick />
          </h1>
          {role ? <p className="mt-1 text-[15px]" style={{ color: MUTED }}>{role}</p> : null}
          {openToWork ? (
            <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: ACCENT }}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
              Open to work
            </p>
          ) : null}
        </div>
        <ProfileDeskActions slug={slug} />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {bio ? (
            <section className={card} style={cardStyle}>
              <h2 className="mb-3 text-sm font-semibold">About</h2>
              <p className="whitespace-pre-line text-[15px] leading-6">{bio}</p>
            </section>
          ) : null}
          {work.length > 0 ? (
            <section className={card} style={cardStyle}>
              <h2 className="mb-3 text-sm font-semibold">Work on Urganize</h2>
              <ul>
                {work.map((piece, index) => {
                  const cover = piece.title ? coverById.get(piece.key.split(':')[0]) : undefined;
                  const out = formatCalendarDate(piece.outOn);
                  return (
                    <li
                      key={piece.key}
                      className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 py-3"
                      style={index === 0 ? { paddingTop: 0 } : { borderTop: `1px solid ${LINE}` }}
                    >
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <span aria-hidden className="h-10 w-10 rounded-md" style={{ backgroundColor: GROUND }} />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {piece.work} · {piece.title ?? 'A rollout not out yet'}
                        </p>
                        {piece.title ? (
                          <p className="truncate text-[13px]" style={{ color: MUTED }}>
                            {[piece.artistName, out ? `out ${out}` : null].filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className="rounded-full px-2 text-xs font-semibold leading-5"
                        style={{ backgroundColor: 'rgba(127,217,154,0.12)', color: ACCENT }}
                      >
                        Delivered
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[13px]" style={{ color: MUTED }}>
                Counted from activities they finished on real rollouts. People cannot type this in.
              </p>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {roles.length > 0 ? (
            <section className={card} style={cardStyle}>
              <h2 className="mb-3 text-sm font-semibold">Does</h2>
              <ul className="flex flex-wrap gap-2">
                {roles.map((held) => (
                  <li
                    key={held.role}
                    className="rounded-full px-2.5 py-1 text-[13px]"
                    style={
                      held.delivered > 0
                        ? { backgroundColor: 'rgba(127,217,154,0.12)', color: ACCENT, fontWeight: 600 }
                        : { border: `1px solid ${LINE}` }
                    }
                  >
                    {DIRECTORY_ROLE_LABELS[held.role]}
                    {held.delivered > 0 ? ' ✓' : ''}
                  </li>
                ))}
              </ul>
              {roles.some((held) => held.delivered > 0) ? (
                <p className="mt-3 text-[13px]" style={{ color: MUTED }}>
                  Green means delivered on a rollout. The rest they say they do.
                </p>
              ) : null}
            </section>
          ) : null}
          {partners.length > 0 ? (
            <section className={card} style={cardStyle}>
              <h2 className="mb-2 text-sm font-semibold">Works with</h2>
              <ul>
                {partners.map((partner) => (
                  <li key={partner} className="flex items-center gap-3 py-2">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: GROUND }}
                    >
                      {initialsOf(partner)}
                    </span>
                    <span className="truncate">{partner}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {links.length > 0 ? (
            <section className={card} style={cardStyle}>
              <h2 className="mb-2 text-sm font-semibold">Links</h2>
              <ul>
                {links.map((link, index) => (
                  <li key={link.url} style={index === 0 ? undefined : { borderTop: `1px solid ${LINE}` }}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="motion-focus flex items-center justify-between py-2.5"
                    >
                      <span className="truncate">{link.label}</span>
                      <span aria-hidden style={{ color: MUTED }}>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
