import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useFileStore } from '@/lib/file-store';
import { useAuthStore } from '@/lib/auth-store';
import type { FileCategory } from '@/types';
import { Upload, File, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface FileUploadProps {
  releaseId: string;
}

const CATEGORIES: { key: FileCategory; label: string; required?: boolean }[] = [
  { key: 'audio', label: 'Audio', required: true },
  { key: 'stems', label: 'Stems' },
  { key: 'artwork', label: 'Artwork' },
  { key: 'licenses', label: 'Licenses' },
  { key: 'contracts', label: 'Contracts' },
];

export const FileUpload: React.FC<FileUploadProps> = ({ releaseId }) => {
  const { user } = useAuthStore();
  const { getFilesByCategory, addFile, deleteFile } = useFileStore();

  const [selectedCategory, setSelectedCategory] = React.useState<FileCategory>('audio');

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!user) return;

      acceptedFiles.forEach((file) => {
        // In a real app, upload to cloud storage and get URL
        const mockUrl = URL.createObjectURL(file);

        addFile({
          releaseId,
          name: file.name,
          category: selectedCategory,
          size: file.size,
          url: mockUrl,
          uploadedBy: user.id,
        });
      });
    },
    [releaseId, selectedCategory, user, addFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  return (
    <div className="space-y-6">
      {/* Category Selector */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-3">
          Upload to:
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <button
              key={category.key}
              onClick={() => setSelectedCategory(category.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === category.key
                  ? 'bg-emerald-500 text-black'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {category.label}
              {category.required && <span className="ml-1 text-red-400">*</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
          isDragActive
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-slate-700 hover:border-slate-600 bg-slate-900/30'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto mb-4 text-slate-600" />
        {isDragActive ? (
          <p className="text-lg font-medium text-emerald-400">Drop files here...</p>
        ) : (
          <>
            <p className="text-lg font-medium mb-2">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-sm text-slate-500">
              Files will be added to: <span className="text-slate-300">{CATEGORIES.find(c => c.key === selectedCategory)?.label}</span>
            </p>
          </>
        )}
      </div>

      {/* File Lists by Category */}
      <div className="space-y-6 mt-8">
        {CATEGORIES.map((category) => {
          const files = getFilesByCategory(releaseId, category.key);

          return (
            <div key={category.key}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-bold text-slate-300">
                  📁 {category.label}
                </h3>
                {category.required && files.length === 0 && (
                  <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">
                    Required
                  </span>
                )}
                {files.length > 0 && (
                  <span className="text-xs text-slate-500">({files.length})</span>
                )}
              </div>

              {files.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800 text-slate-500 text-sm text-center">
                  No files yet
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <FileItem
                      key={file.id}
                      file={file}
                      onDelete={() => deleteFile(file.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface FileItemProps {
  file: any;
  onDelete: () => void;
}

const FileItem: React.FC<FileItemProps> = ({ file, onDelete }) => {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <File className="w-5 h-5 text-slate-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{file.name}</div>
          <div className="text-xs text-slate-500">{formatFileSize(file.size)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={file.url}
          download={file.name}
          className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-emerald-400"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </a>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg hover:bg-red-500/10 transition-colors text-slate-400 hover:text-red-400"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
