export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ReleaseType = 'single' | 'ep' | 'album';
export type ReleaseStatus = 'draft' | 'planning' | 'in_progress' | 'ready' | 'released' | 'archived';
export type TaskStatus = 'locked' | 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type CollaboratorRole =
  | 'artist'
  | 'manager'
  | 'producer'
  | 'writer'
  | 'engineer'
  | 'designer'
  | 'publicist'
  | 'distributor'
  | 'other';
export type CollaboratorStatus = 'invited' | 'active' | 'pending' | 'removed';
export type AssetCategory =
  | 'audio'
  | 'stems'
  | 'cover_art'
  | 'promo_image'
  | 'video'
  | 'document'
  | 'contract'
  | 'other';
export type ActivityEntityType = 'release' | 'task' | 'collaborator' | 'asset';

export type ReleaseRow = {
  id: string;
  owner_user_id: string;
  title: string;
  artist_name: string;
  release_type: ReleaseType;
  status: ReleaseStatus;
  release_date: string | null;
  description: string | null;
  artwork_asset_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ReleaseInsert = {
  id?: string;
  owner_user_id: string;
  title: string;
  artist_name?: string;
  release_type?: ReleaseType;
  status?: ReleaseStatus;
  release_date?: string | null;
  description?: string | null;
  artwork_asset_id?: string | null;
  metadata?: Json;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
};

export type ReleaseUpdate = Partial<Omit<ReleaseInsert, 'id' | 'owner_user_id'>>;

export type CollaboratorRow = {
  id: string;
  owner_user_id: string;
  full_name: string;
  stage_name: string | null;
  email: string | null;
  phone: string | null;
  default_role: CollaboratorRole;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CollaboratorInsert = {
  id?: string;
  owner_user_id: string;
  full_name: string;
  stage_name?: string | null;
  email?: string | null;
  phone?: string | null;
  default_role?: CollaboratorRole;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CollaboratorUpdate = Partial<Omit<CollaboratorInsert, 'id' | 'owner_user_id'>>;

export type ReleaseCollaboratorRow = {
  id: string;
  release_id: string;
  collaborator_id: string;
  role: CollaboratorRole;
  created_at: string;
  updated_at: string;
};

export type ReleaseCollaboratorInsert = {
  id?: string;
  release_id: string;
  collaborator_id: string;
  role?: CollaboratorRole;
  created_at?: string;
  updated_at?: string;
};

export type ReleaseCollaboratorUpdate = Partial<Omit<ReleaseCollaboratorInsert, 'id' | 'release_id' | 'collaborator_id'>>;

export type TaskRow = {
  id: string;
  workspace_id: string;
  release_id: string | null;
  group_id: string | null;
  created_by: string;
  assigned_to_user_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  position: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type TaskInsert = {
  id?: string;
  workspace_id: string;
  release_id?: string | null;
  group_id?: string | null;
  created_by: string;
  assigned_to_user_id?: string | null;
  assigned_to?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  completed_at?: string | null;
  position?: number;
  metadata?: Json;
  created_at?: string;
  updated_at?: string;
};

export type TaskUpdate = Partial<Omit<TaskInsert, 'id' | 'release_id' | 'created_by'>>;

export type AssetRow = {
  id: string;
  owner_user_id: string;
  release_id: string | null;
  task_id: string | null;
  uploaded_by: string;
  category: AssetCategory;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type AssetInsert = {
  id?: string;
  owner_user_id: string;
  release_id?: string | null;
  task_id?: string | null;
  uploaded_by: string;
  category?: AssetCategory;
  file_name: string;
  file_size?: number;
  mime_type?: string | null;
  storage_bucket?: string;
  storage_path: string;
  public_url?: string | null;
  metadata?: Json;
  created_at?: string;
  updated_at?: string;
};

export type AssetUpdate = Partial<Omit<AssetInsert, 'id' | 'owner_user_id' | 'uploaded_by'>>;

export type ActivityLogRow = {
  id: string;
  owner_user_id: string;
  actor_user_id: string | null;
  release_id: string | null;
  task_id: string | null;
  collaborator_id: string | null;
  asset_id: string | null;
  entity_type: ActivityEntityType;
  action: string;
  message: string;
  metadata: Json;
  created_at: string;
};

export type ActivityLogInsert = {
  id?: string;
  owner_user_id: string;
  actor_user_id?: string | null;
  release_id?: string | null;
  task_id?: string | null;
  collaborator_id?: string | null;
  asset_id?: string | null;
  entity_type: ActivityEntityType;
  action: string;
  message: string;
  metadata?: Json;
  created_at?: string;
};

export type ActivityLogUpdate = never;

export type Database = {
  public: {
    Tables: {
      releases: {
        Row: ReleaseRow;
        Insert: ReleaseInsert;
        Update: ReleaseUpdate;
      };
      collaborators: {
        Row: CollaboratorRow;
        Insert: CollaboratorInsert;
        Update: CollaboratorUpdate;
      };
      release_collaborators: {
        Row: ReleaseCollaboratorRow;
        Insert: ReleaseCollaboratorInsert;
        Update: ReleaseCollaboratorUpdate;
      };
      tasks: {
        Row: TaskRow;
        Insert: TaskInsert;
        Update: TaskUpdate;
      };
      assets: {
        Row: AssetRow;
        Insert: AssetInsert;
        Update: AssetUpdate;
      };
      activity_logs: {
        Row: ActivityLogRow;
        Insert: ActivityLogInsert;
        Update: ActivityLogUpdate;
      };
    };
    Enums: {
      release_type: ReleaseType;
      release_status: ReleaseStatus;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      collaborator_role: CollaboratorRole;
      collaborator_status: CollaboratorStatus;
      asset_category: AssetCategory;
      activity_entity_type: ActivityEntityType;
    };
  };
};
