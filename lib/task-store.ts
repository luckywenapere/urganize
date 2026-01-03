import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TaskState, Task, TaskPhase } from '@/types';

// Pre-defined task templates for single releases
export const DEFAULT_TASKS = [
  // Pre-production
  { title: 'Finalize song concept', phase: 'pre-production' as TaskPhase, order: 1 },
  { title: 'Book studio session', phase: 'pre-production' as TaskPhase, order: 2 },
  { title: 'Record vocals', phase: 'pre-production' as TaskPhase, order: 3 },
  { title: 'Upload final master', phase: 'pre-production' as TaskPhase, order: 4 },
  
  // Production
  { title: 'Mix and master', phase: 'production' as TaskPhase, order: 5 },
  { title: 'Get mastered file approved', phase: 'production' as TaskPhase, order: 6 },
  { title: 'Create artwork brief', phase: 'production' as TaskPhase, order: 7 },
  { title: 'Finalize cover artwork', phase: 'production' as TaskPhase, order: 8 },
  
  // Promotion
  { title: 'Create content calendar', phase: 'promotion' as TaskPhase, order: 9 },
  { title: 'Schedule photo shoot', phase: 'promotion' as TaskPhase, order: 10 },
  { title: 'Book music video shoot', phase: 'promotion' as TaskPhase, order: 11 },
  { title: 'Create social media assets', phase: 'promotion' as TaskPhase, order: 12 },
  { title: 'Schedule announcement post', phase: 'promotion' as TaskPhase, order: 13 },
  { title: 'Submit to playlists', phase: 'promotion' as TaskPhase, order: 14 },
  
  // Distribution
  { title: 'Upload to distributor', phase: 'distribution' as TaskPhase, order: 15 },
  { title: 'Verify release on platforms', phase: 'distribution' as TaskPhase, order: 16 },
];

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (taskData) => {
        const newTask: Task = {
          ...taskData,
          id: Date.now().toString() + Math.random(),
          status: 'pending',
          createdAt: new Date(),
        };

        set((state) => ({
          tasks: [...state.tasks, newTask],
        }));
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updates } : task
          ),
        }));
      },

      deleteTask: (id) => {
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
        }));
      },

      toggleTaskStatus: (id) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  status: task.status === 'completed' ? 'pending' : 'completed',
                  completedAt: task.status === 'completed' ? undefined : new Date(),
                }
              : task
          ),
        }));
      },

      getTasksByRelease: (releaseId) => {
        return get().tasks.filter((task) => task.releaseId === releaseId);
      },

      getTasksByPhase: (releaseId, phase) => {
        return get()
          .tasks.filter((task) => task.releaseId === releaseId && task.phase === phase)
          .sort((a, b) => a.order - b.order);
      },
    }),
    {
      name: 'task-storage',
    }
  )
);

// Helper function to generate default tasks for a new release
export const generateDefaultTasks = (releaseId: string, userId: string) => {
  return DEFAULT_TASKS.map((template, index) => ({
    releaseId,
    title: template.title,
    phase: template.phase,
    status: 'pending' as const,
    order: template.order,
    isSystemGenerated: true,
    id: `${releaseId}-task-${index}`,
    createdAt: new Date(),
  }));
};
