'use client';

import { WorkspaceIdentitySection } from '../WorkspaceIdentitySection';
import { WorkspaceLogoSection } from '../WorkspaceLogoSection';
import { WorkspaceArtistSection } from '../WorkspaceArtistSection';
import { ReleasesSection } from '../ReleasesSection';
import { TeamBriefSection } from '../TeamBriefSection';
import { isTeamBriefEnabled } from '@/lib/team-brief';
import {
  IDENTITY_PANEL_ENABLED,
  LOGO_MIME_ALLOWLIST,
  LOGO_SIZE_LIMIT,
  WORKSPACE_FEATURE_ENABLED,
  type WorkspaceSettingsState,
} from '../useWorkspaceSettings';

type WorkspaceTabProps = {
  workspace: WorkspaceSettingsState;
};

/**
 * The workspace itself — how it's identified, who it's for, and what's in it.
 *
 * State lives in `useWorkspaceSettings`, called at page level, because these
 * three editors are presentational by design (see WorkspaceArtistSection's
 * note) and their fetches must not wait for this tab to open.
 *
 * ReleasesSection is the only place a release can be deleted (URG-163). It sits
 * here rather than in Account because a release belongs to the workspace, and
 * it's last in the tab for the same reason Delete account is last in Account:
 * destructive, rarely used.
 */
export function WorkspaceTab({ workspace }: WorkspaceTabProps) {
  return (
    <div className="divide-y divide-stroke-subtle">
      {/* Workspace identity + logo share one row (founder call, 2026-08-05):
          a natural pair — both just feed the workspace card shown across the
          app. */}
      {IDENTITY_PANEL_ENABLED && (
        <div className="grid gap-x-10 divide-y divide-stroke-subtle sm:grid-cols-2 sm:divide-y-0">
          <WorkspaceIdentitySection
            input={workspace.nameInput}
            onInputChange={workspace.setNameInput}
            isLoading={!workspace.identityHydrated}
            isSaving={workspace.isSavingName}
            message={workspace.nameMessage}
            error={workspace.nameError}
            onSave={workspace.saveName}
          />
          <WorkspaceLogoSection
            logo={workspace.logo}
            isLoading={!workspace.identityHydrated}
            isSaving={workspace.isSavingLogo}
            message={workspace.logoMessage}
            error={workspace.logoError}
            mimeAllowlist={LOGO_MIME_ALLOWLIST}
            sizeLimit={LOGO_SIZE_LIMIT}
            onUpload={workspace.uploadLogo}
            onRemove={workspace.removeLogo}
          />
        </div>
      )}

      {WORKSPACE_FEATURE_ENABLED && (
        <WorkspaceArtistSection
          artists={workspace.artists}
          artistLimit={workspace.artistLimit}
          isLoading={workspace.isLoadingArtists}
          savingArtistId={workspace.savingArtistId}
          isAdding={workspace.isAddingArtist}
          message={workspace.artistMessage}
          error={workspace.artistError}
          onRename={workspace.renameArtist}
          onAdd={workspace.addArtist}
        />
      )}

      {/* Before ReleasesSection, which is destructive and stays last. */}
      {isTeamBriefEnabled() && <TeamBriefSection />}

      <ReleasesSection />
    </div>
  );
}
