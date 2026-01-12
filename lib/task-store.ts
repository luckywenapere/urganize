import { create } from 'zustand';
import { supabase, type DbTask } from './supabase/client';
import type { Task, TaskPhase, TaskStatus } from '@/types';

interface TaskState {
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

// Helper to convert DB format to app format
function dbToTask(db: DbTask): Task {
  return {
    id: db.id,
    releaseId: db.release_id,
    userId: db.user_id,
    title: db.title,
    description: db.description,
    phase: db.phase,
    status: db.status,
    dueDate: db.due_date ? new Date(db.due_date) : undefined,
    isSystemGenerated: db.is_system_generated,
    order: db.order ?? 0,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

// Helper to convert app format to DB format
function taskToDb(task: Partial<Task> & { userId?: string; releaseId?: string }): any {
  const db: any = {};
  
  if (task.userId) db.user_id = task.userId;
  if (task.releaseId) db.release_id = task.releaseId;
  if (task.title) db.title = task.title;
  if (task.description !== undefined) db.description = task.description;
  if (task.phase) db.phase = task.phase;
  if (task.status) db.status = task.status;
  if (task.dueDate !== undefined) {
    db.due_date = task.dueDate instanceof Date 
      ? task.dueDate.toISOString().split('T')[0]
      : task.dueDate;
  }
  if (task.isSystemGenerated !== undefined) db.is_system_generated = task.isSystemGenerated;
  if (task.order !== undefined) db.order = task.order;  
  
  return db;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoading: false,

  fetchTasks: async () => {
    set({ isLoading: true });
    
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch tasks:', error);
      set({ isLoading: false });
      return;
    }

    const tasks = (data || []).map(dbToTask);
    set({ tasks, isLoading: false });
  },

  fetchTasksByRelease: async (releaseId: string) => {
    set({ isLoading: true });
    
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('release_id', releaseId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch tasks for release:', error);
      set({ isLoading: false });
      return;
    }

    const releaseTasks = (data || []).map(dbToTask);
    
    // Update only tasks for this release
    set((state) => ({
      tasks: [
        ...state.tasks.filter(t => t.releaseId !== releaseId),
        ...releaseTasks
      ],
      isLoading: false,
    }));
  },

  addTask: async (task) => {
    const dbTask = taskToDb(task);
    
    const { data, error } = await supabase
      .from('tasks')
      .insert([dbTask])
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('No data returned from insert');

    const newTask = dbToTask(data);
    
    set((state) => ({
      tasks: [...state.tasks, newTask],
    }));

    return newTask.id;
  },

  updateTask: async (id, updates) => {
    const dbUpdates = taskToDb(updates);
    dbUpdates.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t
      ),
    }));
  },

  deleteTask: async (id) => {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
  },

  toggleTaskStatus: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;

    const newStatus: TaskStatus = task.status === 'pending' ? 'completed' : 'pending';
    await get().updateTask(id, { status: newStatus });
  },

  getTasksByRelease: (releaseId) => {
    return get().tasks.filter((t) => t.releaseId === releaseId);
  },

  getTasksByPhase: (releaseId, phase) => {
    return get().tasks.filter(
      (t) => t.releaseId === releaseId && t.phase === phase
    );
  },
}));

// Helper function to generate default tasks when creating a release
export function generateDefaultTasks(
  releaseId: string,
  userId: string
): Omit<Task, 'id' | 'createdAt' | 'updatedAt'>[] {
  const tasks = [
    // Pre-Production
    { title: 'Define release concept and vision', phase: 'pre-production' as TaskPhase },
    { title: 'Create project timeline', phase: 'pre-production' as TaskPhase },
    { title: 'Confirm credits and splits', phase: 'pre-production' as TaskPhase },
    
    // Production
    { title: 'Complete final mix', phase: 'production' as TaskPhase },
    { title: 'Master audio', phase: 'production' as TaskPhase },
    { title: 'Create album artwork', phase: 'production' as TaskPhase },
    { title: 'Get ISRC codes', phase: 'production' as TaskPhase },
    
    // Promotion
    { title: 'Plan content calendar', phase: 'promotion' as TaskPhase },
    { title: 'Create announcement post', phase: 'promotion' as TaskPhase },
    { title: 'Shoot promotional content', phase: 'promotion' as TaskPhase },
    { title: 'Prepare press kit', phase: 'promotion' as TaskPhase },
    { title: 'Submit to playlists', phase: 'promotion' as TaskPhase },
    
    // Distribution
    { title: 'Upload to distributor', phase: 'distribution' as TaskPhase },
    { title: 'Verify metadata', phase: 'distribution' as TaskPhase },
    { title: 'Set up pre-save campaign', phase: 'distribution' as TaskPhase },
    { title: 'Monitor release day', phase: 'distribution' as TaskPhase },
  ];

  return tasks.map((t, index) => ({  
  releaseId,
  userId,
  title: t.title,
  phase: t.phase,
  status: 'pending' as TaskStatus,
  isSystemGenerated: true,
  order: index,
}));
}