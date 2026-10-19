'use client';

import type { ReactNode } from 'react';
import { ChevronRight, X } from '@/components/icons';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { readSettingsFlags } from '@/lib/settings-nav';
import { SwipeSheet } from './SwipeSheet';

/**
 * Connections (URG-380, frame 10 of the approved mocks): what UrgAns can read to
 * answer you, grouped Work, Audience, Streaming. Nothing here starts a new
 * integration: none of these services is wired in the codebase yet, so each
 * row says Soon (or Add link for the two that will take a profile link), as in
 * the mock. What IS wired, Connected apps (UrgAns in Claude and ChatGPT) and
 * the data export, sits under Your account and opens its real settings.
 */

type Status = 'soon' | 'link';

const GROUPS: { title: string; rows: { name: string; sub?: string; status: Status; icon: ReactNode }[] }[] = [
  {
    title: 'Work',
    rows: [
      { name: 'Google', sub: 'Gmail · Calendar · Drive', status: 'soon', icon: <GlyphGoogle /> },
      { name: 'WhatsApp Business', status: 'soon', icon: <GlyphWhatsApp /> },
    ],
  },
  {
    title: 'Audience',
    rows: [
      { name: 'Instagram', status: 'soon', icon: <GlyphInstagram /> },
      { name: 'TikTok', status: 'soon', icon: <GlyphTikTok /> },
      { name: 'YouTube', status: 'soon', icon: <GlyphYouTube /> },
    ],
  },
  {
    title: 'Streaming',
    rows: [
      { name: 'Spotify for Artists', sub: 'Profile link', status: 'link', icon: <GlyphWave /> },
      { name: 'Audiomack', status: 'soon', icon: <GlyphLetter letter="A" /> },
      { name: 'Boomplay', status: 'soon', icon: <GlyphLetter letter="B" /> },
      { name: 'Apple Music', sub: 'Profile link', status: 'link', icon: <GlyphLetter letter="♪" /> },
    ],
  },
];

const ROW = 'flex min-h-[58px] items-center gap-4 border-b border-content-primary/[0.07] last:border-b-0';
const EYEBROW = 'mb-1 mt-5 font-mono text-[11px] uppercase tracking-[0.6px] text-content-primary/50';

export function ConnectionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const openSettings = useOpenSettings();
  const flags = readSettingsFlags();
  const wired = [
    flags.mcpConnect ? { name: 'Connected apps', sub: 'UrgAns in Claude and ChatGPT', section: 'connected-apps' } : null,
    flags.dataExport ? { name: 'Your data', sub: 'Download everything', section: 'export' } : null,
  ].filter(Boolean) as { name: string; sub: string; section: string }[];

  return (
    <SwipeSheet open={open} label="Connections" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h2 className="font-display text-[28px] leading-tight text-content-primary">Connections</h2>
          <p className="mt-1 text-[15px] text-content-primary/55">What UrgAns can read to answer you.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="motion-focus grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-content-primary/[0.06] text-content-primary/70"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <p className={EYEBROW}>{group.title}</p>
          <ul>
            {group.rows.map((row) => (
              <li key={row.name} className={ROW}>
                <span className="grid w-[22px] shrink-0 place-items-center text-content-primary/75" aria-hidden="true">
                  {row.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] text-content-primary">{row.name}</span>
                  {row.sub ? <span className="block text-[13px] text-content-primary/50">{row.sub}</span> : null}
                </span>
                {row.status === 'link' ? (
                  <span className="text-[15px] text-content-primary/55">Add link</span>
                ) : (
                  <span className="font-mono text-[11px] uppercase tracking-[0.6px] text-content-primary/45">Soon</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {wired.length > 0 ? (
        <section aria-label="Your account">
          <p className={EYEBROW}>Your account</p>
          <ul>
            {wired.map((row) => (
              <li key={row.name}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openSettings({ segment: 'connections', section: row.section });
                  }}
                  className={`motion-focus w-full text-left ${ROW}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] text-content-primary">{row.name}</span>
                    <span className="block text-[13px] text-content-primary/50">{row.sub}</span>
                  </span>
                  <ChevronRight className="h-[18px] w-[18px] text-content-primary/35" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SwipeSheet>
  );
}

const SVG = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function GlyphGoogle() {
  return (
    <svg {...SVG}>
      <path d="M20 12.2h-8M20 12.2A8 8 0 1117.6 6.4" />
    </svg>
  );
}
function GlyphWhatsApp() {
  return (
    <svg {...SVG}>
      <path d="M4 20l1.2-4A8 8 0 1112 20a8 8 0 01-4-1z" />
    </svg>
  );
}
function GlyphInstagram() {
  return (
    <svg {...SVG}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
function GlyphTikTok() {
  return (
    <svg {...SVG}>
      <path d="M14 4v10.5a3.5 3.5 0 11-3.5-3.5M14 4c.5 2.5 2.3 4 5 4" />
    </svg>
  );
}
function GlyphYouTube() {
  return (
    <svg {...SVG}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10 9.3v5.4l4.6-2.7z" fill="currentColor" />
    </svg>
  );
}
function GlyphWave() {
  return (
    <svg {...SVG}>
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </svg>
  );
}
function GlyphLetter({ letter }: { letter: string }) {
  return (
    <span className="grid h-[22px] w-[22px] place-items-center rounded-md border border-current text-[11px] font-semibold">
      {letter}
    </span>
  );
}
