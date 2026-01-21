// lib/ai-task-store.ts
import { create } from 'zustand';
import { supabase } from './supabase/client';
import type { 
  AITask, 
  GeneratedTask, 
  TaskStatus, 
  TaskPhase, 
  CompletedTaskSummary,
  ReleaseProfile,
  ArtistProfile,
} from '@/types';
import {
  generateInitialStrategy,
  generateNextTasks,
  generateTaskVariant,
  getFallbackTask,
  getFallbackInitialStrategy,
} from './gemini';

// =============================================
// DATABASE MAPPERS
// =============================================

function dbToAITask(db: any): AITask {
  return {
    id: db.id,
    releaseId: db.release_id,
    userId: db.user_id,
    title: db.title,
    description: db.description,
    whyItMatters: db.why_it_matters,
    platform: db.platform,
    estimatedTime: db.estimated_time,
    inputType: db.input_type,
    inputOptions: db.input_options,
    inputPlaceholder: db.input_placeholder,
    inputLabel: db.input_label,
    userInput: db.user_input,
    userInputFileUrl: db.user_input_file_url,
    userInputData: db.user_input_data,
    status: db.status,
    phase: db.phase,
    orderIndex: db.order_index,
    variantCount: db.variant_count || 0,
    maxVariants: db.max_variants || 3,
    isVariant: db.is_variant || false,
    originalTaskId: db.original_task_id,
    startedAt: db.started_at ? new Date(db.started_at) : undefined,
    completedAt: db.completed_at ? new Date(db.completed_at) : undefined,
    skippedAt: db.skipped_at ? new Date(db.skipped_at) : undefined,
    skippedReason: db.skipped_reason,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

// =============================================
// HELPER FUNCTIONS
// =============================================

function determineCurrentPhase(tasks: AITask[]): TaskPhase {
  const currentTask = tasks.find(t => t.status === 'current');
  if (currentTask) return currentTask.phase;
  
  const pendingTask = tasks.find(t => t.status === 'pending');
  if (pendingTask) return pendingTask.phase;
  
  return 'pre-production';
}

async function saveTasksToDb(
  tasks: GeneratedTask[],
  releaseId: string,
  userId: string,
  startingIndex: number
): Promise<AITask[]> {
  const dbTasks = tasks.map((task, index) => ({
    release_id: releaseId,
    user_id: userId,
    title: task.title,
    description: task.description,
    why_it_matters: task.whyItMatters,
    platform: task.platform,
    estimated_time: task.estimatedTime,
    input_type: task.inputType,
    input_options: task.inputOptions,
    input_placeholder: task.inputPlaceholder,
    input_label: task.inputLabel,
    status: index === 0 && startingIndex === 0 ? 'current' : 'pending',
    phase: task.phase,
    order_index: startingIndex + index,
  }));

  const { data, error } = await supabase
    .from('ai_tasks')
    .insert(dbTasks)
    .select();

  if (error) throw error;
  if (!data) throw new Error('No tasks returned from insert');

  return data.map(dbToAITask);
}

async function saveBatchRecord(
  releaseId: string,
  batchNumber: number,
  batchType: 'initial' | 'continuation' | 'variant',
  tasksGenerated: number,
  contextSummary: string
): Promise<void> {
  await supabase.from('task_batches').insert({
    release_id: releaseId,
    batch_number: batchNumber,
    batch_type: batchType,
    tasks_generated: tasksGenerated,
    context_summary: contextSummary,
    was_successful: true,
  });
}

// =============================================
// STORE TYPES
// =============================================

interface AITaskState {
  // Current task data
  currentTask: AITask | null;
  tasks: AITask[];
  skippedTasks: AITask[];
  
  // Loading states
  isLoading: boolean;
  isGenerating: boolean;
  isCompletingTask: boolean;
  
  // Progress tracking
  totalTasksEstimate: number;
  completedCount: number;
  skippedCount: number;
  currentPhase: TaskPhase;
  
  // Error handling
  error: string | null;
  
  // Actions - Task Generation
  generateInitialTasks: (
    artistProfile: ArtistProfile,
    releaseProfile: ReleaseProfile,
    releaseId: string,
    releaseTitle: string,
    releaseType: string,
    userId: string
  ) => Promise<void>;
  
  generateMoreTasks: (
    artistProfile: ArtistProfile,
    releaseProfile: ReleaseProfile,
    releaseId: string,
    userId: string
  ) => Promise<void>;
  
  // Actions - Task Management
  fetchTasksForRelease: (releaseId: string) => Promise<void>;
  completeTask: (taskId: string, userInput: string, inputData?: any) => Promise<void>;
  skipTask: (taskId: string, reason?: string) => Promise<void>;
  goBackToPreviousTask: () => Promise<void>;
  requestVariant: (taskId: string, artistProfile: ArtistProfile, releaseProfile: ReleaseProfile) => Promise<void>;
  completeSkippedTask: (taskId: string, userInput: string) => Promise<void>;
  
  // Actions - Utilities
  getCurrentTask: (releaseId: string) => AITask | null;
  getCompletedTasksSummary: () => CompletedTaskSummary[];
  clearError: () => void;
  reset: () => void;
}

// =============================================
// STORE IMPLEMENTATION
// =============================================

export const useAITaskStore = create<AITaskState>((set, get) => ({
  currentTask: null,
  tasks: [],
  skippedTasks: [],
  isLoading: false,
  isGenerating: false,
  isCompletingTask: false,
  totalTasksEstimate: 0,
  completedCount: 0,
  skippedCount: 0,
  currentPhase: 'pre-production',
  error: null,

  // Generate initial strategy and first batch of tasks
  generateInitialTasks: async (
    artistProfile,
    releaseProfile,
    releaseId,
    releaseTitle,
    releaseType,
    userId
  ) => {
    set({ isGenerating: true, error: null });

    try {
      // Call Gemini API
      let response;
      try {
        response = await generateInitialStrategy(
          artistProfile,
          releaseProfile,
          releaseTitle,
          releaseType
        );
      } catch (apiError) {
        console.error('Gemini API failed, using fallback:', apiError);
        response = getFallbackInitialStrategy();
      }

      // Save strategy to release profile
      await supabase
        .from('release_profiles')
        .update({
          campaign_narrative: response.campaignNarrative,
          total_tasks_estimate: response.totalTasksEstimate,
          release_strategy: response.phases,
        })
        .eq('release_id', releaseId);

      // Save tasks to database
      const savedTasks = await saveTasksToDb(
        response.tasks,
        releaseId,
        userId,
        0
      );

      // Save batch record
      await saveBatchRecord(
        releaseId,
        1,
        'initial',
        savedTasks.length,
        `Initial strategy generation for "${releaseTitle}"`
      );

      // Update store state
      const currentTask = savedTasks.find(t => t.status === 'current') || savedTasks[0];
      
      set({
        tasks: savedTasks,
        currentTask,
        totalTasksEstimate: response.totalTasksEstimate,
        currentPhase: determineCurrentPhase(savedTasks),
        isGenerating: false,
      });

    } catch (error: any) {
      console.error('Failed to generate initial tasks:', error);
      set({ error: error.message, isGenerating: false });
      throw error;
    }
  },

  // Generate more tasks (continuation)
  generateMoreTasks: async (artistProfile, releaseProfile, releaseId, userId) => {
    const { tasks, getCompletedTasksSummary, totalTasksEstimate, completedCount } = get();
    
    set({ isGenerating: true, error: null });

    try {
      const completedSummary = getCompletedTasksSummary();
      const currentPhase = determineCurrentPhase(tasks);
      const tasksRemaining = totalTasksEstimate - completedCount;

      let response;
      try {
        response = await generateNextTasks(
          artistProfile,
          releaseProfile,
          completedSummary,
          currentPhase,
          tasksRemaining
        );
      } catch (apiError) {
        console.error('Gemini API failed, using fallback:', apiError);
        response = { tasks: [getFallbackTask()] };
      }

      // Get current max order index
      const maxOrder = Math.max(...tasks.map(t => t.orderIndex), -1);

      // Save new tasks
      const savedTasks = await saveTasksToDb(
        response.tasks,
        releaseId,
        userId,
        maxOrder + 1
      );

      // Get batch count
      const { count } = await supabase
        .from('task_batches')
        .select('*', { count: 'exact', head: true })
        .eq('release_id', releaseId);

      // Save batch record
      await saveBatchRecord(
        releaseId,
        (count || 0) + 1,
        'continuation',
        savedTasks.length,
        `Continuation after ${completedCount} tasks completed`
      );

      // Update store
      set({
        tasks: [...tasks, ...savedTasks],
        isGenerating: false,
      });

    } catch (error: any) {
      console.error('Failed to generate more tasks:', error);
      set({ error: error.message, isGenerating: false });
    }
  },

  // Fetch all tasks for a release
  fetchTasksForRelease: async (releaseId) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('ai_tasks')
        .select('*')
        .eq('release_id', releaseId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      const tasks = (data || []).map(dbToAITask);
      const currentTask = tasks.find(t => t.status === 'current') || null;
      const skippedTasks = tasks.filter(t => t.status === 'skipped');
      const completedCount = tasks.filter(t => t.status === 'completed').length;
      const skippedCount = skippedTasks.length;

      set({
        tasks,
        currentTask,
        skippedTasks,
        completedCount,
        skippedCount,
        currentPhase: determineCurrentPhase(tasks),
        isLoading: false,
      });

    } catch (error: any) {
      console.error('Failed to fetch tasks:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  // Complete current task
  completeTask: async (taskId, userInput, inputData) => {
    const { tasks } = get();
    set({ isCompletingTask: true, error: null });

    try {
      // Update task in database
      const { error } = await supabase
        .from('ai_tasks')
        .update({
          status: 'completed',
          user_input: userInput,
          user_input_data: inputData,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      if (error) throw error;

      // Find next pending task
      const currentIndex = tasks.findIndex(t => t.id === taskId);
      const nextTask = tasks.find((t, i) => i > currentIndex && t.status === 'pending');

      if (nextTask) {
        // Mark next task as current
        await supabase
          .from('ai_tasks')
          .update({ status: 'current', started_at: new Date().toISOString() })
          .eq('id', nextTask.id);
      }

      // Update local state
      const updatedTasks = tasks.map(t => {
        if (t.id === taskId) {
          return { ...t, status: 'completed' as TaskStatus, userInput, completedAt: new Date() };
        }
        if (nextTask && t.id === nextTask.id) {
          return { ...t, status: 'current' as TaskStatus, startedAt: new Date() };
        }
        return t;
      });

      set({
        tasks: updatedTasks,
        currentTask: nextTask ? updatedTasks.find(t => t.id === nextTask.id) || null : null,
        completedCount: updatedTasks.filter(t => t.status === 'completed').length,
        currentPhase: determineCurrentPhase(updatedTasks),
        isCompletingTask: false,
      });

    } catch (error: any) {
      console.error('Failed to complete task:', error);
      set({ error: error.message, isCompletingTask: false });
      throw error;
    }
  },

  // Skip current task
  skipTask: async (taskId, reason) => {
    const { tasks, skippedTasks } = get();
    set({ isCompletingTask: true, error: null });

    try {
      // Update task in database
      const { error } = await supabase
        .from('ai_tasks')
        .update({
          status: 'skipped',
          skipped_at: new Date().toISOString(),
          skipped_reason: reason,
        })
        .eq('id', taskId);

      if (error) throw error;

      // Find next pending task
      const currentIndex = tasks.findIndex(t => t.id === taskId);
      const nextTask = tasks.find((t, i) => i > currentIndex && t.status === 'pending');

      if (nextTask) {
        await supabase
          .from('ai_tasks')
          .update({ status: 'current', started_at: new Date().toISOString() })
          .eq('id', nextTask.id);
      }

      // Update local state
      const skippedTask = tasks.find(t => t.id === taskId);
      const updatedTasks = tasks.map(t => {
        if (t.id === taskId) {
          return { ...t, status: 'skipped' as TaskStatus, skippedAt: new Date(), skippedReason: reason };
        }
        if (nextTask && t.id === nextTask.id) {
          return { ...t, status: 'current' as TaskStatus, startedAt: new Date() };
        }
        return t;
      });

      set({
        tasks: updatedTasks,
        currentTask: nextTask ? updatedTasks.find(t => t.id === nextTask.id) || null : null,
        skippedTasks: skippedTask ? [...skippedTasks, { ...skippedTask, status: 'skipped' as TaskStatus }] : skippedTasks,
        skippedCount: updatedTasks.filter(t => t.status === 'skipped').length,
        currentPhase: determineCurrentPhase(updatedTasks),
        isCompletingTask: false,
      });

    } catch (error: any) {
      console.error('Failed to skip task:', error);
      set({ error: error.message, isCompletingTask: false });
      throw error;
    }
  },

  // Go back to previous task
  goBackToPreviousTask: async () => {
    const { tasks, currentTask } = get();
    if (!currentTask) return;

    set({ isLoading: true, error: null });

    try {
      const currentIndex = tasks.findIndex(t => t.id === currentTask.id);
      if (currentIndex <= 0) {
        set({ isLoading: false });
        return;
      }

      const previousTask = tasks[currentIndex - 1];

      // Reset current task to pending
      await supabase
        .from('ai_tasks')
        .update({ status: 'pending', started_at: null })
        .eq('id', currentTask.id);

      // Set previous task as current (reset completion if it was completed)
      await supabase
        .from('ai_tasks')
        .update({
          status: 'current',
          completed_at: null,
          skipped_at: null,
          started_at: new Date().toISOString(),
        })
        .eq('id', previousTask.id);

      // Update local state
      const updatedTasks = tasks.map(t => {
        if (t.id === currentTask.id) {
          return { ...t, status: 'pending' as TaskStatus, startedAt: undefined };
        }
        if (t.id === previousTask.id) {
          return { ...t, status: 'current' as TaskStatus, completedAt: undefined, skippedAt: undefined };
        }
        return t;
      });

      set({
        tasks: updatedTasks,
        currentTask: updatedTasks.find(t => t.id === previousTask.id) || null,
        completedCount: updatedTasks.filter(t => t.status === 'completed').length,
        skippedCount: updatedTasks.filter(t => t.status === 'skipped').length,
        skippedTasks: updatedTasks.filter(t => t.status === 'skipped'),
        isLoading: false,
      });

    } catch (error: any) {
      console.error('Failed to go back:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  // Request task variant
  requestVariant: async (taskId, artistProfile, releaseProfile) => {
    const { tasks } = get();
    const task = tasks.find(t => t.id === taskId);
    
    if (!task || task.variantCount >= task.maxVariants) {
      set({ error: 'No more variants available' });
      return;
    }

    set({ isGenerating: true, error: null });

    try {
      let variantTask;
      try {
        variantTask = await generateTaskVariant(task, artistProfile, releaseProfile);
      } catch (apiError) {
        console.error('Gemini API failed:', apiError);
        set({ error: 'Failed to generate variant. Please try again.', isGenerating: false });
        return;
      }

      // Update current task with variant content
      const { error } = await supabase
        .from('ai_tasks')
        .update({
          title: variantTask.title,
          description: variantTask.description,
          why_it_matters: variantTask.whyItMatters,
          platform: variantTask.platform,
          estimated_time: variantTask.estimatedTime,
          input_type: variantTask.inputType,
          input_placeholder: variantTask.inputPlaceholder,
          input_label: variantTask.inputLabel,
          variant_count: task.variantCount + 1,
          is_variant: true,
        })
        .eq('id', taskId);

      if (error) throw error;

      // Update local state
      const updatedTask: AITask = {
        ...task,
        title: variantTask.title,
        description: variantTask.description,
        whyItMatters: variantTask.whyItMatters,
        platform: variantTask.platform,
        estimatedTime: variantTask.estimatedTime,
        inputType: variantTask.inputType,
        inputPlaceholder: variantTask.inputPlaceholder,
        inputLabel: variantTask.inputLabel,
        variantCount: task.variantCount + 1,
        isVariant: true,
      };

      const updatedTasks = tasks.map(t => t.id === taskId ? updatedTask : t);

      set({
        tasks: updatedTasks,
        currentTask: updatedTask,
        isGenerating: false,
      });

    } catch (error: any) {
      console.error('Failed to generate variant:', error);
      set({ error: error.message, isGenerating: false });
    }
  },

  // Complete a previously skipped task
  completeSkippedTask: async (taskId, userInput) => {
    const { tasks, skippedTasks } = get();
    
    try {
      await supabase
        .from('ai_tasks')
        .update({
          status: 'completed',
          user_input: userInput,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      const updatedTasks = tasks.map(t => 
        t.id === taskId 
          ? { ...t, status: 'completed' as TaskStatus, userInput, completedAt: new Date() }
          : t
      );

      set({
        tasks: updatedTasks,
        skippedTasks: skippedTasks.filter(t => t.id !== taskId),
        completedCount: updatedTasks.filter(t => t.status === 'completed').length,
        skippedCount: updatedTasks.filter(t => t.status === 'skipped').length,
      });

    } catch (error: any) {
      console.error('Failed to complete skipped task:', error);
      set({ error: error.message });
    }
  },

  // Get current task for a release
  getCurrentTask: (releaseId) => {
    const { tasks } = get();
    return tasks.find(t => t.releaseId === releaseId && t.status === 'current') || null;
  },

  // Get summary of completed tasks for Gemini context
  getCompletedTasksSummary: () => {
    const { tasks } = get();
    return tasks
      .filter(t => t.status === 'completed')
      .map(t => ({
        taskTitle: t.title,
        userInput: t.userInput || '',
        completedAt: t.completedAt || new Date(),
        phase: t.phase,
      }));
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Reset store
  reset: () => set({
    currentTask: null,
    tasks: [],
    skippedTasks: [],
    isLoading: false,
    isGenerating: false,
    isCompletingTask: false,
    totalTasksEstimate: 0,
    completedCount: 0,
    skippedCount: 0,
    currentPhase: 'pre-production',
    error: null,
  }),
}));
