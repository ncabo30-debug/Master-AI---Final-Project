'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type FocusEvent } from 'react';
import type { FileRecord } from '@/lib/fileQueue';
import type { UseFileQueueReturn } from '@/lib/useFileQueue';
import { executeStructuralPlan } from '@/lib/transformations/structuralExecutor';
import { executeColumnBlueprint } from '@/lib/transformations/executor';
import type {
  ColumnNormalizationPlan,
  ColumnTransform,
  NormalizationBlueprint,
  StructuralAction,
} from '@/lib/pipeline/types';

interface BlueprintReviewFlowProps {
  file: FileRecord;
  queue: UseFileQueueReturn;
}

interface ExamplePair {
  before: string;
  after: string;
}

interface ChangeSummary {
  plan: ColumnNormalizationPlan;
  changeCount: number;
  examples: ExamplePair[];
  reviewNeeded: boolean;
  message: string;
}

const TRANSFORM_LABELS: Record<ColumnTransform, string> = {
  identity: 'Dejar como esta',
  parseDate: 'Unificar formato de fecha',
  normalizeNumber: 'Ordenar montos y cantidades',
  normalizePercentage: 'Unificar porcentajes',
  trimSpaces: 'Corregir espacios sobrantes',
  capitalizeWords: 'Corregir mayusculas y nombres',
  fixEncoding: 'Corregir caracteres raros',
  normalizeNull: 'Unificar vacios',
  normalizeCategory: 'Unificar nombres equivalentes',
  normalizeBoolean: 'Traducir si/no a verdadero o falso',
  splitField: 'Separar un campo en varias partes',
};

function humanizeLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'Vacio';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'Vacio';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isMeaningfullyDifferent(before: unknown, after: unknown): boolean {
  return formatValue(before) !== formatValue(after);
}

function describeTransform(plan: ColumnNormalizationPlan): string {
  switch (plan.transform) {
    case 'parseDate':
      return 'Vamos a dejar las fechas en un formato consistente para que despues se puedan analizar sin ambiguedad.';
    case 'normalizeNumber':
      return 'Vamos a limpiar separadores y simbolos para que montos o cantidades queden listos para calcular.';
    case 'normalizePercentage':
      return 'Vamos a dejar los porcentajes en un formato consistente.';
    case 'trimSpaces':
      return 'Vamos a quitar espacios de mas para evitar diferencias invisibles entre valores.';
    case 'capitalizeWords':
      return 'Vamos a normalizar la escritura para que nombres y categorias queden prolijos.';
    case 'fixEncoding':
      return 'Vamos a corregir caracteres rotos o mal codificados.';
    case 'normalizeNull':
      return 'Vamos a unificar formas distintas de representar valores vacios.';
    case 'normalizeCategory':
      return 'Vamos a unificar variantes que significan lo mismo para no partir los resultados.';
    case 'normalizeBoolean':
      return 'Vamos a traducir respuestas tipo si/no a un formato consistente.';
    case 'splitField':
      return 'Vamos a separar un campo combinado en partes mas faciles de usar.';
    default:
      return 'No vemos cambios de formato importantes en esta columna.';
  }
}

function describeStructuralProblem(problem: string): string {
  switch (problem) {
    case 'metadatos_en_filas_iniciales':
      return 'Hay filas al inicio que no pertenecen a la tabla principal.';
    case 'encabezado_desplazado':
    case 'encabezado_en_fila_4':
      return 'El titulo de las columnas no estaba donde normalmente se espera.';
    case 'subtotales_intercalados':
      return 'Hay filas de totales o subtotales mezcladas con los datos.';
    case 'celdas_combinadas':
      return 'Hay celdas combinadas que conviene completar para que cada fila quede autosuficiente.';
    default:
      return humanizeLabel(problem);
  }
}

function describeStructuralAction(action: StructuralAction): { title: string; detail: string } {
  switch (action.action) {
    case 'remove_rows': {
      const rows = Array.isArray(action.params.rowIndexes)
        ? action.params.rowIndexes
        : Array.isArray(action.params.row_numbers)
          ? action.params.row_numbers
          : Array.isArray(action.params.rows)
            ? action.params.rows
            : [];
      return {
        title: 'Excluir filas que no pertenecen a la tabla',
        detail:
          rows.length > 0
            ? `Se apartaran ${rows.length} filas para que la tabla quede limpia.`
            : 'Se apartaran filas que no pertenecen al conjunto principal.',
      };
    }
    case 'set_header_row':
      return {
        title: 'Usar otra fila como encabezado',
        detail: `El sistema detecto que los nombres de las columnas empiezan en la fila ${(Number(action.params.rowIndex ?? 0) + 1).toString()}.`,
      };
    case 'drop_subtotals':
      return {
        title: 'Quitar subtotales o totales intermedios',
        detail: 'Asi evitamos que los resultados se dupliquen al analizar el archivo.',
      };
    case 'fill_merged_cells_down':
      return {
        title: 'Completar celdas combinadas',
        detail: 'El valor visible se repetira hacia abajo para que cada fila quede completa.',
      };
    case 'collapse_multi_row_headers':
      return {
        title: 'Unir encabezados partidos en varias filas',
        detail: 'Se consolidaran varios titulos en uno solo por columna.',
      };
    case 'merge_sheets':
      return {
        title: 'Unir hojas compatibles',
        detail: 'Las hojas con la misma estructura se consolidaran en una sola tabla.',
      };
    case 'unpivot':
      return {
        title: 'Reordenar una tabla pivoteada',
        detail: 'Se convertira a un formato mas facil de consultar y graficar.',
      };
    default:
      return {
        title: humanizeLabel(action.action),
        detail: 'Hay una accion estructural adicional sugerida por el sistema.',
      };
  }
}

function buildPreviewTableColumns(rows: Record<string, unknown>[]): string[] {
  const columns = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (columns.size < 8) columns.add(key);
    });
  });
  return Array.from(columns);
}

function buildChangeSummaries(
  beforeRows: Record<string, unknown>[],
  afterRows: Record<string, unknown>[],
  blueprint: NormalizationBlueprint
): ChangeSummary[] {
  return blueprint.columnPlan
    .filter((plan) => plan.enabled)
    .map((plan) => {
      let changeCount = 0;
      const examples: ExamplePair[] = [];

      beforeRows.forEach((beforeRow, index) => {
        const afterRow = afterRows[index] ?? {};
        const beforeValue = beforeRow[plan.sourceColumn];
        const afterValue = plan.transform === 'splitField' ? afterRow : afterRow[plan.targetColumn];

        if (!isMeaningfullyDifferent(beforeValue, afterValue)) {
          return;
        }

        changeCount += 1;
        if (examples.length >= 4) {
          return;
        }

        const pair = {
          before: formatValue(beforeValue),
          after: formatValue(afterValue),
        };

        const duplicated = examples.some(
          (example) => example.before === pair.before && example.after === pair.after
        );

        if (!duplicated) {
          examples.push(pair);
        }
      });

      const reviewNeeded =
        plan.transform !== 'identity' ||
        plan.targetColumn !== plan.sourceColumn ||
        plan.anomalyFlags.length > 0;

      return {
        plan,
        changeCount,
        examples,
        reviewNeeded,
        message: describeTransform(plan),
      };
    })
    .filter((summary) => summary.reviewNeeded)
    .sort((left, right) => {
      const scoreLeft = left.changeCount + left.plan.anomalyFlags.length * 5;
      const scoreRight = right.changeCount + right.plan.anomalyFlags.length * 5;
      return scoreRight - scoreLeft;
    });
}

function PreviewTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Record<string, unknown>[];
}) {
  const columns = useMemo(() => buildPreviewTableColumns(rows), [rows]);

  return (
    <section className="rounded-2xl border border-border-dark bg-surface-dark/70 p-5">
      <div className="mb-4">
        <h3 className="text-base font-bold text-slate-100">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>

      {rows.length === 0 || columns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
          Todavia no hay datos suficientes para mostrar una vista previa.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-dark">
          <div className="max-h-[360px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="border-b border-border-dark px-3 py-2 font-semibold text-slate-200"
                    >
                      {humanizeLabel(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`} className="odd:bg-slate-900/40">
                    {columns.map((column) => (
                      <td
                        key={`${rowIndex}-${column}`}
                        className="max-w-[220px] border-b border-border-dark px-3 py-2 text-slate-300"
                      >
                        <span className="block truncate" title={formatValue(row[column])}>
                          {formatValue(row[column])}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border-dark bg-surface-dark/70 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-100">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </div>
  );
}

export default function BlueprintReviewFlow({ file, queue }: BlueprintReviewFlowProps) {
  const blueprint = file.approvedBlueprint ?? file.draftBlueprint;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [paramDrafts, setParamDrafts] = useState<Record<string, string>>({});

  const derivedPreview = useMemo(() => {
    if (!file.workbook || !blueprint) {
      return {
        structuredRows: [] as Record<string, unknown>[],
        normalizedRows: file.normalizedPreview ?? [],
      };
    }

    const structuralResult = executeStructuralPlan(file.workbook, blueprint.structuralPlan);
    const structuredRows = structuralResult.cleanedRows.slice(0, 50);
    const normalizedRows =
      file.normalizedPreview && file.normalizedPreview.length > 0
        ? file.normalizedPreview
        : executeColumnBlueprint(structuredRows, blueprint);

    return {
      structuredRows,
      normalizedRows,
    };
  }, [blueprint, file.normalizedPreview, file.workbook]);

  const changeSummaries = useMemo(() => {
    if (!blueprint) return [];
    return buildChangeSummaries(derivedPreview.structuredRows, derivedPreview.normalizedRows, blueprint);
  }, [blueprint, derivedPreview.normalizedRows, derivedPreview.structuredRows]);

  const reviewCount = useMemo(() => {
    if (!blueprint) return 0;
    const structuralReviews = blueprint.structuralPlan.filter((action) => action.enabled).length;
    return structuralReviews + changeSummaries.length;
  }, [blueprint, changeSummaries.length]);

  useEffect(() => {
    if (!blueprint) {
      setParamDrafts({});
      return;
    }

    setParamDrafts(
      Object.fromEntries(
        blueprint.columnPlan.map((plan) => [plan.id, JSON.stringify(plan.params ?? {}, null, 2)])
      )
    );
  }, [blueprint]);

  if (!blueprint || !file.statisticalProfile) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="rounded-2xl border border-border-dark bg-surface-dark/70 px-6 py-8 text-center">
          <p className="text-base font-semibold text-slate-100">Todavia estamos armando la propuesta.</p>
          <p className="mt-2 text-sm text-slate-400">En unos segundos vas a ver la revision del archivo.</p>
        </div>
      </div>
    );
  }

  const handlePlanPatch = async (planId: string, patch: Partial<ColumnNormalizationPlan>) => {
    setSaveError(null);
    try {
      await queue.handleBlueprintOverride(file.fileId, planId, patch);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No pudimos guardar el cambio.');
    }
  };

  const handleParamsBlur = async (planId: string, event: FocusEvent<HTMLTextAreaElement>) => {
    const value = event.target.value.trim();
    try {
      const parsed = value.length === 0 ? {} : JSON.parse(value);
      await handlePlanPatch(planId, { params: parsed as Record<string, unknown> });
    } catch {
      setSaveError('Los parametros avanzados deben tener formato JSON valido.');
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-border-dark bg-gradient-to-br from-slate-900 via-surface-dark to-slate-950 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
                Revision antes de guardar
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-100">Revisa lo que vamos a ajustar en tu archivo</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Tu archivo original queda guardado como respaldo. En esta pantalla te mostramos solamente la tabla
                detectada y como quedaria lista para analizar.
              </p>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-slate-300">
              <p className="font-semibold text-slate-100">{file.fileName}</p>
              <p className="mt-1 text-slate-400">
                {file.manifest?.sourceType?.toUpperCase() ?? 'ARCHIVO'} / {file.manifest?.sheetNames.length ?? 1} hoja
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <KpiCard
            label="Filas detectadas"
            value={file.statisticalProfile.rowCount.toLocaleString()}
            hint="Cantidad de registros que encontramos para analizar."
          />
          <KpiCard
            label="Columnas detectadas"
            value={file.statisticalProfile.columnCount.toString()}
            hint="Campos que reconocimos dentro de la tabla principal."
          />
          <KpiCard
            label="Requieren tu revision"
            value={reviewCount.toString()}
            hint="Cambios o decisiones importantes que te conviene confirmar."
          />
        </section>

        {(file.diagnosis?.problemas_detectados.length ?? 0) > 0 && (
          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-amber-500/10 p-2 text-amber-300">
                <span className="material-symbols-outlined text-base">warning</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Lo que encontramos en el archivo</h2>
                <div className="mt-3 flex flex-col gap-2 text-sm text-slate-300">
                  {file.diagnosis?.problemas_detectados.map((problem) => (
                    <p key={problem}>- {describeStructuralProblem(problem)}</p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {blueprint.structuralPlan.filter((action) => action.enabled).length > 0 && (
          <section className="rounded-2xl border border-border-dark bg-surface-dark/70 p-5">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-100">Cambios de estructura sugeridos</h2>
              <p className="mt-1 text-sm text-slate-400">
                Estos ajustes ordenan la tabla antes de normalizar los valores.
              </p>
            </div>

            <div className="grid gap-3">
              {blueprint.structuralPlan.map((action) => {
                const description = describeStructuralAction(action);
                return (
                  <label
                    key={action.id}
                    className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-border-dark bg-slate-900/40 p-4"
                  >
                    <div className="max-w-3xl">
                      <p className="font-semibold text-slate-100">{description.title}</p>
                      <p className="mt-1 text-sm text-slate-400">{description.detail}</p>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          action.enabled
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {action.enabled ? 'Aplicar' : 'Omitir'}
                      </span>
                      <input
                        type="checkbox"
                        checked={action.enabled}
                        onChange={(event) => {
                          void queue.toggleStructuralAction(file.fileId, action.id, event.target.checked);
                        }}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border-dark bg-surface-dark/70 p-5">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-100">Cambios sugeridos en los datos</h2>
            <p className="mt-1 text-sm text-slate-400">
              Te mostramos solo los ajustes que pueden cambiar el valor visible o que conviene revisar antes de aprobar.
            </p>
          </div>

          {changeSummaries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-5 py-8 text-center">
              <p className="font-semibold text-slate-200">No encontramos cambios visibles importantes.</p>
              <p className="mt-2 text-sm text-slate-400">
                Si queres, igual podes abrir las opciones avanzadas para revisar la configuracion tecnica.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {changeSummaries.map((summary) => (
                <article key={summary.plan.id} className="rounded-2xl border border-border-dark bg-slate-900/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-slate-100">
                        {humanizeLabel(summary.plan.sourceColumn)}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">{summary.message}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {TRANSFORM_LABELS[summary.plan.transform]}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
                      {summary.changeCount} cambios visibles en la muestra
                    </span>
                    {summary.plan.anomalyFlags.map((flag) => (
                      <span
                        key={flag}
                        className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-300"
                      >
                        {humanizeLabel(flag)}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 space-y-3">
                    {summary.examples.length > 0 ? (
                      summary.examples.map((example) => (
                        <div
                          key={`${summary.plan.id}-${example.before}-${example.after}`}
                          className="rounded-xl border border-border-dark bg-slate-950/60 p-3"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ejemplo</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                            <div className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-300">
                              {example.before}
                            </div>
                            <span className="text-center text-slate-500">{'->'}</span>
                            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300">
                              {example.after}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-400">
                        En esta muestra no se ven ejemplos concretos, pero la columna igual quedara preparada con esta regla.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-xl border border-border-dark bg-slate-950/50 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">Aplicar este ajuste</p>
                      <p className="text-xs text-slate-500">Si lo desactivas, esta columna queda tal como vino.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={summary.plan.enabled}
                      onChange={(event) => {
                        void handlePlanPatch(summary.plan.id, { enabled: event.target.checked });
                      }}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <PreviewTable
            title="Datos detectados"
            subtitle="Asi quedo la tabla despues de ordenar encabezados, filas vacias y estructura."
            rows={derivedPreview.structuredRows}
          />
          <PreviewTable
            title="Como quedaran listos para analizar"
            subtitle="Esta es la version estandarizada que usaran el chat, el dashboard y los analisis posteriores."
            rows={derivedPreview.normalizedRows}
          />
        </section>

        <details className="rounded-2xl border border-border-dark bg-surface-dark/70 p-5">
          <summary className="cursor-pointer list-none text-base font-bold text-slate-100">
            Opciones avanzadas
          </summary>
          <p className="mt-2 text-sm text-slate-400">
            Esta seccion es para ajustes tecnicos. Si sos usuario de negocio, podes ignorarla y usar solo la revision de arriba.
          </p>

          {saveError && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {saveError}
            </div>
          )}

          <div className="mt-5 grid gap-4">
            {blueprint.columnPlan.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-border-dark bg-slate-900/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-100">{humanizeLabel(plan.sourceColumn)}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Fuente: {plan.source === 'user_override' ? 'Ajustado manualmente' : 'Sugerido por el sistema'}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={plan.enabled}
                      onChange={(event) => {
                        void handlePlanPatch(plan.id, { enabled: event.target.checked });
                      }}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                    />
                    Activa
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-300">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Nombre destino
                    </span>
                    <input
                      defaultValue={plan.targetColumn}
                      onBlur={(event) => {
                        void handlePlanPatch(plan.id, { targetColumn: event.target.value.trim() || plan.targetColumn });
                      }}
                      className="w-full rounded-xl border border-border-dark bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-primary"
                    />
                  </label>

                  <label className="text-sm text-slate-300">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Transformacion
                    </span>
                    <select
                      value={plan.transform}
                      onChange={(event) => {
                        void handlePlanPatch(plan.id, {
                          transform: event.target.value as ColumnTransform,
                        });
                      }}
                      className="w-full rounded-xl border border-border-dark bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-primary"
                    >
                      {Object.entries(TRANSFORM_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-slate-300">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Tipo Postgres
                    </span>
                    <input
                      defaultValue={plan.postgresType}
                      onBlur={(event) => {
                        void handlePlanPatch(plan.id, {
                          postgresType: event.target.value as ColumnNormalizationPlan['postgresType'],
                        });
                      }}
                      className="w-full rounded-xl border border-border-dark bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-primary"
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-border-dark bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={plan.nullable}
                      onChange={(event) => {
                        void handlePlanPatch(plan.id, { nullable: event.target.checked });
                      }}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                    />
                    Permitir vacios
                  </label>
                </div>

                {plan.anomalyFlags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {plan.anomalyFlags.map((flag) => (
                      <span
                        key={flag}
                        className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300"
                      >
                        {humanizeLabel(flag)}
                      </span>
                    ))}
                  </div>
                )}

                <label className="mt-4 block text-sm text-slate-300">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Parametros avanzados
                  </span>
                  <textarea
                    value={paramDrafts[plan.id] ?? '{}'}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                      setParamDrafts((current) => ({
                        ...current,
                        [plan.id]: event.target.value,
                      }));
                    }}
                    onBlur={(event) => {
                      void handleParamsBlur(plan.id, event);
                    }}
                    rows={4}
                    className="w-full rounded-xl border border-border-dark bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-primary"
                  />
                </label>
              </article>
            ))}
          </div>
        </details>

        <div className="sticky bottom-0 z-10 -mx-6 border-t border-border-dark bg-slate-950/90 px-6 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-100">Cuando apruebes, guardaremos la version normalizada.</p>
              <p className="text-xs text-slate-500">
                Todos los analisis posteriores van a usar esa version limpia. El archivo original queda como respaldo.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => queue.removeFile(file.fileId)}
                className="rounded-xl border border-border-dark px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => queue.confirmAndClean(file.fileId, blueprint)}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
              >
                Aprobar y continuar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
