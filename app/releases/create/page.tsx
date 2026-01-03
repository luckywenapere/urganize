'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/lib/release-store';
import { useTaskStore } from '@/lib/task-store';
import { generateDefaultTasks } from '@/lib/task-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { ReleaseType } from '@/types';

export default function CreateReleasePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { addRelease } = useReleaseStore();
  const { addTask } = useTaskStore();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    artistName: '',
    type: 'single' as ReleaseType,
    releaseDate: '',
  });

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    if (!user) return;

    // Create the release
    const newRelease = {
      title: formData.title,
      artistName: formData.artistName,
      type: formData.type,
      status: 'draft' as const,
      releaseDate: formData.releaseDate ? new Date(formData.releaseDate) : undefined,
      userId: user.id,
    };

    addRelease(newRelease);

    // Generate default tasks
    const releaseId = Date.now().toString(); // This should match the ID generated in the store
    const defaultTasks = generateDefaultTasks(releaseId, user.id);
    defaultTasks.forEach(task => addTask(task));

    // Redirect to the new release
    router.push(`/releases/${releaseId}`);
  };

  const canProceed = () => {
    if (step === 1) {
      return formData.title && formData.artistName && formData.type;
    }
    return true; // Step 2 and 3 are optional
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-4xl font-bold font-display mb-2">Create New Release</h1>
          <p className="text-slate-400">Let's get your release organized</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3].map((num) => (
            <div key={num} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                  num < step
                    ? 'bg-emerald-500 text-black'
                    : num === step
                    ? 'bg-emerald-500 text-black'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {num < step ? <Check className="w-5 h-5" /> : num}
              </div>
              {num < 3 && (
                <div
                  className={`flex-1 h-1 mx-2 transition-colors ${
                    num < step ? 'bg-emerald-500' : 'bg-slate-800'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <Card className="p-8">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Basic Information</h2>
                <p className="text-slate-400 text-sm">Tell us about your release</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  What are you releasing?
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setFormData({ ...formData, type: 'single' })}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      formData.type === 'single'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                    }`}
                  >
                    <div className="font-semibold mb-1">Single</div>
                    <div className="text-xs text-slate-400">1 track</div>
                  </button>
                  
                  <button
                    disabled
                    className="p-4 rounded-xl border-2 border-slate-700 bg-slate-800/30 opacity-50 cursor-not-allowed relative"
                  >
                    <div className="font-semibold mb-1">EP</div>
                    <div className="text-xs text-slate-400">Coming Soon</div>
                    <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 bg-slate-700 rounded-full">
                      Soon
                    </div>
                  </button>
                  
                  <button
                    disabled
                    className="p-4 rounded-xl border-2 border-slate-700 bg-slate-800/30 opacity-50 cursor-not-allowed relative"
                  >
                    <div className="font-semibold mb-1">Album</div>
                    <div className="text-xs text-slate-400">Coming Soon</div>
                    <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 bg-slate-700 rounded-full">
                      Soon
                    </div>
                  </button>
                </div>
              </div>

              <Input
                label="Release Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Midnight Dreams"
                required
              />

              <Input
                label="Artist Name"
                value={formData.artistName}
                onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
                placeholder="e.g., John Doe"
                required
              />

              <div className="flex justify-end">
                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="flex items-center gap-2"
                >
                  Next: Timeline
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Timeline */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Set Timeline</h2>
                <p className="text-slate-400 text-sm">When are you planning to release?</p>
              </div>

              <Input
                label="Release Date"
                type="date"
                value={formData.releaseDate}
                onChange={(e) => setFormData({ ...formData, releaseDate: e.target.value })}
                helperText="We recommend at least 4-6 weeks of prep time"
              />

              {formData.releaseDate && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-sm text-emerald-400">
                    ✓ You have{' '}
                    {Math.ceil(
                      (new Date(formData.releaseDate).getTime() - Date.now()) /
                        (1000 * 60 * 60 * 24)
                    )}{' '}
                    days until release
                  </p>
                </div>
              )}

              <div className="flex justify-between">
                <Button onClick={handleBack} variant="ghost" className="flex items-center gap-2">
                  <ArrowLeft className="w-5 h-5" />
                  Back
                </Button>
                <Button onClick={handleNext} className="flex items-center gap-2">
                  Next: Review
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Review & Create</h2>
                <p className="text-slate-400 text-sm">Everything look good?</p>
              </div>

              <div className="space-y-4 p-6 rounded-xl bg-slate-800/50">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Release Type</div>
                  <div className="font-semibold capitalize">{formData.type}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Title</div>
                  <div className="font-semibold">{formData.title}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Artist</div>
                  <div className="font-semibold">{formData.artistName}</div>
                </div>
                {formData.releaseDate && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Release Date</div>
                    <div className="font-semibold">
                      {new Date(formData.releaseDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm text-emerald-400 mb-2">
                  ✓ We'll automatically create:
                </p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li>• 16 pre-defined tasks across 4 phases</li>
                  <li>• Organized file folders (Audio, Artwork, Stems, etc.)</li>
                  <li>• Promotion timeline framework</li>
                </ul>
              </div>

              <div className="flex justify-between">
                <Button onClick={handleBack} variant="ghost" className="flex items-center gap-2">
                  <ArrowLeft className="w-5 h-5" />
                  Back
                </Button>
                <Button onClick={handleSubmit} className="flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  Create Release
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="mt-6 text-center text-sm text-slate-500">
          Don't worry, you can edit everything later
        </div>
      </div>
    </div>
  );
}
