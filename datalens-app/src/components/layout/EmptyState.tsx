'use client';

import { useRef, useState } from 'react';

interface EmptyStateProps {
  onAddFiles: (files: File[]) => void;
}

export default function EmptyState({ onAddFiles }: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => /\.(csv|xlsx|xls)$/i.test(f.name));
    if (files.length > 0) onAddFiles(files);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
      <div
        className={`group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-all duration-150 p-16 text-center cursor-pointer max-w-lg w-full ${
          dragActive
            ? 'border-primary bg-primary/15 scale-[1.03] shadow-lg shadow-primary/10'
            : 'border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/60'
        }`}
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className={`size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary transition-transform ${dragActive ? 'scale-125' : 'group-hover:scale-110'}`}>
          <span className="material-symbols-outlined text-4xl">{dragActive ? 'file_download' : 'cloud_upload'}</span>
        </div>

        <div>
          <p className="text-xl font-bold text-slate-100">
            {dragActive ? 'Soltá para subir' : 'Sube tus archivos de datos'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {dragActive ? 'Se procesarán automáticamente' : 'Arrastra uno o varios archivos aquí, o haz clic para explorar'}
          </p>
          <p className="text-xs text-slate-600 mt-2">
            Máx. 10 MB por archivo · Hasta 10 archivos · Formatos: CSV, XLSX, XLS
          </p>
        </div>

        {!dragActive && (
          <div className="mt-2 flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-all shadow-md">
            <span className="material-symbols-outlined text-sm">add</span>
            Explorar Archivos
          </div>
        )}
      </div>
    </div>
  );
}
