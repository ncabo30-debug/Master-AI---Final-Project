import type { SchemaMap } from '@/lib/agents/types';

export type DatasetStatus =
  | 'UPLOADED'
  | 'PROFILING'
  | 'BLUEPRINT_READY'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING_BLUEPRINT'
  | 'PERSISTING'
  | 'SQL_VALIDATING'
  | 'READY'
  | 'VALIDATION_FAILED'
  | 'ERROR';

export type SourceFileType = 'csv' | 'xlsx' | 'xls';
export type ColumnInferredType = 'string' | 'number' | 'date' | 'boolean';
export type PostgresType =
  | 'TEXT'
  | 'VARCHAR(100)'
  | 'VARCHAR(255)'
  | 'INTEGER'
  | 'DECIMAL(10,2)'
  | 'DECIMAL(12,4)'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIMESTAMP';

export interface RawSheet {
  name: string;
  rawRows: string[][];
  mergedRanges: string[];
}

export interface RawWorkbook {
  sourceFile: string;
  sourceType: SourceFileType;
  sheetNames: string[];
  sheets: RawSheet[];
}

export interface DatasetManifest {
  datasetId: string;
  tenantId: string;
  sourceFile: string;
  sourceType: SourceFileType;
  sheetNames: string[];
  status: DatasetStatus;
  originalHash: string;
  approvedBlueprintVersion: number | null;
  normalizedTableName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnProfile {
  name: string;
  inferredType: ColumnInferredType;
  nullRatio: number;
  uniqueCount: number;
  sampleValues: string[];
  numericSummary?: {
    min: number;
    max: number;
    avg: number;
    sum: number;
  };
  dateSummary?: {
    min: string;
    max: string;
  };
}

export interface StructuralProfile {
  sheetCount: number;
  primarySheetName: string;
  estimatedHeaderRow: number;
  leadingMetadataRowCount: number;
  emptyRowIndexes: number[];
  shortRowIndexes: number[];
  subtotalRowIndexes: number[];
  hasMergedCells: boolean;
  compatibleSheetNames: string[];
}

export interface StatisticalProfile {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  structural: StructuralProfile;
}

export type StructuralActionType =
  | 'remove_rows'
  | 'set_header_row'
  | 'drop_subtotals'
  | 'fill_merged_cells_down'
  | 'merge_sheets'
  | 'collapse_multi_row_headers'
  | 'unpivot';

export interface StructuralAction {
  id: string;
  action: StructuralActionType;
  params: Record<string, unknown>;
  enabled: boolean;
  source: 'ai' | 'heuristic' | 'user_override';
}

export interface StructuralDiagnosis {
  estructura_limpia: boolean;
  problemas_detectados: string[];
  plan_limpieza: StructuralAction[];
}

export type ColumnTransform =
  | 'identity'
  | 'parseDate'
  | 'normalizeNumber'
  | 'normalizePercentage'
  | 'trimSpaces'
  | 'capitalizeWords'
  | 'fixEncoding'
  | 'normalizeNull'
  | 'normalizeCategory'
  | 'normalizeBoolean'
  | 'splitField';

export interface ColumnNormalizationPlan {
  id: string;
  sourceColumn: string;
  targetColumn: string;
  inferredType: ColumnInferredType;
  postgresType: PostgresType;
  transform: ColumnTransform;
  params: Record<string, unknown>;
  nullable: boolean;
  enabled: boolean;
  anomalyFlags: string[];
  source: 'ai' | 'heuristic' | 'user_override';
}

export interface NormalizationBlueprint {
  version: number;
  sessionId: string;
  datasetId: string;
  structuralPlan: StructuralAction[];
  columnPlan: ColumnNormalizationPlan[];
  createdAt: string;
  updatedAt: string;
}

export interface BlueprintApproval {
  approvedBlueprint: NormalizationBlueprint;
}

export interface ValidationRule {
  id: string;
  name: string;
  sql: string;
  severity: 'error' | 'warning';
  expected: string;
}

export interface ValidationIssue {
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warning';
  message: string;
  actual?: unknown;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  executedAt: string;
}

export interface PersistenceResult {
  manifest: DatasetManifest;
  storedOriginalPath: string | null;
  storedNormalizedPath: string | null;
  normalizedTableName: string | null;
}

export interface BlueprintPreview {
  originalPreview: Record<string, unknown>[];
  normalizedPreview: Record<string, unknown>[];
}

export interface BlueprintGenerationResult {
  manifest: DatasetManifest;
  workbook: RawWorkbook;
  profile: StatisticalProfile;
  diagnosis: StructuralDiagnosis;
  draftBlueprint: NormalizationBlueprint;
  preview: BlueprintPreview;
  derivedSchema: SchemaMap;
}
