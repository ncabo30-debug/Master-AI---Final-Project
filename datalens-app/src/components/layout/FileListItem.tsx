'use client';

import type { FileRecord } from '@/lib/fileQueue';
import { FILE_STATUS_LABEL, FILE_STATUS_DOT_CLASS } from '@/lib/fileQueue';

interface FileListItemProps {
  file: FileRecord;
  isSelected: boolean;
  onClick: () => void;
}

export default function FileListItem({ file, isSelected, onClick }: FileListItemProps) {
  const truncatedName =
    file.fileName.length > 20
      ? file.fileName.slice(0, 17) + '...'
      : file.fileName;

  return (
    <button
      onClick={onClick}
      title={file.fileName}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors text-left ${
        isSelected
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-slate-800/50 border border-transparent'
      }`}
    >
      {/* Status dot */}
      <span
        className={`shrink-0 rounded-full ${FILE_STATUS_DOT_CLASS[file.status]}`}
        style={{ width: 10, height: 10, display: 'inline-block' }}
      />

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            isSelected ? 'text-primary' : 'text-slate-200'
          }`}
        >
          {truncatedName}
        </p>
        <p
          className={`text-xs truncate ${
            file.status === 'AWAITING_APPROVAL' || file.status === 'BLUEPRINT_READY'
              ? 'text-red-400'
              : file.status === 'READY'
              ? 'text-green-400'
              : file.status === 'VALIDATION_FAILED'
              ? 'text-amber-400'
              : file.status === 'ERROR'
              ? 'text-red-400'
              : 'text-slate-500'
          }`}
        >
          {FILE_STATUS_LABEL[file.status]}
        </p>
      </div>
    </button>
  );
}
