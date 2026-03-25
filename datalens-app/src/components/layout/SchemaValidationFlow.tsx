'use client';

import { useCallback, useMemo, useState } from 'react';
import type { FileRecord } from '@/lib/fileQueue';
import type { UseFileQueueReturn } from '@/lib/useFileQueue';
import InteractiveSheet from '@/components/InteractiveSheet';

interface SchemaValidationFlowProps {
  file: FileRecord;
  queue: UseFileQueueReturn;
}

export default function SchemaValidationFlow({ file, queue }: SchemaValidationFlowProps) {
  const { fileId } = file;

  // H-8: Track approved issue IDs as a Set — single source of truth for panel + table
  const [approvedSet, setApprovedSet] = useState<Set<string>>(
    new Set(file.issueReport?.issues.map(i => i.id) ?? [])
  );

  const toggleIssue = useCallback((id: string) => {
    setApprovedSet(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const approveAll = useCallback(() => {
    setApprovedSet(new Set(file.issueReport?.issues.map(i => i.id) ?? []));
  }, [file.issueReport]);

  const ignoreAll = useCallback(() => {
    setApprovedSet(new Set());
  }, []);

  const handleSchemaOverride = useCallback(
    (col: string, role: Parameters<typeof queue.handleSchemaOverride>[2]) => {
      queue.handleSchemaOverride(fileId, col, role);
    },
    [queue, fileId]
  );

  const handleConfirmAndClean = useCallback(() => {
    queue.confirmAndClean(fileId);
  }, [queue, fileId, approvedSet]);

  // H-8: Show rawData (original) — not cleanedData
  const previewData = useMemo(
    () => (file.rawData ?? []).slice(0, 50),
    [file.rawData]
  );

  const issueReport = file.issueReport;
  const approvedCount = approvedSet.size;
  const ignoredCount = (issueReport?.totalIssues ?? 0) - approvedCount;

  // Panel shows: format issues, type mismatches, and cell-level null placeholders.
  // Outliers and duplicates are excluded here (shown elsewhere or in a later phase).
  const columnIssues = useMemo(
    () => issueReport?.issues.filter(i =>
      i.column !== '*' &&
      (i.kind === 'format' || i.kind === 'type_mismatch' ||
       (i.kind === 'null' && i.rowIndex !== undefined))
    ) ?? [],
    [issueReport]
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
            {issueReport && issueReport.totalIssues > 0
              ? ` Se encontraron ${issueReport.totalIssues} problemas. Revisá los datos originales y confirmá las correcciones.`
              : ' Confirmá que los tipos y roles semánticos son correctos antes de continuar el análisis.'}
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

      {/* ══ Issue Preview Panel ══ */}
      {columnIssues.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-100">Problemas Detectados</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {columnIssues.length} problema{columnIssues.length !== 1 ? 's' : ''} — seleccioná cuáles corregir antes de normalizar
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={approveAll}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition"
              >
                Aprobar todos
              </button>
              <button
                onClick={ignoreAll}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-400 border border-slate-600 hover:bg-slate-700 transition"
              >
                Ignorar todos
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border-dark">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-dark bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-10"></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Columna</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Valor original</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acción propuesta</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-12">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {columnIssues.map((issue) => {
                  const isApproved = approvedSet.has(issue.id);
                  const originalVal = issue.value != null
                    ? String(issue.value)
                    : issue.rowIndex != null
                    ? String(file.rawData?.[issue.rowIndex]?.[issue.column] ?? '—')
                    : '—';
                  const rowLabel = issue.rowIndex != null ? `fila ${issue.rowIndex + 1}` : null;

                  return (
                    <tr
                      key={issue.id}
                      className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${isApproved ? '' : 'opacity-50'}`}
                      onClick={() => toggleIssue(issue.id)}
                    >
                      <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isApproved}
                          onChange={() => toggleIssue(issue.id)}
                          className="w-4 h-4 rounded border-slate-600 text-primary focus:ring-primary/50"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col">
                          <span className="font-mono text-slate-200 font-medium text-xs">{issue.column}</span>
                          {rowLabel && <span className="text-[10px] text-slate-500">{rowLabel}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block px-2 py-0.5 rounded bg-red-500/10 text-red-300 text-xs font-mono border border-red-500/20 max-w-[200px] truncate">
                          {originalVal || <em className="text-slate-600">vacío</em>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-[280px]">
                        {issue.normalizedValue ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-300 font-mono border border-red-500/20 max-w-[120px] truncate">
                              {String(issue.value ?? originalVal)}
                            </span>
                            <span className="text-slate-500">→</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/20">
                              {issue.normalizedValue}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            <span className="text-emerald-400 font-medium">→</span>{' '}
                            {issue.suggestion}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`material-symbols-outlined text-[16px] ${
                          issue.severity === 'error' ? 'text-red-400' :
                          issue.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                        }`}>
                          {issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* H-7+H-8: Show original data with issue highlights (controlled mode) */}
      {previewData.length > 0 && (
        <InteractiveSheet
          data={previewData}
          schema={file.schema ?? undefined}
          anomalies={file.dataAnomalies}
          issueReport={file.issueReport}
          controlledApprovedIds={approvedSet}
          onToggleIssue={toggleIssue}
          onSchemaOverride={handleSchemaOverride}
        />
      )}

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-300 shrink-0 mt-0.5">schedule</span>
          <div>
            <p className="font-semibold text-amber-200 text-sm">Configuración analítica pendiente</p>
            <p className="text-slate-300 text-sm mt-1">
              La selección de dimensiones para agrupar el dashboard se movió a una etapa posterior.
              Primero validamos estructura y roles semánticos; después conectaremos esa decisión con la selección final de visualizaciones.
            </p>
          </div>
        </div>
      </div>

      {/* H-8: Issue summary + confirm button */}
      <div className="flex items-center justify-between">
        {issueReport && issueReport.totalIssues > 0 ? (
          <p className="text-sm text-slate-400">
            Se encontraron <strong className="text-slate-200">{issueReport.totalIssues}</strong> problemas.
            Se corregirán <strong className="text-emerald-300">{approvedCount}</strong>.
            {ignoredCount > 0 && <> Se ignorarán <strong className="text-amber-300">{ignoredCount}</strong>.</>}
          </p>
        ) : (
          <div />
        )}

        <button
          onClick={handleConfirmAndClean}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary/90"
        >
          {issueReport && issueReport.totalIssues > 0 ? 'Confirmar y normalizar' : 'Continuar al análisis'}
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </div>

      {/* H-10: Reconciliation result (shown after cleaning completes) */}
      {file.reconciliationReport && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${
          file.reconciliationReport.passed
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : file.reconciliationReport.blockingCount > 0
            ? 'bg-red-500/5 border-red-500/20'
            : 'bg-amber-500/5 border-amber-500/20'
        }`}>
          <span className={`material-symbols-outlined shrink-0 mt-0.5 ${
            file.reconciliationReport.passed ? 'text-emerald-400' : file.reconciliationReport.blockingCount > 0 ? 'text-red-400' : 'text-amber-400'
          }`}>
            {file.reconciliationReport.passed ? 'verified' : file.reconciliationReport.blockingCount > 0 ? 'error' : 'warning'}
          </span>
          <div>
            <p className={`font-semibold text-sm ${
              file.reconciliationReport.passed ? 'text-emerald-300' : file.reconciliationReport.blockingCount > 0 ? 'text-red-300' : 'text-amber-300'
            }`}>
              {file.reconciliationReport.passed
                ? 'Datos verificados — todos los valores reconcilian con el original'
                : `Reconciliación: ${file.reconciliationReport.reconciliationRate}%`}
            </p>
            {file.reconciliationReport.discrepancies.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {file.reconciliationReport.discrepancies.slice(0, 5).map((d, i) => (
                  <li key={i}>
                    <span className="font-mono text-slate-300">{d.column}</span> fila {d.rowIndex}: {d.reason}
                  </li>
                ))}
                {file.reconciliationReport.discrepancies.length > 5 && (
                  <li className="italic">...y {file.reconciliationReport.discrepancies.length - 5} más</li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
