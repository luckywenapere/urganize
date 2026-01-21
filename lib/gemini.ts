// lib/gemini.ts
// Gemini API Integration for AI-powered task generation

import type {
  ArtistProfile,
  ReleaseProfile,
  AITask,
  GeneratedTask,
  GeminiInitialStrategyResponse,
  GeminiTaskResponse,
  CompletedTaskSummary,
  TaskPhase,
} from '@/types';

// =============================================
// CONFIGURATION
// =============================================

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-1.5-flash';

// =============================================
// SYSTEM PROMPT
// =============================================

const SYSTEM_PROMPT = `You are a seasoned music marketing strategist who has taken artists from underground to A-list status and maintained successful careers. You specialize in modern, platform-specific promotion strategies across Instagram, TikTok, Twitter, Spotify, and Apple Music.

Your approach is:
- Direct and professional
- Highly specific (users should be able to act immediately without thinking)
- Platform-aware (each platform has different best practices)
- Location-aware (strategies adapt to the artist's market)
- Budget-conscious (strategies scale with available budget)
- Trend-aware (you know what's working NOW in the music industry)

You generate tasks that are:
- Actionable within the estimated time
- Sequenced logically (each task builds on previous results)
- Customized to the artist's style, audience, and goals
- Modern and effective (no outdated tactics)

You adapt strategies from successful campaigns across genres - what works in Afrobeats can inspire Hip-Hop campaigns and vice versa.

CRITICAL RULES:
1. Tasks must be SPECIFIC - never vague. Include exact actions, suggested captions, timestamps, etc.
2. Each task should take no more than 2 hours maximum
3. Consider the artist's budget when suggesting paid promotions
4. Prioritize organic growth strategies for lower budgets
5. Always explain WHY each task matters
6. Tasks should feel achievable, not overwhelming
7. Account for the artist's location and target market`;

// =============================================
// PROMPT BUILDERS
// =============================================

function buildInitialStrategyPrompt(
  artistProfile: ArtistProfile,
  releaseProfile: ReleaseProfile,
  releaseTitle: string,
  releaseType: string
): string {
  const daysUntilRelease = releaseProfile.targetReleaseDate
    ? Math.ceil((new Date(releaseProfile.targetReleaseDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 30;

  return `Create a complete release campaign strategy for this artist and release.

ARTIST PROFILE:
- Name: ${artistProfile.artistName}
- Brand/Aesthetic: ${artistProfile.brandAesthetic || 'Not specified'}
- Career Stage: ${artistProfile.careerStage || 'emerging'}
- Past Releases: ${artistProfile.pastReleasesCount}
- Best Stream Count: ${artistProfile.bestStreamCount.toLocaleString()}
- Reference Artists: ${artistProfile.referenceArtists?.join(', ') || 'None specified'}
- Active Platforms: ${[
    artistProfile.instagramHandle && 'Instagram',
    artistProfile.tiktokHandle && 'TikTok', 
    artistProfile.twitterHandle && 'Twitter',
    artistProfile.youtubeHandle && 'YouTube',
  ].filter(Boolean).join(', ') || 'None specified'}

RELEASE DETAILS:
- Title: "${releaseTitle}"
- Type: ${releaseType}
- Genre: ${releaseProfile.genre || 'Not specified'} ${releaseProfile.subgenre ? `/ ${releaseProfile.subgenre}` : ''}
- Mood: ${releaseProfile.mood || 'Not specified'}
- Hook Timestamp: ${releaseProfile.hookTimestamp || 'Not specified'}
- Has Features: ${releaseProfile.featuredArtists?.length ? releaseProfile.featuredArtists.join(', ') : 'No'}
- Song Status: ${releaseProfile.primaryAudioStatus}

TARGET AUDIENCE:
- Primary Market: ${releaseProfile.primaryMarket || 'Not specified'}
- Age Range: ${releaseProfile.targetAgeMin || 18}-${releaseProfile.targetAgeMax || 35}
- Description: ${releaseProfile.targetAudienceDescription || 'Not specified'}
- Interests: ${releaseProfile.listenerInterests?.join(', ') || 'Not specified'}

CAMPAIGN PARAMETERS:
- Budget: ₦${(releaseProfile.budgetNaira || 50000).toLocaleString()}
- Release Date: ${releaseProfile.targetReleaseDate ? new Date(releaseProfile.targetReleaseDate).toLocaleDateString() : 'Not set'}
- Days Until Release: ${daysUntilRelease}
- Stream Goal (Realistic): ${releaseProfile.streamTargetRealistic?.toLocaleString() || 'Not set'}
- Stream Goal (Stretch): ${releaseProfile.streamTargetStretch?.toLocaleString() || 'Not set'}
- Playlist Goals: ${releaseProfile.playlistGoals || 'Not specified'}
- Social Growth Goals: ${releaseProfile.socialGrowthGoals || 'Not specified'}

Based on this information, create:

1. A CAMPAIGN NARRATIVE (2-3 sentences describing the overall campaign theme and approach)

2. TOTAL TASKS ESTIMATE (a number between 12-30 based on budget and timeline)

3. PHASE BREAKDOWN with task counts and focus areas:
   - Pre-production: Foundation and planning tasks
   - Production: Content creation tasks  
   - Promotion: Marketing and engagement tasks
   - Distribution: Release and post-release tasks

4. FIRST 5 TASKS in detail (these will be the first tasks the artist sees)

Respond ONLY with valid JSON in this exact format:
{
  "campaignNarrative": "string",
  "totalTasksEstimate": number,
  "phases": {
    "preProduction": { "taskCount": number, "focus": "string" },
    "production": { "taskCount": number, "focus": "string" },
    "promotion": { "taskCount": number, "focus": "string" },
    "distribution": { "taskCount": number, "focus": "string" }
  },
  "tasks": [
    {
      "title": "Short action-oriented title",
      "description": "Detailed instructions with specific actions, examples, and suggestions",
      "whyItMatters": "Brief explanation of impact",
      "platform": "instagram|tiktok|twitter|spotify|apple_music|youtube|general|email|whatsapp",
      "estimatedTime": "15 mins|30 mins|1 hour|2 hours",
      "inputType": "text|url|confirm|select|number",
      "inputPlaceholder": "Placeholder text for input field",
      "inputLabel": "Label for the input",
      "phase": "pre-production|production|promotion|distribution"
    }
  ]
}`;
}

function buildContinuationPrompt(
  artistProfile: ArtistProfile,
  releaseProfile: ReleaseProfile,
  completedTasks: CompletedTaskSummary[],
  currentPhase: TaskPhase,
  tasksRemaining: number
): string {
  const completedSummary = completedTasks
    .map(t => `- ${t.taskTitle}: "${t.userInput}"`)
    .join('\n');

  return `Generate the next batch of tasks for this release campaign.

CONTEXT:
- Artist: ${artistProfile.artistName}
- Release: ${releaseProfile.genre || 'Music'} release
- Current Phase: ${currentPhase}
- Tasks Remaining (estimated): ${tasksRemaining}
- Campaign Narrative: ${releaseProfile.campaignNarrative}

COMPLETED TASKS AND RESULTS:
${completedSummary || 'No tasks completed yet'}

Based on what the artist has accomplished, generate the NEXT 3-5 TASKS that logically follow.

IMPORTANT:
- Build upon the user's previous inputs and decisions
- Stay within the current phase or transition to the next if appropriate
- Keep tasks specific and actionable
- Consider any patterns or preferences shown in their responses

Respond ONLY with valid JSON:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "whyItMatters": "string",
      "platform": "instagram|tiktok|twitter|spotify|apple_music|youtube|general|email|whatsapp",
      "estimatedTime": "15 mins|30 mins|1 hour|2 hours",
      "inputType": "text|url|confirm|select|number",
      "inputPlaceholder": "string",
      "inputLabel": "string",
      "phase": "pre-production|production|promotion|distribution"
    }
  ],
  "strategyUpdate": "Optional note if strategy needs adjustment"
}`;
}

function buildVariantPrompt(
  currentTask: AITask,
  artistProfile: ArtistProfile,
  releaseProfile: ReleaseProfile
): string {
  return `Generate an ALTERNATIVE approach for this task.

ORIGINAL TASK:
- Title: ${currentTask.title}
- Description: ${currentTask.description}
- Platform: ${currentTask.platform}
- Phase: ${currentTask.phase}

ARTIST CONTEXT:
- Name: ${artistProfile.artistName}
- Brand: ${artistProfile.brandAesthetic || 'Not specified'}
- Genre: ${releaseProfile.genre || 'Not specified'}

Create a DIFFERENT way to achieve the same goal. The variant should:
- Have a different approach or method
- Still achieve the same objective
- Be equally specific and actionable
- Potentially use a different platform or format

Respond ONLY with valid JSON:
{
  "task": {
    "title": "string",
    "description": "string",
    "whyItMatters": "string",
    "platform": "instagram|tiktok|twitter|spotify|apple_music|youtube|general|email|whatsapp",
    "estimatedTime": "15 mins|30 mins|1 hour|2 hours",
    "inputType": "text|url|confirm|select|number",
    "inputPlaceholder": "string",
    "inputLabel": "string",
    "phase": "pre-production|production|promotion|distribution"
  }
}`;
}

// =============================================
// API CALL FUNCTION
// =============================================

async function callGeminiAPI(prompt: string): Promise<any> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  // Extract text from response
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error('No response text from Gemini');
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonText = text;
  if (text.includes('```json')) {
    jsonText = text.split('```json')[1].split('```')[0];
  } else if (text.includes('```')) {
    jsonText = text.split('```')[1].split('```')[0];
  }

  try {
    return JSON.parse(jsonText.trim());
  } catch (e) {
    console.error('Failed to parse Gemini response:', text);
    throw new Error('Invalid JSON response from Gemini');
  }
}

// =============================================
// PUBLIC API FUNCTIONS
// =============================================

export async function generateInitialStrategy(
  artistProfile: ArtistProfile,
  releaseProfile: ReleaseProfile,
  releaseTitle: string,
  releaseType: string
): Promise<GeminiInitialStrategyResponse> {
  const prompt = buildInitialStrategyPrompt(
    artistProfile,
    releaseProfile,
    releaseTitle,
    releaseType
  );

  try {
    const response = await callGeminiAPI(prompt);
    return response as GeminiInitialStrategyResponse;
  } catch (error) {
    console.error('Failed to generate initial strategy:', error);
    throw error;
  }
}

export async function generateNextTasks(
  artistProfile: ArtistProfile,
  releaseProfile: ReleaseProfile,
  completedTasks: CompletedTaskSummary[],
  currentPhase: TaskPhase,
  tasksRemaining: number
): Promise<GeminiTaskResponse> {
  const prompt = buildContinuationPrompt(
    artistProfile,
    releaseProfile,
    completedTasks,
    currentPhase,
    tasksRemaining
  );

  try {
    const response = await callGeminiAPI(prompt);
    return response as GeminiTaskResponse;
  } catch (error) {
    console.error('Failed to generate next tasks:', error);
    throw error;
  }
}

export async function generateTaskVariant(
  currentTask: AITask,
  artistProfile: ArtistProfile,
  releaseProfile: ReleaseProfile
): Promise<GeneratedTask> {
  const prompt = buildVariantPrompt(currentTask, artistProfile, releaseProfile);

  try {
    const response = await callGeminiAPI(prompt);
    return response.task as GeneratedTask;
  } catch (error) {
    console.error('Failed to generate task variant:', error);
    throw error;
  }
}

// =============================================
// FALLBACK TASKS
// =============================================

export function getFallbackTask(): GeneratedTask {
  return {
    title: 'Task generation temporarily unavailable',
    description: 'We encountered an issue generating your next task. Please try again in a moment. If the problem persists, you can refresh the page.',
    whyItMatters: 'This is a temporary issue with our AI system.',
    platform: 'general',
    estimatedTime: '1 min',
    inputType: 'confirm',
    inputPlaceholder: '',
    inputLabel: 'Click to retry',
    phase: 'pre-production',
  };
}

export function getFallbackInitialStrategy(): GeminiInitialStrategyResponse {
  return {
    campaignNarrative: 'Your personalized campaign will be generated shortly. Please try again.',
    totalTasksEstimate: 15,
    phases: {
      preProduction: { taskCount: 3, focus: 'Foundation and planning' },
      production: { taskCount: 4, focus: 'Content creation' },
      promotion: { taskCount: 5, focus: 'Marketing and engagement' },
      distribution: { taskCount: 3, focus: 'Release and follow-up' },
    },
    tasks: [getFallbackTask()],
  };
}
