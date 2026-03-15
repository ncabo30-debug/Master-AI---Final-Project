import type { FileRecord } from '@/lib/fileQueue';
import { FILE_STATUS_LABEL } from '@/lib/fileQueue';

interface ProcessingSpinnerProps {
  file: FileRecord;
}

export default function ProcessingSpinner({ file }: ProcessingSpinnerProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-fade-in">
      <div className="size-16 border-4 border-slate-700 border-t-primary rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-lg font-bold text-slate-100">{FILE_STATUS_LABEL[file.status]}</p>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">
          {file.fileName}
        </p>
      </div>
    </div>
  );
}
