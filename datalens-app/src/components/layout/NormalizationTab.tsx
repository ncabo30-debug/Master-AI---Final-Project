'use client';

import { useState } from 'react';
import type { ReconciliationReport } from '@/lib/agents/types';

interface NormalizationTabProps {
  rawData: Record<string, unknown>[] | null;
  cleanedData: Record<string, unknown>[] | null;
  reconciliationReport?: ReconciliationReport | null;
}

interface CellDiff {
  column: string;
  rowIndex: number;
  original: string;
  cleaned: string;
}

function diffCells(
  rawData: Record<string, unknown>[],
  cleanedData: Record<string, unknown>[]
): { columnStats: { column: string; corrected: number; clean: number; total: number }[]; cellDiffs: CellDiff[] } {
  if (rawData.length === 0) return { columnStats: [], cellDiffs: [] };

  const columns = Object.keys(rawData[0]);
  const maxRows = Math.min(rawData.length, cleanedData.length);
  const cellDiffs: CellDiff[] = [];

  const columnStats = columns.map((col) => {
    let corrected = 0;
    for (let i = 0; i < maxRows; i++) {
      const rawVal = String(rawData[i][col] ?? '').trim();
      const cleanVal = String(cleanedData[i]?.[col] ?? '').trim();
      if (rawVal !== cleanVal) {
        corrected++;
        if (cellDiffs.length < 100) {
          cellDiffs.push({ column: col, rowIndex: i, original: rawVal, cleaned: cleanVal });
        }
      }
    }
    return { column: col, corrected, clean: maxRows - corrected, total: maxRows };
  });

  return { columnStats, cellDiffs };
}

export default function NormalizationTab({ rawData, cleanedData, reconciliationReport }: NormalizationTabProps) {
  const [showDiffs, setShowDiffs] = useState(false);
  const [showColumnSummary, setShowColumnSummary] = useState(false);

  if (!rawData || !cleanedData) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No hay datos de normalización disponibles.
      </div>
    );
  }

  const { columnStats, cellDiffs } = diffCells(rawData, cleanedData);
  const totalCorrected = columnStats.reduce((s, d) => s + d.corrected, 0);
  const affectedColumns = columnStats.filter((d) => d.corrected > 0).length;
  const columns = cleanedData.length > 0 ? Object.keys(cleanedData[0]) : [];

  // Build a quick lookup: "rowIndex:column" → original value for changed cells
  const changedCellMap = new Map<string, string>();
  for (const diff of cellDiffs) {
    changedCellMap.set(`${diff.rowIndex}:${diff.column}`, diff.original);
  }
  const correctedCols = new Set(columnStats.filter(s => s.corrected > 0).map(s => s.column));

  return (
    <div className="animate-fade-in space-y-6">

      {/* H-10: Reconciliation badge */}
      {reconciliationReport && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          reconciliationReport.passed
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : reconciliationReport.blockingCount > 0
            ? 'bg-red-500/5 border-red-500/20'
            : 'bg-amber-500/5 border-amber-500/20'
        }`}>
          <span className={`material-symbols-outlined text-[20px] ${
            reconciliationReport.passed ? 'text-emerald-400' : reconciliationReport.blockingCount > 0 ? 'text-red-400' : 'text-amber-400'
          }`}>
            {reconciliationReport.passed ? 'verified' : reconciliationReport.blockingCount > 0 ? 'error' : 'warning'}
          </span>
          <div>
            <p className={`font-semibold text-sm ${
              reconciliationReport.passed ? 'text-emerald-300' : reconciliationReport.blockingCount > 0 ? 'text-red-300' : 'text-amber-300'
            }`}>
              {reconciliationReport.passed
                ? `Reconciliación perfecta — ${reconciliationReport.reconciliationRate}% de celdas equivalentes`
                : `Reconciliación: ${reconciliationReport.reconciliationRate}% (${reconciliationReport.blockingCount} bloqueantes)`}
            </p>
            {reconciliationReport.duplicatesRemoved > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">{reconciliationReport.duplicatesRemoved} duplicados eliminados</p>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-border-dark text-center">
          <p className="text-2xl font-bold text-amber-400">{totalCorrected}</p>
          <p className="text-xs text-slate-500 mt-1">Celdas corregidas</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-border-dark text-center">
          <p className="text-2xl font-bold text-blue-400">{affectedColumns}</p>
          <p className="text-xs text-slate-500 mt-1">Columnas afectadas</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-border-dark text-center">
          <p className="text-2xl font-bold text-green-400">{cleanedData.length}</p>
          <p className="text-xs text-slate-500 mt-1">Filas procesadas</p>
        </div>
      </div>

      {/* ═══ Cleaned data table ═══ */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-100">Datos Normalizados</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Vista de los primeros {Math.min(50, cleanedData.length)} registros después de la normalización
            </p>
          </div>
          {totalCorrected > 0 && (
            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
                Corregida
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-slate-800" />
                Sin cambios
              </span>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border-dark bg-slate-900 overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[350px] overflow-y-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-r border-slate-700/50 last:border-r-0 whitespace-nowrap"
                      style={{ borderTop: correctedCols.has(col) ? '3px solid rgb(52 211 153)' : '3px solid rgb(51 65 85)' }}
                    >
                      <div className="flex items-center gap-1.5">
                        {col}
                        {correctedCols.has(col) && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.5 rounded">
                            <span className="material-symbols-outlined text-[10px]">auto_fix_high</span>
                            {columnStats.find(s => s.column === col)?.corrected ?? 0}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {cleanedData.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    {columns.map((col, j) => {
                      const wasChanged = changedCellMap.has(`${i}:${col}`);
                      const originalVal = changedCellMap.get(`${i}:${col}`);
                      const cellVal = String(row[col] ?? '');
                      const isEmpty = row[col] == null || row[col] === '';
                      return (
                        <td
                          key={j}
                          className={`px-4 py-2 text-xs border-r border-slate-800/50 last:border-r-0 font-medium whitespace-nowrap max-w-[200px] truncate ${
                            wasChanged
                              ? 'bg-emerald-500/10 text-emerald-200'
                              : isEmpty
                              ? 'bg-red-500/10 text-red-400 italic'
                              : 'text-slate-300'
                          }`}
                          title={wasChanged ? `Original: ${originalVal}` : cellVal}
                        >
                          {isEmpty ? 'vacío' : cellVal}
                          {wasChanged && (
                            <span className="material-symbols-outlined text-[10px] text-emerald-400 ml-1 align-middle">check</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-800/30 p-2 flex justify-center border-t border-slate-700">
            <span className="text-xs text-slate-500 italic">
              Mostrando {Math.min(50, cleanedData.length)} de {cleanedData.length} filas normalizadas
              {totalCorrected > 0 && ` · ${totalCorrected} celdas corregidas`}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Cell-by-cell diff (accordion) ═══ */}
      {cellDiffs.length > 0 && (
        <div className="rounded-xl border border-border-dark overflow-hidden">
          <button
            onClick={() => setShowDiffs((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800/80 transition-colors text-left"
          >
            <div>
              <span className="font-semibold text-slate-100 text-sm">Cambios Realizados</span>
              <span className="text-xs text-slate-500 ml-2">
                {cellDiffs.length} celda{cellDiffs.length !== 1 ? 's' : ''} modificada{cellDiffs.length !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="material-symbols-outlined text-slate-400 text-sm">
              {showDiffs ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          {showDiffs && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-dark bg-slate-800/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fila</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Columna</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Original</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Normalizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark">
                  {cellDiffs.map((diff, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{diff.rowIndex + 1}</td>
                      <td className="px-4 py-2.5 text-slate-200 font-mono font-medium text-xs">{diff.column}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block px-2 py-0.5 rounded bg-red-500/10 text-red-300 text-xs font-mono border border-red-500/20 max-w-[250px] truncate">
                          {diff.original || <em className="text-slate-600">vacío</em>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-xs font-mono border border-emerald-500/20 max-w-[250px] truncate">
                          {diff.cleaned || <em className="text-slate-600">vacío</em>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Column summary table (accordion) */}
      <div className="rounded-xl border border-border-dark overflow-hidden">
        <button
          onClick={() => setShowColumnSummary((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800/80 transition-colors text-left"
        >
          <div>
            <span className="font-semibold text-slate-100 text-sm">Resumen por Columna</span>
            <span className="text-xs text-slate-500 ml-2">
              {columnStats.filter((s) => s.corrected > 0).length} columna{columnStats.filter((s) => s.corrected > 0).length !== 1 ? 's' : ''} con cambios
            </span>
          </div>
          <span className="material-symbols-outlined text-slate-400 text-sm">
            {showColumnSummary ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {showColumnSummary && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-dark bg-slate-800/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Columna</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Corregidas</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Limpias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {columnStats.map(({ column, corrected, clean }) => (
                  <tr key={column} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-200 font-medium">{column}</td>
                    <td className="px-4 py-3">
                      {corrected > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <span className="material-symbols-outlined text-xs">auto_fix_high</span>
                          Corregido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          Limpio
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {corrected > 0 ? (
                        <span className="text-amber-400 font-medium">{corrected}</span>
                      ) : (
                        <span className="text-slate-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-green-400 font-medium">{clean}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
