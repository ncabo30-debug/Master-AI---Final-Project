import type { FileRecord } from '@/lib/fileQueue';
import type { UseFileQueueReturn } from '@/lib/useFileQueue';
import EmptyState from './EmptyState';
import ProcessingSpinner from './ProcessingSpinner';
import SchemaValidationFlow from './SchemaValidationFlow';
import TabbedFileView from './TabbedFileView';

interface FileMainAreaProps {
  file: FileRecord | null;
  queue: UseFileQueueReturn;
}

export default function FileMainArea({ file, queue }: FileMainAreaProps) {
  if (!file) {
    return <EmptyState onAddFiles={queue.enqueueFiles} />;
  }

  // Queued: waiting in queue
  if (file.status === 'QUEUED') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 animate-fade-in">
        <div className="size-12 rounded-full bg-slate-800 flex items-center justify-center">
          <span className="material-symbols-outlined text-slate-400">schedule</span>
        </div>
        <div className="text-center">
          <p className="text-slate-300 font-medium">En cola de procesamiento</p>
          <p className="text-slate-500 text-sm mt-1">{file.fileName}</p>
          <p className="text-slate-600 text-xs mt-2">
            Esperando slot disponible (máx. 2 archivos simultáneos)
          </p>
        </div>
      </div>
    );
  }

  // Processing states (yellow)
  if (
    file.status === 'PARSING' ||
    file.status === 'SCHEMA_DETECTION' ||
    file.status === 'NORMALIZING' ||
    file.status === 'VALIDATING'
  ) {
    return <ProcessingSpinner file={file} />;
  }

  // Awaiting user schema validation
  if (file.status === 'AWAITING_VALIDATION') {
    return <SchemaValidationFlow file={file} queue={queue} />;
  }

  // Error state
  if (file.status === 'ERROR') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 animate-fade-in">
        <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-red-400">error</span>
        </div>
        <div className="text-center max-w-md">
          <p className="text-red-300 font-bold text-lg">Error al procesar el archivo</p>
          <p className="text-slate-400 text-sm mt-1">{file.fileName}</p>
          {file.error && (
            <p className="text-slate-500 text-xs mt-3 bg-slate-800 px-4 py-2 rounded-lg font-mono break-all">
              {file.error}
            </p>
          )}
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() => queue.retryFile(file.fileId)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Reintentar
            </button>
            <button
              onClick={() => queue.removeFile(file.fileId)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 font-medium rounded-lg hover:bg-slate-700 transition-colors text-sm"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              Eliminar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ready: show 5-tab view
  if (file.status === 'READY') {
    return <TabbedFileView file={file} queue={queue} />;
  }

  return null;
}
