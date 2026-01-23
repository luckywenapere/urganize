// types/ai-tasks.ts
// AI Task Flow Type Definitions
// Add to your existing types/index.ts: export * from './ai-tasks';

// =============================================
// ARTIST PROFILE TYPES
// =============================================

export type CareerStage = 'emerging' | 'growing' | 'established';

export interface ArtistProfile {
  id: string;
  userId: string;
  
  // Brand & Identity
  artistName: string;
  brandAesthetic?: string;
  bio?: string;
  
  // Experience
  pastReleasesCount: number;
  bestStreamCount: number;
  careerStage?: CareerStage;
  
  // Reference & Inspiration
  referenceArtists: string[];
  
  // Social Platforms
  instagramHandle?: string;
  tiktokHandle?: string;
  twitterHandle?: string;
  youtubeHandle?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface ArtistProfileFormData {
  artistName: string;
  brandAesthetic: string;
  bio: string;
  pastReleasesCount: number;
  bestStreamCount: number;
  careerStage: CareerStage;
  referenceArtists: string[];
  instagramHandle: string;
  tiktokHandle: string;
  twitterHandle: string;
  youtubeHandle: string;
  spotifyUrl: string;
  appleMusicUrl: string;
}

// =============================================
// RELEASE PROFILE TYPES
// =============================================

export type SongStage = 'idea' | 'demo' | 'recording' | 'final';
export type FileLocation = 'phone' | 'laptop' | 'google_drive' | 'producer' | 'other';
export type AudioStatus = 'missing' | 'needs_changes' | 'ready';

export interface ReleaseProfile {
  id: string;
  releaseId: string;
  
  // Song Intake (Required)
  songStage?: SongStage;
  isMastered?: boolean;
  fileLocation?: FileLocation;
  fileLocationOther?: string;
  
  // Optional Song Details
  producer?: string;
  featuredArtists: string[];
  mood?: string;
  genre?: string;
  subgenre?: string;
  isExplicit: boolean;
  hookTimestamp?: string;
  songLength?: string;
  hasSamples: boolean;
  sampleDetails?: string;
  releaseConfidence?: number;
  isArtworkReady: boolean;
  
  // Notes
  songNotes?: string;
  managerNotes?: string;
  
  // Target Audience & Market
  primaryMarket?: string;
  targetAgeMin?: number;
  targetAgeMax?: number;
  targetAudienceDescription?: string;
  listenerInterests: string[];
  
  // Budget & Timeline
  budgetNaira?: number;
  targetReleaseDate?: Date;
  hardDeadline?: Date;
  deadlineReason?: string;
  
  // Goals
  streamTargetRealistic?: number;
  streamTargetStretch?: number;
  playlistGoals?: string;
  socialGrowthGoals?: string;
  otherGoals?: string;
  
  // AI Generated Strategy
  releaseStrategy?: ReleaseStrategy;
  campaignNarrative?: string;
  totalTasksEstimate?: number;
  
  // Asset Status
  primaryAudioStatus: AudioStatus;
  
  // Setup Progress
  setupStep: number;
  setupCompleted: boolean;
  setupCompletedAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface ReleaseStrategy {
  narrative: string;
  totalTasks: number;
  phases: {
    preProduction: { taskCount: number; focus: string };
    production: { taskCount: number; focus: string };
    promotion: { taskCount: number; focus: string };
    distribution: { taskCount: number; focus: string };
  };
  keyMessages: string[];
  platformPriority: string[];
}

// =============================================
// SONG INTAKE FORM DATA
// =============================================

export interface SongIntakeRequired {
  songStage: SongStage;
  isMastered: boolean;
  fileLocation: FileLocation;
  fileLocationOther?: string;
}

export interface SongIntakeOptional {
  producer: string;
  featuredArtists: string[];
  mood: string;
  genre: string;
  subgenre: string;
  isExplicit: boolean;
  hookTimestamp: string;
  songLength: string;
  hasSamples: boolean;
  sampleDetails: string;
  releaseConfidence: number;
  isArtworkReady: boolean;
  songNotes: string;
  managerNotes: string;
}

export interface SongIntakeFormData extends SongIntakeRequired, Partial<SongIntakeOptional> {}

// =============================================
// AI TASK TYPES
// =============================================

export type TaskInputType = 'text' | 'url' | 'file' | 'select' | 'multiselect' | 'confirm' | 'number' | 'date';
export type TaskStatus = 'pending' | 'current' | 'completed' | 'skipped';
export type TaskPhase = 'pre-production' | 'production' | 'promotion' | 'distribution';
export type TaskPlatform = 'instagram' | 'tiktok' | 'twitter' | 'spotify' | 'apple_music' | 'youtube' | 'general' | 'email' | 'whatsapp';

export interface AITask {
  id: string;
  releaseId: string;
  userId: string;
  
  // Task Content
  title: string;
  description: string;
  whyItMatters?: string;
  platform?: TaskPlatform;
  estimatedTime?: string;
  
  // Task Input Configuration
  inputType: TaskInputType;
  inputOptions?: SelectOption[];
  inputPlaceholder?: string;
  inputLabel?: string;
  
  // User Response
  userInput?: string;
  userInputFileUrl?: string;
  userInputData?: Record<string, any>;
  
  // Task State
  status: TaskStatus;
  phase: TaskPhase;
  orderIndex: number;
  
  // Variant Tracking
  variantCount: number;
  maxVariants: number;
  isVariant: boolean;
  originalTaskId?: string;
  
  // Timestamps
  startedAt?: Date;
  completedAt?: Date;
  skippedAt?: Date;
  skippedReason?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

// =============================================
// TASK BATCH TYPES
// =============================================

export type BatchType = 'initial' | 'continuation' | 'variant';

export interface TaskBatch {
  id: string;
  releaseId: string;
  batchNumber: number;
  batchType: BatchType;
  tasksGenerated: number;
  contextSummary?: string;
  promptUsed?: string;
  geminiResponse?: any;
  tokensUsed?: number;
  wasSuccessful: boolean;
  errorMessage?: string;
  createdAt: Date;
}

// =============================================
// GEMINI API TYPES
// =============================================

export interface GeminiTaskGenerationRequest {
  artistProfile: ArtistProfile;
  releaseProfile: ReleaseProfile;
  releaseTitle: string;
  releaseType: string;
  completedTasks?: CompletedTaskSummary[];
  currentPhase?: TaskPhase;
  tasksRemaining?: number;
  batchType: BatchType;
}

export interface CompletedTaskSummary {
  taskTitle: string;
  userInput: string;
  completedAt: Date;
  phase: TaskPhase;
}

export interface GeminiTaskResponse {
  tasks: GeneratedTask[];
  strategyUpdate?: string;
  tokensUsed?: number;
}

export interface GeneratedTask {
  title: string;
  description: string;
  whyItMatters: string;
  platform: TaskPlatform;
  estimatedTime: string;
  inputType: TaskInputType;
  inputOptions?: SelectOption[];
  inputPlaceholder?: string;
  inputLabel?: string;
  phase: TaskPhase;
}

export interface GeminiVariantRequest {
  currentTask: AITask;
  artistProfile: ArtistProfile;
  releaseProfile: ReleaseProfile;
}

export interface GeminiInitialStrategyResponse {
  campaignNarrative: string;
  totalTasksEstimate: number;
  phases: {
    preProduction: { taskCount: number; focus: string };
    production: { taskCount: number; focus: string };
    promotion: { taskCount: number; focus: string };
    distribution: { taskCount: number; focus: string };
  };
  tasks: GeneratedTask[];
}

// =============================================
// SETUP WIZARD TYPES
// =============================================

export type SetupStep = 1 | 2 | 3 | 4 | 5;

export interface SetupWizardState {
  currentStep: SetupStep;
  isComplete: boolean;
  
  // Step 1: Basic Info (from existing release creation)
  basicInfo: {
    title: string;
    type: string;
    artistName: string;
  };
  
  // Step 2: Song Intake
  songIntake: SongIntakeFormData;
  
  // Step 3: Target Audience
  targetAudience: {
    primaryMarket: string;
    targetAgeMin: number;
    targetAgeMax: number;
    targetAudienceDescription: string;
    listenerInterests: string[];
  };
  
  // Step 4: Budget & Timeline
  budgetTimeline: {
    budgetNaira: number;
    targetReleaseDate: string;
    hardDeadline?: string;
    deadlineReason?: string;
  };
  
  // Step 5: Goals
  goals: {
    streamTargetRealistic: number;
    streamTargetStretch: number;
    playlistGoals: string;
    socialGrowthGoals: string;
    otherGoals?: string;
  };
}

// =============================================
// UI STATE TYPES
// =============================================

export interface TaskUIState {
  currentTask: AITask | null;
  isLoading: boolean;
  isGenerating: boolean;
  isCompletingTask: boolean;
  variantsRemaining: number;
  error?: string;
}

export interface ReleaseProgressState {
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  currentPhase: TaskPhase;
  percentComplete: number;
  daysUntilRelease?: number;
}

export interface SkippedTask {
  id: string;
  title: string;
  description: string;
  phase: TaskPhase;
  skippedAt: Date;
  skippedReason?: string;
}

// =============================================
// COMPLETION TYPES
// =============================================

export interface CampaignSummary {
  releaseTitle: string;
  artistName: string;
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  campaignDuration: number;
  platforms: string[];
  contentCreated: {
    platform: string;
    count: number;
  }[];
  releaseDate: Date;
  completedAt: Date;
}
