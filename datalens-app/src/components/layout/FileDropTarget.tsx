'use client';

import { useRef, useState } from 'react';

interface FileDropTargetProps {
  onAddFiles: (files: File[]) => void;
}

export default function FileDropTarget({ onAddFiles }: FileDropTargetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const supportedFiles = Array.from(fileList).filter((f) => /\.(csv|xlsx|xls)$/i.test(f.name));
    if (supportedFiles.length > 0) onAddFiles(supportedFiles);
  };

  return (
    <div className="px-2 pb-2">
      <button
        onClick={() => inputRef.current?.click()}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm font-medium transition-colors ${
          dragActive
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-slate-600 text-slate-400 hover:border-primary/50 hover:text-primary hover:bg-primary/5'
        }`}
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <span className="material-symbols-outlined text-sm">add</span>
        Agregar archivos
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
