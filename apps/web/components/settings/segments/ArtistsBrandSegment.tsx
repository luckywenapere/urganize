"use client";

import { useWorkspaceIdentityStore } from "@/stores/useWorkspaceIdentityStore";
import { isBrandColorsEnabled } from "@/lib/social-share-colors";
import { BrandColorsSection } from "../BrandColorsSection";
import { WorkspaceArtistSection } from "../WorkspaceArtistSection";
import { WorkspaceIdentitySection } from "../WorkspaceIdentitySection";
import { WorkspaceLogoSection } from "../WorkspaceLogoSection";
import { SettingsGroup } from "../SettingsGroup";
import { useReportDirty } from "../useReportDirty";
import {
  IDENTITY_PANEL_ENABLED,
  LOGO_MIME_ALLOWLIST,
  LOGO_SIZE_LIMIT,
  WORKSPACE_FEATURE_ENABLED,
  type WorkspaceSettingsState,
} from "../useWorkspaceSettings";

/**
 * How the team is presented: its name and logo, the artists it works with, the
 * colors their share images use. (Press kits left Oct 17, 2026: the bio and
 * contact are edited in a rollout's Pitch this!.)
 *
 * State lives in `useWorkspaceSettings`, called once by the pop-up, because
 * these editors are presentational by design and their fetches must not wait
 * for this segment to be opened.
 */
export function ArtistsBrandSegment({
  workspace,
}: {
  workspace: WorkspaceSettingsState;
}) {
  // The team name is the one field here that saves through a parent-owned
  // input, so its "unsaved" answer is computed here, against what the always-
  // mounted identity card holds.
  const savedName = useWorkspaceIdentityStore((state) => state.name);
  const nameDirty =
    IDENTITY_PANEL_ENABLED &&
    workspace.identityHydrated &&
    workspace.nameInput.trim() !== savedName.trim();
  useReportDirty("team.name", nameDirty);

  return (
    <div className="divide-y divide-stroke-subtle">
      {/* Two folds: who the team is, and the artists and their colors. The
          Press kits fold left Oct 17, 2026 (founder approved "cuts-3"). */}
      <SettingsGroup title="Your team" defaultOpen>
        {/* Team name and logo share a row: a natural pair, since both only feed
          the team card shown across the app (founder call, 2026-08-05). */}
        {IDENTITY_PANEL_ENABLED && (
          <div
            id="team-identity"
            className="grid scroll-mt-4 gap-x-10 divide-y divide-stroke-subtle sm:grid-cols-2 sm:divide-y-0"
          >
            <WorkspaceIdentitySection
              input={workspace.nameInput}
              onInputChange={workspace.setNameInput}
              isLoading={!workspace.identityHydrated}
              isSaving={workspace.isSavingName}
              isDirty={nameDirty}
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
      </SettingsGroup>

      <SettingsGroup title="Artists" defaultOpen>
        {WORKSPACE_FEATURE_ENABLED && (
          <WorkspaceArtistSection
            artists={workspace.artists}
            artistLimit={workspace.artistLimit}
            isLoading={workspace.isLoadingArtists}
            savingArtistId={workspace.savingArtistId}
            removingArtistId={workspace.removingArtistId}
            isAdding={workspace.isAddingArtist}
            message={workspace.artistMessage}
            error={workspace.artistError}
            onRename={workspace.renameArtist}
            onAdd={workspace.addArtist}
            onRemove={workspace.removeArtist}
          />
        )}

        {/* Right under the artists the colors belong to. The share sheet links
          straight here (`?settings=artists&section=brand-colors`). */}
        {WORKSPACE_FEATURE_ENABLED && isBrandColorsEnabled() && (
          <BrandColorsSection
            artists={workspace.artists}
            isLoading={workspace.isLoadingArtists}
            savingId={workspace.savingBrandColorsId}
            message={workspace.brandColorsMessage}
            error={workspace.brandColorsError}
            onSave={workspace.saveBrandColors}
          />
        )}
      </SettingsGroup>

    </div>
  );
}
