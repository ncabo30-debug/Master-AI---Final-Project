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
  isMobileOpen?: boolean;
}

function buildStatusSummary(files: FileRecord[]): string {
  if (files.length === 0) return '';
  const ready = files.filter((f) => f.status === 'READY' || f.status === 'VALIDATION_FAILED').length;
  const processing = files.filter((f) =>
    ['PROFILING', 'EXECUTING_BLUEPRINT', 'PERSISTING', 'SQL_VALIDATING'].includes(f.status)
  ).length;
  const errors = files.filter((f) => f.status === 'ERROR').length;
  const awaiting = files.filter((f) =>
    f.status === 'AWAITING_APPROVAL' || f.status === 'BLUEPRINT_READY'
  ).length;
  const parts: string[] = [];
  if (ready > 0) parts.push(`${ready} listo${ready > 1 ? 's' : ''}`);
  if (awaiting > 0) parts.push(`${awaiting} pendiente${awaiting > 1 ? 's' : ''}`);
  if (processing > 0) parts.push(`${processing} procesando`);
  if (errors > 0) parts.push(`${errors} con error`);
  return parts.join(' · ');
}

export default function FileSidebar({
  files,
  selectedFileId,
  onSelectFile,
  onAddFiles,
  sessionId,
  onOpenAdmin,
  isMobileOpen = false,
}: FileSidebarProps) {
  const fileList = Array.from(files.values());
  const summary = buildStatusSummary(fileList);

  return (
    <aside
      className={`
        w-[220px] shrink-0 flex flex-col border-r border-border-dark bg-surface-dark overflow-hidden
        ${isMobileOpen
          ? 'fixed inset-y-0 left-0 z-50 flex'
          : 'hidden md:flex'
        }
      `}
    >
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

      {/* File list header with summary */}
      {fileList.length > 0 && (
        <div className="px-3 pt-2 pb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
            Archivos ({fileList.length})
          </span>
          {summary && (
            <span className="text-[10px] text-slate-600 truncate max-w-[110px]" title={summary}>
              {summary}
            </span>
          )}
        </div>
      )}

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
