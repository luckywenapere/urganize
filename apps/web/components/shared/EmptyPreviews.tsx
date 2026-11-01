/**
 * The faded "page when full" pictures drawn behind first-run empty states
 * (#969, mock approved Nov 1, 2026). Passed to EmptyState's `preview` slot.
 *
 * Fixed example content only: every name is made up and none of it is the
 * team's data. Faces are flat initials tiles, never pictures or gradients.
 * Grey bars stand in for rows past the first few, so the sample reads as a
 * sketch rather than real records. The phone drops the widest pieces.
 */

import { ProfileFace } from './ProfileFace';


function Bar({ width, className = '' }: { width: string; className?: string }) {
  return <span className={`block h-[7px] rounded-full bg-bg-hover ${className}`} style={{ width }} />;
}

function Bars({ widths }: { widths: [string, string] }) {
  return (
    <span className="min-w-0 flex-1">
      <Bar width={widths[0]} />
      <Bar width={widths[1]} className="mt-2" />
    </span>
  );
}

// `phoneSketch`: drawn as grey bars on the phone, where the list is shorter.
const ARTIST_ROWS = [
  { name: 'Kanmi Gold', next: 'Love Letters from Yaba · Nov 22' },
  { name: 'Hadiza Moon', next: 'Sannu Da Zuwa · Apr 4' },
  { name: 'Lagoon Theory', next: 'Owambe Weather · Oct 24' },
  { name: 'Temi Ivory', next: 'Ife Mi · Dec 13', phoneSketch: true },
];

const ARTIST_ROW =
  'flex min-h-[66px] items-center gap-3.5 border-b border-content-primary/[0.07] px-1.5 sm:min-h-[72px]';

/** Home's artist list once the roster is in, with the next rollout for each. */
export function ArtistsEmptyPreview() {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-3.5 rounded-[20px] border border-stroke-default bg-bg-surface p-3.5 sm:px-[18px] sm:py-4">
        <ProfileFace name="Kanmi Gold" size={42} />
        <div className="min-w-0">
          <p className="text-[10.5px] uppercase tracking-[0.08em] text-content-tertiary">Next out</p>
          <p className="mt-0.5 truncate font-display text-[17px] text-content-primary sm:text-[19px]">
            Love Letters from Yaba
          </p>
          <p className="text-[12.5px] text-content-tertiary sm:text-[13px]">Kanmi Gold · Nov 22</p>
        </div>
        <div className="ml-auto hidden w-[140px] sm:block">
          <span className="block h-1.5 overflow-hidden rounded-full bg-bg-hover">
            <span className="block h-full w-[78%] rounded-full bg-brand" />
          </span>
          <p className="mt-[5px] text-right font-mono text-[11px] text-content-tertiary">14 / 17 done</p>
        </div>
      </div>
      {ARTIST_ROWS.map((row) => (
        <div key={row.name} className={ARTIST_ROW}>
          <ProfileFace name={row.name} size={42} />
          <div className={row.phoneSketch ? 'hidden sm:block' : undefined}>
            <p className="text-base text-content-primary">{row.name}</p>
            <p className="mt-0.5 text-[13.5px] text-content-secondary">{row.next}</p>
          </div>
          {row.phoneSketch ? (
            <span className="min-w-0 flex-1 sm:hidden">
              <Bar width="46%" />
              <Bar width="62%" className="mt-2" />
            </span>
          ) : null}
        </div>
      ))}
      <div className={ARTIST_ROW}>
        <ProfileFace name="Chioma Vale" size={42} />
        <Bars widths={['34%', '52%']} />
      </div>
    </div>
  );
}

const NOTE_ROW = 'border-t border-stroke-default px-3.5 py-2.5 first:border-t-0';
const NOTE_LIST = 'overflow-hidden rounded-[14px] border border-stroke-default bg-bg-surface';
const NOTE_EYEBROW = 'mx-0.5 mb-1.5 text-[10.5px] uppercase tracking-[0.08em] text-content-tertiary';

function NoteRow({ title, line, when, tag }: { title: string; line: string; when: string; tag?: string }) {
  return (
    <div className={NOTE_ROW}>
      <p className="truncate text-[13.5px] font-semibold text-content-primary">{title}</p>
      <p className="mt-px truncate text-[12.5px] text-content-secondary">{line}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono text-[10px] text-content-tertiary">{when}</span>
        {tag ? (
          <span className="whitespace-nowrap rounded-full bg-bg-elevated px-2 py-px text-[10.5px] font-semibold text-content-secondary">
            {tag}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The notebook in use: a pinned note on top, notes tagged to a rollout. */
export function NotesEmptyPreview() {
  return (
    <div className="pt-1">
      <p className={NOTE_EYEBROW}>Pinned</p>
      <div className={NOTE_LIST}>
        <NoteRow title="Radio list for Ife Mi" line="Six stations in Lagos, two in Abuja" when="2h ago" tag="Ife Mi" />
      </div>
      <p className={`${NOTE_EYEBROW} mt-3.5`}>Notes</p>
      <div className={NOTE_LIST}>
        <NoteRow title="Cover art feedback" line="Temi wants the title smaller" when="Yesterday" />
        <NoteRow title="Video shoot day" line="Call time 7am, Lekki" when="Mon" tag="Owambe Weather" />
        <div className={NOTE_ROW}>
          <Bar width="52%" />
          <Bar width="76%" className="mt-2" />
        </div>
        <div className={NOTE_ROW}>
          <Bar width="40%" />
          <Bar width="66%" className="mt-2" />
        </div>
      </div>
    </div>
  );
}

const PEOPLE = [
  { name: 'Ada Nwosu', role: 'Photographer', city: 'Lagos', open: true, credit: 'Shot the cover for Ife Mi' },
  { name: 'Tolu Bankole', role: 'Video director', city: 'Abuja', open: false, credit: 'Directed Owambe Weather' },
  { name: 'Seyi Coker', role: 'Mix engineer', city: 'Lagos', open: true, credit: 'Mixed Sannu Da Zuwa' },
];

const SKETCHES = [
  { name: 'Ife Eze', city: 'Accra', widths: ['62%', '40%'] as [string, string] },
  { name: 'Kola Obi', city: 'Lagos', widths: ['50%', '66%'] as [string, string] },
  { name: 'Mide Dare', city: 'Port Harcourt', widths: ['58%', '36%'] as [string, string] },
];

const PILL = 'whitespace-nowrap rounded-full bg-bg-hover px-[9px] py-0.5 text-[11.5px] text-content-secondary';
const OPEN_PILL = 'whitespace-nowrap rounded-full bg-brand-subtle px-[9px] py-0.5 text-[11.5px] font-semibold text-brand';
const PERSON_CARD = 'rounded-2xl border border-stroke-default bg-bg-surface p-4';

/** Directory profile cards: role, city, open to work, a credit. Made-up people. */
export function DirectoryEmptyPreview() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PEOPLE.map((person) => (
        <div key={person.name} className={PERSON_CARD}>
          <div className="flex items-center gap-3">
            <ProfileFace name={person.name} size={36} />
            <div>
              <p className="text-[14.5px] font-semibold text-content-primary">{person.name}</p>
              <p className="text-[12.5px] text-content-secondary">{person.role}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={PILL}>{person.city}</span>
            {person.open ? <span className={OPEN_PILL}>Open to work</span> : null}
          </div>
          <p className="mt-3 border-t border-stroke-default pt-2.5 text-[12.5px] text-content-secondary">
            {person.credit}
          </p>
        </div>
      ))}
      {SKETCHES.map((sketch) => (
        <div key={sketch.name} className={PERSON_CARD}>
          <div className="flex items-center gap-3">
            <ProfileFace name={sketch.name} size={36} />
            <Bars widths={sketch.widths} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={PILL}>{sketch.city}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_PILL =
  'hidden h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border border-stroke-strong bg-bg-base px-3 text-[12.5px] font-semibold text-content-primary sm:flex';

/** The open list: a deal, a grant and a sync brief, one overdue. */
export function OpportunitiesEmptyPreview() {
  return (
    <div>
      <p className="text-[13.5px] text-content-secondary">
        <b className="text-content-primary">3</b> open, <b className="text-status-error">1</b> overdue
      </p>
      <div className="mt-2 rounded-[14px] border border-stroke-default bg-bg-surface px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-content-primary">Brand deal with a drinks company</p>
            <p className="mt-0.5 text-[13px] text-content-secondary">Brand · Kanmi Gold · ₦2,500,000</p>
          </div>
          <span className={STATUS_PILL}>Negotiating</span>
        </div>
        <p className="mt-2.5 text-[13px] text-content-secondary">
          <b className="text-content-primary">Next:</b> send the signed draft
          <span className="hidden sm:inline"> (Thursday) · Closes Nov 14</span>
        </p>
      </div>
      <div className="mt-2 rounded-[14px] border border-status-error/45 bg-bg-surface px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-content-primary">Lagos culture grant</p>
            <p className="mt-0.5 text-[13px] text-content-secondary">Grant · Hadiza Moon · ₦1,000,000</p>
          </div>
          <span className={STATUS_PILL}>Reaching out</span>
        </div>
        <p className="mt-2.5 text-[13px] text-content-secondary">
          <span className="hidden sm:inline">
            <b className="text-content-primary">Next:</b> budget page ·{' '}
          </span>
          <span className="text-status-error">Closed yesterday</span>
        </p>
      </div>
      <div className="mt-2 rounded-[14px] border border-stroke-default bg-bg-surface px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-content-primary">Sync brief for a TV drama</p>
            <p className="mt-0.5 text-[13px] text-content-secondary">Sync · Lagoon Theory</p>
          </div>
          <span className={STATUS_PILL}>Talking</span>
        </div>
        <Bar width="46%" className="mt-3.5" />
      </div>
    </div>
  );
}
