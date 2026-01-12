'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useFileStore } from '@/lib/file-store';
import { useAuthStore } from '@/lib/auth-store';
import { Card } from '@/components/ui/Card';
import type { FileCategory } from '@/types';
import { Upload, File, Trash2, Download, Music, Image, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface FileUploadProps {
  releaseId: string;
}

const CATEGORIES: { key: FileCategory; label: string; icon: React.ReactNode; required?: boolean }[] = [
  { key: 'audio', label: 'Audio', icon: <Music className="w-4 h-4" />, required: true },
  { key: 'stems', label: 'Stems', icon: <Music className="w-4 h-4" /> },
  { key: 'artwork', label: 'Artwork', icon: <Image className="w-4 h-4" /> },
  { key: 'licenses', label: 'Licenses', icon: <FileText className="w-4 h-4" /> },
  { key: 'contracts', label: 'Contracts', icon: <FileText className="w-4 h-4" /> },
];

export const FileUpload: React.FC<FileUploadProps> = ({ releaseId }) => {
  const { user } = useAuthStore();
  const { getFilesByCategory, addFile, deleteFile } = useFileStore();
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>('audio');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
  if (!user) return;
  
  for (const file of acceptedFiles) {
    try {
      // Upload to Supabase Storage
      const filePath = `${releaseId}/${selectedCategory}/${Date.now()}_${file.name}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('release-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('release-files')
        .getPublicUrl(filePath);

      // Save file record to database
      await addFile({
        releaseId,
        name: file.name,
        category: selectedCategory,
        size: file.size,
        url: urlData.publicUrl,
        uploadedBy: user.id,
      });
    } catch (error) {
      console.error('File upload failed:', error);
      alert(`Failed to upload ${file.name}`);
    }
  }
}, [releaseId, selectedCategory, user, addFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const files = getFilesByCategory(releaseId, cat.key);
          const hasFiles = files.length > 0;
          
          return (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`flex items-center gap-2 h-8 px-3 rounded-lg text-sm font-medium transition-all duration-fast ${
                selectedCategory === cat.key
                  ? 'bg-brand text-content-inverse'
                  : 'bg-bg-elevated text-content-secondary hover:bg-bg-hover border border-stroke-subtle'
              }`}
            >
              {cat.icon}
              {cat.label}
              {cat.required && !hasFiles && (
                <span className="w-1.5 h-1.5 rounded-full bg-status-error" />
              )}
              {hasFiles && (
                <span className={`text-xs px-1.5 rounded ${
                  selectedCategory === cat.key ? 'bg-white/20' : 'bg-bg-overlay'
                }`}>
                  {files.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-fast ${
          isDragActive
            ? 'border-brand bg-brand/10'
            : 'border-stroke-default hover:border-stroke-strong bg-bg-surface'
        }`}
      >
        <input {...getInputProps()} />
        <div className={`w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center ${
          isDragActive ? 'bg-brand/20' : 'bg-bg-elevated'
        }`}>
          <Upload className={`w-6 h-6 ${isDragActive ? 'text-brand' : 'text-content-tertiary'}`} />
        </div>
        
        {isDragActive ? (
          <p className="text-brand font-medium">Drop files here...</p>
        ) : (
          <>
            <p className="font-medium text-content-primary mb-1">Drag & drop files here</p>
            <p className="text-sm text-content-tertiary">
              Uploading to: <span className="text-brand">{CATEGORIES.find(c => c.key === selectedCategory)?.label}</span>
            </p>
          </>
        )}
      </div>

      {/* File Lists */}
      <div className="space-y-4">
        {CATEGORIES.map((cat) => {
          const files = getFilesByCategory(releaseId, cat.key);
          if (files.length === 0) return null;

          return (
            <Card key={cat.key} padding="none">
              <div className="flex items-center justify-between p-3 border-b border-stroke-subtle">
                <div className="flex items-center gap-2">
                  <span className="text-content-tertiary">{cat.icon}</span>
                  <span className="font-medium text-sm text-content-primary">{cat.label}</span>
                </div>
                <span className="text-xs text-content-tertiary">{files.length} files</span>
              </div>
              
              <div className="divide-y divide-stroke-subtle">
                {files.map((file) => (
                  <FileItem key={file.id} file={file} onDelete={() => deleteFile(file.id)} />
                ))}
              </div>
            </Card>
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
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-bg-hover transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center flex-shrink-0">
        <File className="w-4 h-4 text-content-tertiary" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-content-primary truncate">{file.name}</p>
        <p className="text-xs text-content-tertiary">{formatSize(file.size)}</p>
      </div>
      
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={file.url}
          download={file.name}
          className="p-2 rounded-lg hover:bg-bg-elevated text-content-tertiary hover:text-brand transition-colors"
        >
          <Download className="w-4 h-4" />
        </a>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg hover:bg-status-error/10 text-content-tertiary hover:text-status-error transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
