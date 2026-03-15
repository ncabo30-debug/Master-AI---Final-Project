'use client';

import { useCallback, useMemo } from 'react';
import type { FileRecord } from '@/lib/fileQueue';
import type { UseFileQueueReturn } from '@/lib/useFileQueue';
import InteractiveSheet from '@/components/InteractiveSheet';

interface SchemaValidationFlowProps {
  file: FileRecord;
  queue: UseFileQueueReturn;
}

export default function SchemaValidationFlow({ file, queue }: SchemaValidationFlowProps) {
  const { fileId } = file;

  const handleSchemaOverride = useCallback(
    (col: string, role: Parameters<typeof queue.handleSchemaOverride>[2]) => {
      queue.handleSchemaOverride(fileId, col, role);
    },
    [queue, fileId]
  );

  const handleSubmitAnswers = useCallback(() => {
    queue.confirmSchema(fileId);
  }, [queue, fileId]);

  // Slice to 50 rows to prevent InteractiveSheet from freezing on large datasets
  const previewData = useMemo(
    () => (file.cleanedData ?? []).slice(0, 50),
    [file.cleanedData]
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 animate-fade-in space-y-6">
      {/* Attention banner */}
      <div className="flex items-start gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
        <span className="material-symbols-outlined text-red-400 shrink-0 mt-0.5">info</span>
        <div>
          <p className="font-semibold text-red-300 text-sm">Este archivo requiere tu atención</p>
          <p className="text-slate-400 text-sm mt-0.5">
            Detectamos las columnas de <span className="font-mono text-slate-300">{file.fileName}</span>.
            Confirmá que los tipos y roles semánticos son correctos antes de continuar el análisis.
          </p>
        </div>
      </div>

      {/* Schema header */}
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 text-xl font-bold">Interacción y Validación</h3>
        <div className="flex items-center gap-2">
          {file.schemaBlueprint && (
            <span className="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full uppercase">
              Blueprint v{file.schemaBlueprint.version}
            </span>
          )}
          <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full uppercase">
            Sincronizado
          </span>
        </div>
      </div>

      {/* Interactive schema sheet — max 50 rows to keep rendering fast */}
      {previewData.length > 0 && (
        <InteractiveSheet
          data={previewData}
          schema={file.schema ?? undefined}
          anomalies={file.dataAnomalies}
          onSchemaOverride={handleSchemaOverride}
        />
      )}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-300 shrink-0 mt-0.5">schedule</span>
          <div>
            <p className="font-semibold text-amber-200 text-sm">Configuracion analitica pendiente</p>
            <p className="text-slate-300 text-sm mt-1">
              La seleccion de dimensiones para agrupar el dashboard se movio a una etapa posterior.
              Primero validamos estructura y roles semanticos; despues conectaremos esa decision con la seleccion final de visualizaciones.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSubmitAnswers}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary/90"
        >
          Continuar al analisis
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
