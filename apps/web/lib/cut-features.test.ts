import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The Oct 16, 2026 feature cuts (URG-319). next.config.js spreads
// lib/cut-features.json into Next's `env`, which outranks the Vercel
// environment, so these features stay off whatever an env edit says.
// Bringing one back is a deliberate edit to the JSON, and to this list.
const require = createRequire(import.meta.url);

const CUT = [
  'NEXT_PUBLIC_FEATURE_EVENTS',
  'NEXT_PUBLIC_FEATURE_CAPTURE',
  'NEXT_PUBLIC_FEATURE_RELEASE_CHAT',
  'NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR',
  'NEXT_PUBLIC_FEATURE_URGANS_VOICE',
  'NEXT_PUBLIC_FEATURE_URGANS_REALTIME',
  'NEXT_PUBLIC_FEATURE_MCP_CONNECT',
  'NEXT_PUBLIC_FEATURE_INVITE_GATE',
  'NEXT_PUBLIC_FEATURE_SHARE_REWARD',
  'NEXT_PUBLIC_FEATURE_NOTES',
  'NEXT_PUBLIC_FEATURE_PITCH_PAYMENTS',
  // The release EPK (URG-196), hidden Oct 17, 2026: only internal accounts
  // ever made one. Its rows in release_epks are kept.
  'NEXT_PUBLIC_FEATURE_EPK',
  // Team logins and the team brief, hidden Oct 17, 2026 (Oyin: "remove team
  // logins and team briefs"). No outside account had anyone join through a
  // team login, and one outside team wrote one brief section. Their rows in
  // workspace_invite_links and team_brief_sections are kept. The ungated
  // invite-link POST behind Settings > Teammates' "Copy invite link" stays.
  'NEXT_PUBLIC_FEATURE_TEAM_LOGINS',
  'NEXT_PUBLIC_FEATURE_TEAM_BRIEF',
];

describe('feature cuts (URG-319)', () => {
  it('forces every cut flag to "false" in the Next config env', () => {
    const config = require('../next.config.js');
    for (const flag of CUT) {
      expect(config.env?.[flag], flag).toBe('false');
    }
  });

  it('cuts exactly the reviewed list', () => {
    const json = require('./cut-features.json') as Record<string, string>;
    expect(Object.keys(json).sort()).toEqual([...CUT].sort());
    expect(new Set(Object.values(json))).toEqual(new Set(['false']));
  });

  it('never cuts the flags the kept features need', () => {
    const json = require('./cut-features.json') as Record<string, string>;
    for (const kept of ['NEXT_PUBLIC_FEATURE_PITCHING', 'NEXT_PUBLIC_FEATURE_PITCH_KIT', 'NEXT_PUBLIC_FEATURE_PRESS_KITS', 'NEXT_PUBLIC_FEATURE_METADATA', 'NEXT_PUBLIC_FEATURE_CHAPPI', 'NEXT_PUBLIC_FEATURE_SOCIAL_SHARE']) {
      expect(json[kept], kept).toBeUndefined();
    }
  });
});
