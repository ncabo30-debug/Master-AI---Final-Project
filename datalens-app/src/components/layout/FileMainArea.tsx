import type { FileRecord } from '@/lib/fileQueue';
import type { UseFileQueueReturn } from '@/lib/useFileQueue';
import { translateError } from '@/lib/ErrorTranslator';
import EmptyState from './EmptyState';
import ProcessingSpinner from './ProcessingSpinner';
import BlueprintReviewFlow from './BlueprintReviewFlow';
import TabbedFileView from './TabbedFileView';

interface FileMainAreaProps {
  file: FileRecord | null;
  queue: UseFileQueueReturn;
}

function getQueuePosition(file: FileRecord, queue: UseFileQueueReturn): number {
  const queued = Array.from(queue.files.values()).filter((f) => f.status === 'QUEUED');
  return queued.findIndex((f) => f.fileId === file.fileId) + 1;
}

export default function FileMainArea({ file, queue }: FileMainAreaProps) {
  if (!file) {
    return <EmptyState onAddFiles={queue.enqueueFiles} />;
  }

  // Queued: waiting in queue
  if (file.status === 'QUEUED') {
    const position = getQueuePosition(file, queue);
    const totalQueued = Array.from(queue.files.values()).filter((f) => f.status === 'QUEUED').length;

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 animate-fade-in">
        <div className="size-12 rounded-full bg-slate-800 flex items-center justify-center">
          <span className="material-symbols-outlined text-slate-400">schedule</span>
        </div>
        <div className="text-center">
          <p className="text-slate-300 font-medium">En cola de procesamiento</p>
          <p className="text-slate-500 text-sm mt-1">{file.fileName}</p>
          {totalQueued > 1 ? (
            <p className="text-slate-600 text-xs mt-2">
              Posición {position} de {totalQueued} en cola
            </p>
          ) : (
            <p className="text-slate-600 text-xs mt-2">
              Esperando slot disponible (máx. 2 archivos simultáneos)
            </p>
          )}
        </div>
      </div>
    );
  }

  // Processing states (yellow)
  if (
    file.status === 'PROFILING' ||
    file.status === 'EXECUTING_BLUEPRINT' ||
    file.status === 'PERSISTING' ||
    file.status === 'SQL_VALIDATING'
  ) {
    return <ProcessingSpinner file={file} />;
  }

  if (file.status === 'BLUEPRINT_READY' || file.status === 'AWAITING_APPROVAL') {
    return <BlueprintReviewFlow file={file} queue={queue} />;
  }

  // Error state
  if (file.status === 'ERROR') {
    const translated = file.error ? translateError(file.error) : null;

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 animate-fade-in">
        <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-red-400">error</span>
        </div>
        <div className="text-center max-w-md">
          <p className="text-red-300 font-bold text-lg">Error al procesar el archivo</p>
          <p className="text-slate-400 text-sm mt-1">{file.fileName}</p>
          {translated ? (
            <div className="mt-3 text-left bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 space-y-1">
              <p className="text-slate-200 text-sm font-medium">{translated.userMessage}</p>
              <p className="text-slate-500 text-xs">{translated.suggestion}</p>
            </div>
          ) : (
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

  if (file.status === 'READY' || file.status === 'VALIDATION_FAILED') {
    return <TabbedFileView file={file} queue={queue} />;
  }

  return null;
}
