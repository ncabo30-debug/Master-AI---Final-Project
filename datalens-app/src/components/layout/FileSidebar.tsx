'use client';

import type { FileRecord } from '@/lib/fileQueue';
import FileListItem from './FileListItem';
import FileDropTarget from './FileDropTarget';
import StatusLegend from './StatusLegend';
import TokenUsageWidget from '@/components/TokenUsageWidget';

interface FileSidebarProps {
  files: Map<string, FileRecord>;
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onAddFiles: (files: File[]) => void;
  sessionId: string | null;
  onOpenAdmin: () => void;
}

export default function FileSidebar({
  files,
  selectedFileId,
  onSelectFile,
  onAddFiles,
  sessionId,
  onOpenAdmin,
}: FileSidebarProps) {
  const fileList = Array.from(files.values());

  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-border-dark bg-surface-dark overflow-hidden">
      {/* Logo */}
      <div className="p-4 flex items-center gap-2.5 border-b border-border-dark">
        <div className="size-7 bg-primary rounded-lg flex items-center justify-center text-white shrink-0">
          <span
            className="material-symbols-outlined text-base"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            analytics
          </span>
        </div>
        <h1 className="text-base font-bold tracking-tight text-primary">DataLens AI</h1>
      </div>

      {/* File drop target */}
      <div className="pt-2">
        <FileDropTarget onAddFiles={onAddFiles} />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {fileList.length === 0 && (
          <p className="text-xs text-slate-600 text-center px-2 py-4">
            Sube archivos CSV o Excel para comenzar
          </p>
        )}
        {fileList.map((file) => (
          <FileListItem
            key={file.fileId}
            file={file}
            isSelected={file.fileId === selectedFileId}
            onClick={() => onSelectFile(file.fileId)}
          />
        ))}
      </div>

      {/* Status legend */}
      <StatusLegend />

      {/* Token usage widget */}
      <TokenUsageWidget sessionId={sessionId} />

      {/* Admin button */}
      <div className="p-3 border-t border-border-dark">
        <button
          onClick={onOpenAdmin}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors text-sm"
        >
          <span className="material-symbols-outlined text-sm">terminal</span>
          <span>Admin / Logs</span>
        </button>
      </div>
    </aside>
  );
}
