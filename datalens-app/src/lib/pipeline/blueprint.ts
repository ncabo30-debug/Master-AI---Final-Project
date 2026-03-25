import { z } from 'zod';
import type { SchemaMap } from '@/lib/agents/types';
import type {
  ColumnNormalizationPlan,
  ColumnProfile,
  NormalizationBlueprint,
  PostgresType,
  StatisticalProfile,
  StructuralAction,
  StructuralDiagnosis,
} from './types';

const structuralActionSchema = z.object({
  id: z.string(),
  action: z.enum([
    'remove_rows',
    'set_header_row',
    'drop_subtotals',
    'fill_merged_cells_down',
    'merge_sheets',
    'collapse_multi_row_headers',
    'unpivot',
  ]),
  params: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  source: z.enum(['ai', 'heuristic', 'user_override']),
});

const columnPlanSchema = z.object({
  id: z.string(),
  sourceColumn: z.string(),
  targetColumn: z.string(),
  inferredType: z.enum(['string', 'number', 'date', 'boolean']),
  postgresType: z.enum([
    'TEXT',
    'VARCHAR(100)',
    'VARCHAR(255)',
    'INTEGER',
    'DECIMAL(10,2)',
    'DECIMAL(12,4)',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
  ]),
  transform: z.enum([
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
  ]),
  params: z.record(z.string(), z.unknown()),
  nullable: z.boolean(),
  enabled: z.boolean(),
  anomalyFlags: z.array(z.string()),
  source: z.enum(['ai', 'heuristic', 'user_override']),
});

export const structuralDiagnosisSchema = z.object({
  estructura_limpia: z.boolean(),
  problemas_detectados: z.array(z.string()),
  plan_limpieza: z.array(structuralActionSchema),
});

export const normalizationBlueprintSchema = z.object({
  version: z.number(),
  sessionId: z.string(),
  datasetId: z.string(),
  structuralPlan: z.array(structuralActionSchema),
  columnPlan: z.array(columnPlanSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function defaultPostgresTypeFor(column: ColumnProfile): PostgresType {
  if (column.inferredType === 'date') return 'DATE';
  if (column.inferredType === 'boolean') return 'BOOLEAN';
  if (column.inferredType === 'number') {
    return Number.isInteger(column.numericSummary?.avg ?? 0) ? 'INTEGER' : 'DECIMAL(10,2)';
  }
  return column.uniqueCount <= 100 ? 'VARCHAR(255)' : 'TEXT';
}

function defaultTransformFor(column: ColumnProfile): ColumnNormalizationPlan['transform'] {
  if (column.inferredType === 'date') return 'parseDate';
  if (column.inferredType === 'number') return 'normalizeNumber';
  if (column.inferredType === 'boolean') return 'normalizeBoolean';
  return column.nullRatio > 0 ? 'trimSpaces' : 'identity';
}

export function buildHeuristicStructuralDiagnosis(profile: StatisticalProfile): StructuralDiagnosis {
  const plan: StructuralAction[] = [];
  const issues: string[] = [];

  if (profile.structural.leadingMetadataRowCount > 0) {
    issues.push('metadatos_en_filas_iniciales');
    plan.push({
      id: 'remove-leading-metadata',
      action: 'remove_rows',
      params: {
        rowIndexes: Array.from({ length: profile.structural.leadingMetadataRowCount }, (_, index) => index),
      },
      enabled: true,
      source: 'heuristic',
    });
  }

  if (profile.structural.estimatedHeaderRow > 0) {
    issues.push('encabezado_desplazado');
    plan.push({
      id: 'set-header-row',
      action: 'set_header_row',
      params: { rowIndex: profile.structural.estimatedHeaderRow },
      enabled: true,
      source: 'heuristic',
    });
  }

  if (profile.structural.subtotalRowIndexes.length > 0) {
    issues.push('subtotales_intercalados');
    plan.push({
      id: 'drop-subtotals',
      action: 'drop_subtotals',
      params: { rowIndexes: profile.structural.subtotalRowIndexes },
      enabled: true,
      source: 'heuristic',
    });
  }

  if (profile.structural.hasMergedCells) {
    issues.push('celdas_combinadas');
    plan.push({
      id: 'fill-merged-cells',
      action: 'fill_merged_cells_down',
      params: {},
      enabled: true,
      source: 'heuristic',
    });
  }

  return {
    estructura_limpia: plan.length === 0,
    problemas_detectados: issues,
    plan_limpieza: plan,
  };
}

export function buildHeuristicBlueprint(
  sessionId: string,
  datasetId: string,
  profile: StatisticalProfile,
  diagnosis: StructuralDiagnosis
): NormalizationBlueprint {
  const now = new Date().toISOString();

  return {
    version: 2,
    sessionId,
    datasetId,
    structuralPlan: diagnosis.plan_limpieza,
    columnPlan: profile.columns.map((column) => ({
      id: `col-${column.name}`,
      sourceColumn: column.name,
      targetColumn: column.name.trim().replace(/\s+/g, '_').toLowerCase(),
      inferredType: column.inferredType,
      postgresType: defaultPostgresTypeFor(column),
      transform: defaultTransformFor(column),
      params: {},
      nullable: column.nullRatio > 0,
      enabled: true,
      anomalyFlags: [],
      source: 'heuristic',
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function blueprintToSchema(blueprint: NormalizationBlueprint): SchemaMap {
  return blueprint.columnPlan.reduce<SchemaMap>((acc, column) => {
    acc[column.targetColumn] = {
      type: column.inferredType === 'boolean' ? 'string' : column.inferredType,
      semantic_role:
        column.inferredType === 'number'
          ? 'metric'
          : column.inferredType === 'date'
          ? 'timeline'
          : column.targetColumn.includes('id')
          ? 'id'
          : 'dimension',
      domain: column.targetColumn.replace(/_/g, ' '),
      analysis_variables:
        column.inferredType === 'number'
          ? ['sumar', 'promediar', 'comparar']
          : column.inferredType === 'date'
          ? ['evolución temporal']
          : ['agrupar', 'filtrar'],
    };
    return acc;
  }, {});
}

export function applyBlueprintColumnOverride(
  blueprint: NormalizationBlueprint,
  columnId: string,
  patch: Partial<ColumnNormalizationPlan>
): NormalizationBlueprint {
  return {
    ...blueprint,
    updatedAt: new Date().toISOString(),
    columnPlan: blueprint.columnPlan.map((column) =>
      column.id === columnId
        ? {
            ...column,
            ...patch,
            source: 'user_override',
          }
        : column
    ),
  };
}

export function applyStructuralOverride(
  blueprint: NormalizationBlueprint,
  actionId: string,
  enabled: boolean
): NormalizationBlueprint {
  return {
    ...blueprint,
    updatedAt: new Date().toISOString(),
    structuralPlan: blueprint.structuralPlan.map((action) =>
      action.id === actionId
        ? {
            ...action,
            enabled,
            source: 'user_override',
          }
        : action
    ),
  };
}

