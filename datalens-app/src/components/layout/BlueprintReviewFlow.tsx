'use client';

import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import type { FileRecord } from '@/lib/fileQueue';
import type { UseFileQueueReturn } from '@/lib/useFileQueue';
import type { ColumnNormalizationPlan } from '@/lib/pipeline/types';

interface BlueprintReviewFlowProps {
  file: FileRecord;
  queue: UseFileQueueReturn;
}

function buildColumns(rows: Record<string, unknown>[]): ColDef[] {
  return Object.keys(rows[0] ?? {}).map((field) => ({
    field,
    flex: 1,
    minWidth: 140,
    sortable: true,
    filter: true,
    tooltipValueGetter: (params) => String(params.value ?? ''),
  }));
}

function transformOptions(column: ColumnNormalizationPlan['transform'][]) {
  return column.map((value) => (
    <option key={value} value={value}>
      {value}
    </option>
  ));
}

function formatActionParams(params: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return '';
  return Object.entries(params)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(' ┬À ');
}

export default function BlueprintReviewFlow({ file, queue }: BlueprintReviewFlowProps) {
  const blueprint = file.draftBlueprint ?? file.approvedBlueprint;
  const originalRows = file.rawData ?? [];
  const normalizedRows = file.normalizedPreview ?? [];
  const originalColumns = useMemo(() => buildColumns(originalRows), [originalRows]);
  const normalizedColumns = useMemo(() => buildColumns(normalizedRows), [normalizedRows]);

  if (!blueprint) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No hay blueprint disponible para revisar.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Revisi├│n del Blueprint</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Revis├í las decisiones estructurales y de normalizaci├│n antes de persistir el dataset.
            El archivo original queda intacto; todo el an├ílisis posterior usar├í el dataset normalizado.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Blueprint v{blueprint.version}
          </span>
          {file.manifest && (
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
              {file.manifest.sheetNames.length} hoja{file.manifest.sheetNames.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr,1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border-dark bg-surface-dark/60 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Archivo original</h3>
                <p className="text-xs text-slate-500">Vista previa de hasta 50 filas antes de normalizar.</p>
              </div>
            </div>
            <div className="ag-theme-alpine-dark h-[280px] rounded-xl overflow-hidden border border-border-dark">
              <AgGridReact
                rowData={originalRows}
                columnDefs={originalColumns}
                defaultColDef={{ resizable: true }}
                domLayout="normal"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border-dark bg-surface-dark/60 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Preview normalizado</h3>
                <p className="text-xs text-slate-500">Resultado proyectado con el blueprint actual.</p>
              </div>
            </div>
            <div className="ag-theme-alpine-dark h-[280px] rounded-xl overflow-hidden border border-border-dark">
              <AgGridReact
                rowData={normalizedRows}
                columnDefs={normalizedColumns}
                defaultColDef={{ resizable: true }}
                domLayout="normal"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border-dark bg-surface-dark/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Acciones estructurales</h3>
            <div className="mt-4 space-y-3">
              {blueprint.structuralPlan.length === 0 && (
                <p className="text-sm text-slate-500">No se detectaron limpiezas estructurales necesarias.</p>
              )}
              {blueprint.structuralPlan.map((action) => (
                <label
                  key={action.id}
                  className="flex items-start gap-3 rounded-xl border border-border-dark bg-background-dark/60 px-3 py-3"
                >
                  <input
                    type="checkbox"
                    checked={action.enabled}
                    onChange={(event) => queue.toggleStructuralAction(file.fileId, action.id, event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100">{action.action}</p>
                    {action.params && Object.keys(action.params).length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">{formatActionParams(action.params as Record<string, unknown>)}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border-dark bg-surface-dark/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Columnas a normalizar</h3>
            <div className="mt-4 space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {blueprint.columnPlan.map((column) => (
                <div key={column.id} className="rounded-xl border border-border-dark bg-background-dark/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-100">{column.sourceColumn}</p>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={column.enabled}
                        onChange={(event) =>
                          queue.handleBlueprintOverride(file.fileId, column.id, { enabled: event.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary"
                      />
                      Activa
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      Nombre destino
                      <input
                        value={column.targetColumn}
                        onChange={(event) =>
                          queue.handleBlueprintOverride(file.fileId, column.id, { targetColumn: event.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                    </label>

                    <label className="text-xs text-slate-500">
                      Tipo Postgres
                      <input
                        value={column.postgresType}
                        onChange={(event) =>
                          queue.handleBlueprintOverride(file.fileId, column.id, {
                            postgresType: event.target.value as ColumnNormalizationPlan['postgresType'],
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                    </label>

                    <label className="text-xs text-slate-500">
                      Transformaci├│n
                      <select
                        value={column.transform}
                        onChange={(event) =>
                          queue.handleBlueprintOverride(file.fileId, column.id, {
                            transform: event.target.value as ColumnNormalizationPlan['transform'],
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-sm text-slate-100 outline-none"
                      >
                        {transformOptions([
                          'identity',
                          'parseDate',
                          'normalizeNumber',
                          'normalizePercentage',
                          'trimSpaces',
                          'capitalizeWords',
                          'fixEncoding',
                          'normalizeNull',
                          'normalizeCategory',
                          'normalizeBoolean',
                          'splitField',
                        ])}
                      </select>
                    </label>

                    <label className="inline-flex items-center gap-2 rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={column.nullable}
                        onChange={(event) =>
                          queue.handleBlueprintOverride(file.fileId, column.id, { nullable: event.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary"
                      />
                      Acepta nulls
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border-dark bg-surface-dark/60 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-100">Persistir dataset normalizado</p>
          <p className="text-xs text-slate-500 mt-1">
            Esto ejecuta el blueprint aprobado, guarda original y normalizado, y corre la validaci├│n SQL final.
          </p>
        </div>
        <button
          onClick={() => queue.confirmAndClean(file.fileId, blueprint)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary/90"
        >
          Aprobar y ejecutar
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

