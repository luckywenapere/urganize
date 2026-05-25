# Urganize Launch QA Checklist

Use this before production launch. Run top to bottom.

## 1. Supabase Setup

### 1.1 Core migrations
- Run [DB_MIGRATION_ARTIST_NAME.md](c:/Users/penta/Documents/urganize/docs/DB_MIGRATION_ARTIST_NAME.md)
- Run [DB_MIGRATION_UI_DRAFTS.md](c:/Users/penta/Documents/urganize/docs/DB_MIGRATION_UI_DRAFTS.md)

### 1.2 Supporting tables
- Confirm these exist:
  - `profiles`
  - `releases`
  - `subscriptions`
  - `payments`
  - `release_workspaces`
  - `organizations`
  - `organization_members`
  - `app_settings`

### 1.3 Auth config
- Email/password enabled
- Google auth enabled if used
- Redirect URLs configured for:
  - local `/auth/callback`
  - production `/auth/callback`

## 2. Authentication And Profile Rules

### 2.1 New artist signup
Steps:
1. Create a new account
2. Select `Artist`
3. Leave artist name empty

Expected:
- signup cannot complete
- artist name is required

Then:
1. enter artist name
2. complete signup

Expected:
- account is created
- artist name is saved
- artist-only flows use that saved name

### 2.2 Existing artist without artist name
Steps:
1. Use an artist account with missing `artist_name`
2. log in

Expected:
- blocking prompt appears immediately
- user cannot continue into app without artist name

### 2.3 Artist name lock behavior
Steps:
1. log in as artist
2. open create plan
3. inspect any artist-name field

Expected:
- artist name is prefilled
- artist cannot edit it there
- only Settings/Profile can change it

### 2.4 Artist name update propagation
Steps:
1. change artist name in Settings
2. reopen onboarding and profile-related flows

Expected:
- new artist name appears everywhere

## 3. Role And Permission QA

### 3.1 Account type switch
Steps:
1. log in as artist
2. switch to artist manager
3. switch back to artist

Expected:
- rotational loader appears during switch
- dashboard cards update correctly
- manager-only sections disappear for artist
- artist-only sections disappear for manager

### 3.2 Dashboard role visibility
Expected:
- manager sees Artist Directory
- artist does not see Artist Directory
- manager can create plan
- read-only roles cannot create/generate/edit restricted items

## 4. Create New Plan Flow

### 4.1 Manager with one artist
Steps:
1. manager has exactly one managed artist
2. click `Create New Plan`

Expected:
- 3-card artist selector opens first
- artist is centered and preselected
- manager can continue immediately
- side cards still render intentionally

### 4.2 Manager with multiple artists
Steps:
1. manager has multiple artists
2. click `Create New Plan`

Expected:
- carousel/selector works
- center card is active selection
- moving between artists updates selection

### 4.3 Manager with no artists
Steps:
1. manager has no saved artists
2. click `Create New Plan`

Expected:
- centered `Add Artist` state appears
- manager can add artist inline
- save succeeds and selection updates

### 4.4 Artist flow
Steps:
1. log in as artist
2. create plan

Expected:
- artist does not see manager selector step
- artist name remains locked from profile

## 5. Persistence QA

### 5.1 Onboarding restore
Steps:
1. begin create-plan/onboarding flow
2. fill data
3. refresh browser

Expected:
- same step restores
- entered data restores
- selected artist restores

### 5.2 Dashboard/settings restore
Expected:
- dashboard filters/search/drafts restore
- settings drafts restore
- clear draft clears both local and backend draft state

### 5.3 Cross-device restore
Prerequisite:
- `ui_state_drafts` migration applied

Steps:
1. start a draft on browser A
2. open same account on browser/device B
3. open same workflow

Expected:
- workflow restores from backend draft

## 6. Workspace QA

### 6.1 Plan workspace context
Steps:
1. open a plan workspace
2. switch tabs
3. start marketing/playlist/custom task drafts
4. refresh

Expected:
- active tab restores
- draft inputs restore
- existing saved workspace data remains intact

### 6.2 Asset flow
Steps:
1. upload asset
2. verify list
3. delete asset

Expected:
- upload works
- asset category/owner selections behave correctly
- deletion works without breaking workspace

## 7. Build And Deployment

### 7.1 Local verification
- run `npm run build`
- confirm success

### 7.2 Production verification
- deploy latest build
- hard refresh app
- test auth callback
- test one manager account
- test one artist account

## 8. Launch Gate

Do not ship until all are true:
- no blocker bugs in onboarding
- no role leakage between artist/manager
- no broken Supabase table errors in production
- no draft restore loops
- no destructive modal restore
- no failed task generation path without visible recovery

## 9. Bug Logging Format

For each bug found, log:
- screen
- user role
- exact steps
- expected result
- actual result
- console error if any
- database/API error if any
- blocker / high / medium / low
