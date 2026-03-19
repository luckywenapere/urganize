# Urganize Product Requirements Document

Version: 1.5 MVP Final  
Date: March 10, 2026  
Product: Urganize

## 1. Product Vision

Urganize is the execution OS for music release teams. It replaces scattered tools (WhatsApp, docs, spreadsheets, boards, cloud folders) with one release workspace that drives action and accountability.

## 2. MVP Objective

Enable a manager to create a release, generate an AI-assisted strategy, and execute it end-to-end in one place.

## 3. MVP Scope

- Auth + role-based access
- Organization workspace
- Artists and releases
- AI-generated release plan (structured)
- Task board (AI + custom tasks)
- Marketing calendar
- Playlist tracker
- Distribution checklist
- Asset manager
- Trial + subscription gating
- Basic product analytics

## 4. Success Metrics

- First value time: user generates first AI plan in under 10 minutes
- Activation: at least 60% of new orgs create at least 1 release in first session
- Execution: at least 40% of created tasks marked completed within 14 days
- Conversion: trial-to-paid conversion tracked and visible
- Reliability: AI plan generation success rate at least 95%

## 5. Users and Roles

- Manager: full control (artists, releases, billing, invites, strategy)
- Artist: view releases, upload assets, comment or update assigned items
- Team Member: update tasks, marketing, playlist, assets
- Viewer: read-only

## 6. Core Data Model

- `organizations`
- `organization_members`
- `artists`
- `releases`
- `release_profiles`
- `ai_tasks`
- `release_workspaces` (marketing, playlist, checklist, custom task workspace state)
- `assets` (storage metadata)
- `subscriptions` / `trial_state`
- `event_logs` (analytics)

## 7. Core User Flow

1. Sign up / sign in
2. Create organization
3. Add artist
4. Create release
5. Generate AI release plan (trial starts here)
6. Execute in workspace:
   - task board
   - marketing calendar
   - playlist pitching
   - distribution checklist
   - assets
7. Continue cycles (feedback to next step)

## 8. AI Requirements

Model: Qwen via Ollama (local runtime)

AI output must be JSON with:

- `tasks`
- `milestones`
- `marketingIdeas`
- `audienceProfile`
- `playlistSuggestions`

Modes:

- Initial plan generation
- Regeneration on demand
- Prompt to regenerate when key release inputs change

## 9. Functional Requirements

### 9.1 Task Board

- Show AI tasks and custom tasks
- Custom task creation with tag scope: `release` or `artist`
- Priority, due date, status, inline edit, drag reorder
- Search, filter, export CSV

### 9.2 Marketing Calendar

- Add, edit, remove entries (platform, content type, owner, publish date, caption)

### 9.3 Playlist Tracker

- Manual entries with status pipeline
- Notes and submission dates

### 9.4 Distribution Checklist

- Default checklist template
- Toggle completion per item

### 9.5 Asset System

- Upload by category: `cover_art`, `audio`, `promo_image`, `video`, `document`
- Scope: artist-level or release-level
- View, open, delete asset

### 9.6 Plans Dashboard

- Create, open, delete plans
- Rename title support
- Plan status and timeline health indicators

## 10. Billing and Trial

- Trial starts on first AI plan generation
- Trial length: 30 days
- Post-trial: restricted/read-only until payment
- Pricing tiers enforced by limits (artists/features as configured)

## 11. Analytics Events

Track:

- `signup_completed`
- `artist_created`
- `release_created`
- `ai_plan_generated`
- `task_completed`
- `trial_started`
- `trial_converted`

## 12. Non-Goals for MVP

- Distribution platform API integrations
- Automated marketing posting
- Royalty accounting
- Financing products

## 13. Risks

- AI latency and quality inconsistency
- Schema drift as workspace grows
- Trial abuse edge cases
- Permission bugs across roles

## 14. Release Readiness Checklist

- Core flows tested (create release to AI plan to execute)
- Role permissions validated
- Billing gates validated
- Analytics firing verified
- Error handling for AI and workspace sync paths

## 15. Post-MVP Expansion

- Distribution integrations
- Campaign performance analytics
- Automated workflows
- Royalty and revenue modules
