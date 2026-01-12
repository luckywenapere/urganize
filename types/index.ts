export type UserRole = 'artist-manager' | 'artist';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  hasManager?: boolean;
  managerId?: string;
  createdAt: Date;
}

export type ReleaseType = 'single' | 'ep' | 'album';

export type ReleaseStatus = 'draft' | 'in-progress' | 'ready' | 'released';

export interface Release {
  id: string;
  title: string;
  artistName: string;
  type: ReleaseType;
  status: ReleaseStatus;
  releaseDate?: Date;
  coverArt?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskPhase = 'pre-production' | 'production' | 'promotion' | 'distribution';

export type TaskStatus = 'pending' | 'in-progress' | 'completed';

export interface Task {
  id: string;
  releaseId: string;
  userId: string;
  title: string;
  description?: string;
  phase: TaskPhase;
  status: TaskStatus;
  dueDate?: Date;
  assignedTo?: string;
  isSystemGenerated: boolean;
  order: number;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
}

export type FileCategory = 'audio' | 'stems' | 'artwork' | 'licenses' | 'contracts';

export interface ReleaseFile {
  id: string;
  releaseId: string;
  name: string;
  category: FileCategory;
  size: number;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface Budget {
  id: string;
  releaseId: string;
  category: string;
  planned: number;
  spent: number;
}

export interface Person {
  id: string;
  releaseId: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  notes?: string;
  lastInteraction?: Date;
}

export interface Milestone {
  id: string;
  releaseId: string;
  title: string;
  date: Date;
  completed: boolean;
}

// Store types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role: UserRole) => Promise<void>;
  logout: () => void;
}

export interface ReleaseState {
  releases: Release[];
  currentRelease: Release | null;
  addRelease: (release: Omit<Release, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateRelease: (id: string, updates: Partial<Release>) => void;
  deleteRelease: (id: string) => void;
  setCurrentRelease: (id: string) => void;
}

export interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  fetchTasks: () => Promise<void>;
  fetchTasksByRelease: (releaseId: string) => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>; 
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;  
  deleteTask: (id: string) => Promise<void>; 
  toggleTaskStatus: (id: string) => Promise<void>;  
  getTasksByRelease: (releaseId: string) => Task[];
  getTasksByPhase: (releaseId: string, phase: TaskPhase) => Task[];
}

export interface FileState {
  files: ReleaseFile[];
  addFile: (file: Omit<ReleaseFile, 'id' | 'uploadedAt'>) => void;
  deleteFile: (id: string) => void;
  getFilesByRelease: (releaseId: string) => ReleaseFile[];
  getFilesByCategory: (releaseId: string, category: FileCategory) => ReleaseFile[];
}
