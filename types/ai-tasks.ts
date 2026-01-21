// =============================================
// URGANIZE AI TASK FLOW - TYPE DEFINITIONS
// =============================================
// Add these to your types/index.ts or create types/ai-tasks.ts

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
    releaseConfidence?: number; // 1-5
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

export interface SongIntakeFormData extends SongIntakeRequired, Partial<SongIntakeOptional> { }

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

    // UI Helpers (not in DB)
    isFallback?: boolean;
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
        type: ReleaseType;
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
    campaignDuration: number; // days
    platforms: string[];
    contentCreated: {
        platform: string;
        count: number;
    }[];
    releaseDate: Date;
    completedAt: Date;
}

// =============================================
// DATABASE MAPPER HELPERS
// =============================================

// Convert database row to ArtistProfile
export function dbToArtistProfile(row: any): ArtistProfile {
    return {
        id: row.id,
        userId: row.user_id,
        artistName: row.artist_name,
        brandAesthetic: row.brand_aesthetic,
        bio: row.bio,
        pastReleasesCount: row.past_releases_count || 0,
        bestStreamCount: row.best_stream_count || 0,
        careerStage: row.career_stage,
        referenceArtists: row.reference_artists || [],
        instagramHandle: row.instagram_handle,
        tiktokHandle: row.tiktok_handle,
        twitterHandle: row.twitter_handle,
        youtubeHandle: row.youtube_handle,
        spotifyUrl: row.spotify_url,
        appleMusicUrl: row.apple_music_url,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}

// Convert ArtistProfile to database row
export function artistProfileToDb(profile: Partial<ArtistProfileFormData> & { userId?: string }): any {
    const db: any = {};

    if (profile.userId) db.user_id = profile.userId;
    if (profile.artistName) db.artist_name = profile.artistName;
    if (profile.brandAesthetic !== undefined) db.brand_aesthetic = profile.brandAesthetic;
    if (profile.bio !== undefined) db.bio = profile.bio;
    if (profile.pastReleasesCount !== undefined) db.past_releases_count = profile.pastReleasesCount;
    if (profile.bestStreamCount !== undefined) db.best_stream_count = profile.bestStreamCount;
    if (profile.careerStage) db.career_stage = profile.careerStage;
    if (profile.referenceArtists) db.reference_artists = profile.referenceArtists;
    if (profile.instagramHandle !== undefined) db.instagram_handle = profile.instagramHandle;
    if (profile.tiktokHandle !== undefined) db.tiktok_handle = profile.tiktokHandle;
    if (profile.twitterHandle !== undefined) db.twitter_handle = profile.twitterHandle;
    if (profile.youtubeHandle !== undefined) db.youtube_handle = profile.youtubeHandle;
    if (profile.spotifyUrl !== undefined) db.spotify_url = profile.spotifyUrl;
    if (profile.appleMusicUrl !== undefined) db.apple_music_url = profile.appleMusicUrl;

    return db;
}

// Convert database row to ReleaseProfile
export function dbToReleaseProfile(row: any): ReleaseProfile {
    return {
        id: row.id,
        releaseId: row.release_id,
        songStage: row.song_stage,
        isMastered: row.is_mastered,
        fileLocation: row.file_location,
        fileLocationOther: row.file_location_other,
        producer: row.producer,
        featuredArtists: row.featured_artists || [],
        mood: row.mood,
        genre: row.genre,
        subgenre: row.subgenre,
        isExplicit: row.is_explicit || false,
        hookTimestamp: row.hook_timestamp,
        songLength: row.song_length,
        hasSamples: row.has_samples || false,
        sampleDetails: row.sample_details,
        releaseConfidence: row.release_confidence,
        isArtworkReady: row.is_artwork_ready || false,
        songNotes: row.song_notes,
        managerNotes: row.manager_notes,
        primaryMarket: row.primary_market,
        targetAgeMin: row.target_age_min,
        targetAgeMax: row.target_age_max,
        targetAudienceDescription: row.target_audience_description,
        listenerInterests: row.listener_interests || [],
        budgetNaira: row.budget_naira,
        targetReleaseDate: row.target_release_date ? new Date(row.target_release_date) : undefined,
        hardDeadline: row.hard_deadline ? new Date(row.hard_deadline) : undefined,
        deadlineReason: row.deadline_reason,
        streamTargetRealistic: row.stream_target_realistic,
        streamTargetStretch: row.stream_target_stretch,
        playlistGoals: row.playlist_goals,
        socialGrowthGoals: row.social_growth_goals,
        otherGoals: row.other_goals,
        releaseStrategy: row.release_strategy,
        campaignNarrative: row.campaign_narrative,
        totalTasksEstimate: row.total_tasks_estimate,
        primaryAudioStatus: row.primary_audio_status || 'missing',
        setupStep: row.setup_step || 1,
        setupCompleted: row.setup_completed || false,
        setupCompletedAt: row.setup_completed_at ? new Date(row.setup_completed_at) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}

// Convert database row to AITask
export function dbToAITask(row: any): AITask {
    return {
        id: row.id,
        releaseId: row.release_id,
        userId: row.user_id,
        title: row.title,
        description: row.description,
        whyItMatters: row.why_it_matters,
        platform: row.platform,
        estimatedTime: row.estimated_time,
        inputType: row.input_type,
        inputOptions: row.input_options,
        inputPlaceholder: row.input_placeholder,
        inputLabel: row.input_label,
        userInput: row.user_input,
        userInputFileUrl: row.user_input_file_url,
        userInputData: row.user_input_data,
        status: row.status,
        phase: row.phase,
        orderIndex: row.order_index,
        variantCount: row.variant_count || 0,
        maxVariants: row.max_variants || 3,
        isVariant: row.is_variant || false,
        originalTaskId: row.original_task_id,
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        skippedAt: row.skipped_at ? new Date(row.skipped_at) : undefined,
        skippedReason: row.skipped_reason,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}

// Convert AITask to database row
export function aiTaskToDb(task: Partial<AITask> & { releaseId?: string; userId?: string }): any {
    const db: any = {};

    if (task.releaseId) db.release_id = task.releaseId;
    if (task.userId) db.user_id = task.userId;
    if (task.title) db.title = task.title;
    if (task.description) db.description = task.description;
    if (task.whyItMatters !== undefined) db.why_it_matters = task.whyItMatters;
    if (task.platform) db.platform = task.platform;
    if (task.estimatedTime) db.estimated_time = task.estimatedTime;
    if (task.inputType) db.input_type = task.inputType;
    if (task.inputOptions) db.input_options = task.inputOptions;
    if (task.inputPlaceholder !== undefined) db.input_placeholder = task.inputPlaceholder;
    if (task.inputLabel !== undefined) db.input_label = task.inputLabel;
    if (task.userInput !== undefined) db.user_input = task.userInput;
    if (task.userInputFileUrl !== undefined) db.user_input_file_url = task.userInputFileUrl;
    if (task.userInputData !== undefined) db.user_input_data = task.userInputData;
    if (task.status) db.status = task.status;
    if (task.phase) db.phase = task.phase;
    if (task.orderIndex !== undefined) db.order_index = task.orderIndex;
    if (task.variantCount !== undefined) db.variant_count = task.variantCount;
    if (task.isVariant !== undefined) db.is_variant = task.isVariant;
    if (task.originalTaskId !== undefined) db.original_task_id = task.originalTaskId;
    if (task.startedAt) db.started_at = task.startedAt.toISOString();
    if (task.completedAt) db.completed_at = task.completedAt.toISOString();
    if (task.skippedAt) db.skipped_at = task.skippedAt.toISOString();
    if (task.skippedReason !== undefined) db.skipped_reason = task.skippedReason;

    return db;
}