-- =============================================================================
-- Urganize v1 Production Schema Dump
-- Generated: 2026-05-24
-- Source: Supabase PostgreSQL (app.urganize.app)
-- =============================================================================
--
-- Notes:
--   FKs referencing auth.users(id) point to the Supabase-managed auth schema,
--   not the public schema. They are documented here as REFERENCES auth.users(id).
--
--   releases.artist_id references the dropped "artists" table (orphaned FK from
--   the v1 cut). It should be cleaned up in a future migration.
-- =============================================================================

-- =============================================================================
-- TABLE: releases
-- =============================================================================

CREATE TABLE public.releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    artist_name text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    release_date date,
    cover_art text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    current_task_id uuid,
    tasks_completed integer DEFAULT 0,
    tasks_skipped integer DEFAULT 0,
    campaign_completed boolean DEFAULT false,
    campaign_completed_at timestamptz,
    has_artist_profile boolean DEFAULT false,
    owner_user_id uuid,
    artist_id uuid,
    slug text,
    description text,
    state text DEFAULT 'idea'::text NOT NULL,
    readiness_score smallint DEFAULT 0 NOT NULL,
    deadline timestamptz,
    release_type release_type DEFAULT 'single'::release_type NOT NULL,
    artwork_asset_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    archived_at timestamptz,
    CONSTRAINT releases_pkey PRIMARY KEY (id)
);

-- NOTE: The "artists" table was dropped in the v1 cut. This FK is orphaned.
ALTER TABLE public.releases ADD CONSTRAINT releases_artist_id_fkey
    FOREIGN KEY (artist_id)
    REFERENCES public.artists (id)
    ON DELETE SET NULL;
ALTER TABLE public.releases ADD CONSTRAINT releases_artwork_asset_id_fkey
    FOREIGN KEY (artwork_asset_id)
    REFERENCES public.assets (id)
    ON DELETE SET NULL;
ALTER TABLE public.releases ADD CONSTRAINT releases_owner_user_id_fkey
    FOREIGN KEY (owner_user_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;
ALTER TABLE public.releases ADD CONSTRAINT releases_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.profiles (id);

ALTER TABLE public.releases ADD CONSTRAINT releases_status_check
    CHECK ((status = ANY (ARRAY['draft'::text, 'in-progress'::text, 'ready'::text, 'released'::text])));
ALTER TABLE public.releases ADD CONSTRAINT releases_type_check
    CHECK ((type = ANY (ARRAY['single'::text, 'ep'::text, 'album'::text])));

CREATE INDEX releases_owner_status_date_idx ON public.releases USING btree (owner_user_id, status, release_date);
CREATE INDEX releases_owner_updated_idx ON public.releases USING btree (owner_user_id, updated_at DESC);

ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage releases"
    ON public.releases
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can CRUD own releases"
    ON public.releases
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (auth.uid() = user_id);


-- =============================================================================
-- TABLE: tasks
-- =============================================================================

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    group_id uuid,
    release_id uuid,
    created_by uuid NOT NULL,
    assigned_to uuid,
    title text NOT NULL,
    description text,
    status task_status DEFAULT 'todo'::task_status NOT NULL,
    priority task_priority DEFAULT 'none'::task_priority NOT NULL,
    due_date timestamptz,
    completed_at timestamptz,
    position integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    state text DEFAULT 'planning'::text NOT NULL,
    requirement jsonb,
    dependencies uuid[] DEFAULT '{}'::uuid[],
    auto_generated boolean DEFAULT false,
    assigned_collaborator_id uuid,
    assigned_to_user_id uuid,
    CONSTRAINT tasks_pkey PRIMARY KEY (id)
);

ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_collaborator_id_fkey
    FOREIGN KEY (assigned_collaborator_id)
    REFERENCES public.collaborators (id)
    ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey
    FOREIGN KEY (assigned_to)
    REFERENCES public.workspace_members (id)
    ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_user_id_fkey
    FOREIGN KEY (assigned_to_user_id)
    REFERENCES auth.users (id)
    ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_group_id_fkey
    FOREIGN KEY (group_id)
    REFERENCES public.task_groups (id)
    ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_release_id_fkey
    FOREIGN KEY (release_id)
    REFERENCES public.releases (id)
    ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces (id)
    ON DELETE CASCADE;

CREATE INDEX tasks_assigned_collaborator_idx ON public.tasks USING btree (assigned_collaborator_id, status);
CREATE INDEX tasks_assigned_to_idx ON public.tasks USING btree (assigned_to, due_date);
CREATE INDEX tasks_assigned_to_user_id_idx ON public.tasks USING btree (assigned_to_user_id);
CREATE INDEX tasks_release_due_date_idx ON public.tasks USING btree (release_id, due_date) WHERE (due_date IS NOT NULL);
CREATE INDEX tasks_release_group_idx ON public.tasks USING btree (release_id, group_id, "position");
CREATE INDEX tasks_release_status_position_idx ON public.tasks USING btree (release_id, status, "position");
CREATE INDEX tasks_workspace_idx ON public.tasks USING btree (workspace_id, updated_at DESC);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage release tasks"
    ON public.tasks
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (EXISTS ( SELECT 1
   FROM releases
  WHERE ((releases.id = tasks.release_id) AND (releases.owner_user_id = auth.uid()))))
    WITH CHECK (EXISTS ( SELECT 1
   FROM releases
  WHERE ((releases.id = tasks.release_id) AND (releases.owner_user_id = auth.uid()))));


-- =============================================================================
-- TABLE: workspaces
-- =============================================================================

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT workspaces_pkey PRIMARY KEY (id)
);

ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_owner_id_fkey
    FOREIGN KEY (owner_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX workspaces_owner_id_unique_idx ON public.workspaces USING btree (owner_id);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- TABLE: workspace_members
-- =============================================================================

CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    email text NOT NULL,
    role workspace_member_role DEFAULT 'member'::workspace_member_role NOT NULL,
    status workspace_member_status DEFAULT 'invited'::workspace_member_status NOT NULL,
    invited_at timestamptz DEFAULT now() NOT NULL,
    joined_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT workspace_members_pkey PRIMARY KEY (id)
);

ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users (id)
    ON DELETE SET NULL;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces (id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX workspace_members_workspace_email_unique_idx ON public.workspace_members USING btree (workspace_id, email);
CREATE UNIQUE INDEX workspace_members_workspace_user_unique_idx ON public.workspace_members USING btree (workspace_id, user_id) WHERE (user_id IS NOT NULL);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- TABLE: task_groups
-- =============================================================================

CREATE TABLE public.task_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    release_id uuid,
    name text NOT NULL,
    position integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT task_groups_pkey PRIMARY KEY (id)
);

ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_release_id_fkey
    FOREIGN KEY (release_id)
    REFERENCES public.releases (id)
    ON DELETE CASCADE;
ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces (id)
    ON DELETE CASCADE;

CREATE INDEX task_groups_workspace_release_idx ON public.task_groups USING btree (workspace_id, release_id, "position");

ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- TABLE: collaborators
-- =============================================================================

CREATE TABLE public.collaborators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    stage_name text,
    email text,
    phone text,
    default_role text,
    claimed_user_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    owner_user_id uuid,
    notes text,
    CONSTRAINT collaborators_pkey PRIMARY KEY (id)
);

ALTER TABLE public.collaborators ADD CONSTRAINT collaborators_claimed_user_id_fkey
    FOREIGN KEY (claimed_user_id)
    REFERENCES auth.users (id)
    ON DELETE SET NULL;
ALTER TABLE public.collaborators ADD CONSTRAINT collaborators_owner_user_id_fkey
    FOREIGN KEY (owner_user_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;

CREATE INDEX collaborators_email_idx ON public.collaborators USING btree (email);
CREATE UNIQUE INDEX collaborators_owner_email_unique_idx ON public.collaborators USING btree (owner_user_id, lower(email)) WHERE (email IS NOT NULL);
CREATE INDEX collaborators_owner_name_idx ON public.collaborators USING btree (owner_user_id, full_name);
CREATE INDEX collaborators_phone_idx ON public.collaborators USING btree (phone);

ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage collaborators"
    ON public.collaborators
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());


-- =============================================================================
-- TABLE: profiles
-- =============================================================================

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_subscribed boolean DEFAULT false,
    artist_name text,
    industry_role text,
    onboarding_intent text,
    onboarding_completed_at timestamptz,
    onboarding_task_id uuid,
    CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id)
    REFERENCES auth.users (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_onboarding_task_id_fkey
    FOREIGN KEY (onboarding_task_id)
    REFERENCES public.tasks (id)
    ON DELETE SET NULL;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK ((role = ANY (ARRAY['artist'::text, 'manager'::text, 'artist-manager'::text])));

CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
    ON public.profiles
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (auth.uid() = id);


-- =============================================================================
-- TABLE: assets
-- =============================================================================

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    release_id uuid,
    task_id uuid,
    uploaded_by uuid NOT NULL,
    category asset_category DEFAULT 'other'::asset_category NOT NULL,
    file_name text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    mime_type text,
    storage_bucket text DEFAULT 'release-assets'::text NOT NULL,
    storage_path text NOT NULL,
    public_url text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT assets_pkey PRIMARY KEY (id)
);

ALTER TABLE public.assets ADD CONSTRAINT assets_owner_user_id_fkey
    FOREIGN KEY (owner_user_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;
ALTER TABLE public.assets ADD CONSTRAINT assets_release_id_fkey
    FOREIGN KEY (release_id)
    REFERENCES public.releases (id)
    ON DELETE CASCADE;
ALTER TABLE public.assets ADD CONSTRAINT assets_task_id_fkey
    FOREIGN KEY (task_id)
    REFERENCES public.tasks (id)
    ON DELETE SET NULL;
ALTER TABLE public.assets ADD CONSTRAINT assets_uploaded_by_fkey
    FOREIGN KEY (uploaded_by)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;

ALTER TABLE public.assets ADD CONSTRAINT assets_scope_check
    CHECK (((release_id IS NOT NULL) OR (task_id IS NOT NULL)));

CREATE UNIQUE INDEX assets_bucket_path_unique_idx ON public.assets USING btree (storage_bucket, storage_path);
CREATE INDEX assets_release_category_idx ON public.assets USING btree (release_id, category, created_at DESC);
CREATE INDEX assets_task_idx ON public.assets USING btree (task_id, created_at DESC) WHERE (task_id IS NOT NULL);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage assets"
    ON public.assets
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());


-- =============================================================================
-- TABLE: release_metadata
-- =============================================================================

CREATE TABLE public.release_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    isrc text,
    upc text,
    primary_artist_name text DEFAULT ''::text NOT NULL,
    release_title text DEFAULT ''::text NOT NULL,
    genre text,
    subgenre text,
    label_name text,
    language text,
    explicit boolean,
    artwork_url text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT release_metadata_pkey PRIMARY KEY (id)
);

ALTER TABLE public.release_metadata ADD CONSTRAINT release_metadata_release_id_fkey
    FOREIGN KEY (release_id)
    REFERENCES public.releases (id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX release_metadata_release_id_key ON public.release_metadata USING btree (release_id);

ALTER TABLE public.release_metadata ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- TABLE: release_events
-- =============================================================================

CREATE TABLE public.release_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT release_events_pkey PRIMARY KEY (id)
);

ALTER TABLE public.release_events ADD CONSTRAINT release_events_release_id_fkey
    FOREIGN KEY (release_id)
    REFERENCES public.releases (id)
    ON DELETE CASCADE;

CREATE INDEX release_events_release_idx ON public.release_events USING btree (release_id, created_at DESC);

ALTER TABLE public.release_events ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- TABLE: release_playbook_steps
-- =============================================================================

CREATE TABLE public.release_playbook_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    user_id uuid NOT NULL,
    phase_key text NOT NULL,
    template_key text,
    title text NOT NULL,
    description text,
    is_completed boolean DEFAULT false NOT NULL,
    completed_at timestamptz,
    is_custom boolean DEFAULT false NOT NULL,
    position integer DEFAULT 1 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT release_playbook_steps_pkey PRIMARY KEY (id)
);

ALTER TABLE public.release_playbook_steps ADD CONSTRAINT release_playbook_steps_release_id_fkey
    FOREIGN KEY (release_id)
    REFERENCES public.releases (id)
    ON DELETE CASCADE;
ALTER TABLE public.release_playbook_steps ADD CONSTRAINT release_playbook_steps_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;

CREATE INDEX release_playbook_steps_release_id_idx ON public.release_playbook_steps USING btree (release_id);
CREATE INDEX release_playbook_steps_release_phase_position_idx ON public.release_playbook_steps USING btree (release_id, phase_key, "position", created_at);
CREATE UNIQUE INDEX release_playbook_steps_release_template_idx ON public.release_playbook_steps USING btree (release_id, template_key) WHERE (template_key IS NOT NULL);
CREATE INDEX release_playbook_steps_user_id_idx ON public.release_playbook_steps USING btree (user_id, created_at DESC);

ALTER TABLE public.release_playbook_steps ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- TABLE: release_collaborators
-- =============================================================================

CREATE TABLE public.release_collaborators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    collaborator_id uuid,
    invite_name text DEFAULT ''::text NOT NULL,
    invite_contact text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'other'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    submission_token text NOT NULL,
    submission_sent_at timestamptz,
    submitted_at timestamptz,
    last_reminded_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT release_collaborators_pkey PRIMARY KEY (id)
);

ALTER TABLE public.release_collaborators ADD CONSTRAINT release_collaborators_collaborator_id_fkey
    FOREIGN KEY (collaborator_id)
    REFERENCES public.collaborators (id)
    ON DELETE SET NULL;
ALTER TABLE public.release_collaborators ADD CONSTRAINT release_collaborators_release_id_fkey
    FOREIGN KEY (release_id)
    REFERENCES public.releases (id)
    ON DELETE CASCADE;

CREATE INDEX release_collaborators_collaborator_idx ON public.release_collaborators USING btree (collaborator_id);
CREATE INDEX release_collaborators_release_idx ON public.release_collaborators USING btree (release_id, status, created_at);
CREATE UNIQUE INDEX release_collaborators_submission_token_key ON public.release_collaborators USING btree (submission_token);

ALTER TABLE public.release_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage release collaborators"
    ON public.release_collaborators
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (EXISTS ( SELECT 1
   FROM releases
  WHERE ((releases.id = release_collaborators.release_id) AND (releases.owner_user_id = auth.uid()))))
    WITH CHECK (EXISTS ( SELECT 1
   FROM releases
  WHERE ((releases.id = release_collaborators.release_id) AND (releases.owner_user_id = auth.uid()))));


-- =============================================================================
-- TABLE: activity_logs
-- =============================================================================

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    actor_user_id uuid,
    release_id uuid,
    task_id uuid,
    collaborator_id uuid,
    asset_id uuid,
    entity_type activity_entity_type NOT NULL,
    action text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT activity_logs_pkey PRIMARY KEY (id)
);

ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_actor_user_id_fkey
    FOREIGN KEY (actor_user_id)
    REFERENCES auth.users (id)
    ON DELETE SET NULL;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_asset_id_fkey
    FOREIGN KEY (asset_id)
    REFERENCES public.assets (id)
    ON DELETE SET NULL;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_collaborator_id_fkey
    FOREIGN KEY (collaborator_id)
    REFERENCES public.collaborators (id)
    ON DELETE SET NULL;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_owner_user_id_fkey
    FOREIGN KEY (owner_user_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_release_id_fkey
    FOREIGN KEY (release_id)
    REFERENCES public.releases (id)
    ON DELETE CASCADE;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_task_id_fkey
    FOREIGN KEY (task_id)
    REFERENCES public.tasks (id)
    ON DELETE CASCADE;

CREATE INDEX activity_logs_owner_created_idx ON public.activity_logs USING btree (owner_user_id, created_at DESC);
CREATE INDEX activity_logs_release_created_idx ON public.activity_logs USING btree (release_id, created_at DESC) WHERE (release_id IS NOT NULL);
CREATE INDEX activity_logs_task_created_idx ON public.activity_logs USING btree (task_id, created_at DESC) WHERE (task_id IS NOT NULL);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read activity logs"
    ON public.activity_logs
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (owner_user_id = auth.uid());


-- =============================================================================
-- TABLE: subscriptions
-- =============================================================================

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    plan text NOT NULL,
    status text DEFAULT 'active'::text,
    amount integer NOT NULL,
    paystack_reference text,
    paystack_customer_code text,
    started_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT subscriptions_pkey PRIMARY KEY (id)
);

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.profiles (id)
    ON DELETE CASCADE;

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check
    CHECK ((plan = ANY (ARRAY['monthly'::text, 'yearly'::text])));
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'cancelled'::text, 'expired'::text])));

CREATE UNIQUE INDEX subscriptions_user_id_key ON public.subscriptions USING btree (user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage subscriptions"
    ON public.subscriptions
    AS PERMISSIVE
    FOR ALL
    TO public
    USING true;

CREATE POLICY "Users can view own subscription"
    ON public.subscriptions
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (auth.uid() = user_id);


-- =============================================================================
-- TABLE: payments
-- =============================================================================

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    subscription_id uuid,
    amount integer NOT NULL,
    currency text DEFAULT 'NGN'::text,
    reference text NOT NULL,
    status text DEFAULT 'pending'::text,
    plan text,
    paystack_response jsonb,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT payments_pkey PRIMARY KEY (id)
);

ALTER TABLE public.payments ADD CONSTRAINT payments_subscription_id_fkey
    FOREIGN KEY (subscription_id)
    REFERENCES public.subscriptions (id)
    ON DELETE SET NULL;
ALTER TABLE public.payments ADD CONSTRAINT payments_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.profiles (id)
    ON DELETE CASCADE;

ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
    CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text])));

CREATE UNIQUE INDEX payments_reference_key ON public.payments USING btree (reference);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage payments"
    ON public.payments
    AS PERMISSIVE
    FOR ALL
    TO public
    USING true;

CREATE POLICY "Users can view own payments"
    ON public.payments
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (auth.uid() = user_id);

