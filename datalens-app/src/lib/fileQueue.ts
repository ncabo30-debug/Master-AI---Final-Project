/**
 * fileQueue.ts
 * Pure types and utilities for the multi-file state machine.
 * No React dependency — safe to import from anywhere.
 */

import type {
  SchemaMap,
  SchemaBlueprint,
  QuestionOption,
  VizProposal,
  ReportConfig,
  DataAnomaly,
  IssueReport,
  ReconciliationReport,
} from './agents/types';
import type {
  BlueprintPreview,
  DatasetManifest,
  NormalizationBlueprint,
  RawWorkbook,
  StatisticalProfile,
  ValidationReport,
} from './pipeline/types';

// ── File pipeline states ───────────────────────────────────

export type FileStatus =
  | 'QUEUED'
  | 'PROFILING'
  | 'BLUEPRINT_READY'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING_BLUEPRINT'
  | 'PERSISTING'
  | 'SQL_VALIDATING'
  | 'READY'
  | 'VALIDATION_FAILED'
  | 'ERROR';

/** States that occupy a processing slot (max 2 concurrent). */
const ACTIVE_STATES: FileStatus[] = [
  'PROFILING',
  'EXECUTING_BLUEPRINT',
  'PERSISTING',
  'SQL_VALIDATING',
];

// ── UI label / dot class mappings ─────────────────────────

export const FILE_STATUS_LABEL: Record<FileStatus, string> = {
  QUEUED:               'En cola',
  PROFILING:            'Generando blueprint...',
  BLUEPRINT_READY:      'Blueprint listo',
  AWAITING_APPROVAL:    'Esperando aprobación',
  EXECUTING_BLUEPRINT:  'Ejecutando blueprint...',
  PERSISTING:           'Persistiendo dataset...',
  SQL_VALIDATING:       'Validando con SQL...',
  READY:                'Listo',
  VALIDATION_FAILED:    'Validación fallida',
  ERROR:                'Error',
};

/** CSS class for the status dot. Defined as explicit strings so Tailwind never purges them. */
export const FILE_STATUS_DOT_CLASS: Record<FileStatus, string> = {
  QUEUED:               'dot-queued',
  PROFILING:            'dot-processing',
  BLUEPRINT_READY:      'dot-awaiting',
  AWAITING_APPROVAL:    'dot-awaiting',
  EXECUTING_BLUEPRINT:  'dot-processing',
  PERSISTING:           'dot-processing',
  SQL_VALIDATING:       'dot-processing',
  READY:                'dot-ready',
  VALIDATION_FAILED:    'dot-error',
  ERROR:                'dot-error',
};

// ── FileRecord ─────────────────────────────────────────────

export type ActiveTab = 'original' | 'schema' | 'normalization' | 'validation' | 'dashboard';

export interface FileRecord {
  fileId:           string;
  fileName:         string;
  sessionId:        string | null;
  status:           FileStatus;
  workbook:         RawWorkbook | null;
  manifest:         DatasetManifest | null;
  /** Raw rows parsed from the CSV (before any cleaning). */
  rawData:          Record<string, unknown>[] | null;
  originalFileBase64: string | null;
  /** Rows returned by the apply_cleaning API action. */
  cleanedData:      Record<string, unknown>[] | null;
  normalizedPreview: Record<string, unknown>[] | null;
  normalizedData:   Record<string, unknown>[] | null;
  schema:           SchemaMap | null;
  schemaBlueprint:  SchemaBlueprint | null;
  draftBlueprint:   NormalizationBlueprint | null;
  approvedBlueprint: NormalizationBlueprint | null;
  statisticalProfile: StatisticalProfile | null;
  validationReport: ValidationReport | null;
  questions:        QuestionOption[] | null;
  analysis:         string | null;
  analysisApproved: boolean;
  vizProposals:     VizProposal[] | null;
  reportConfig:     ReportConfig | null;
  dataAnomalies:    DataAnomaly[];
  /** H-5: Structured issue report from detection phase. */
  issueReport:      IssueReport | null;
  /** H-10: Reconciliation report after normalization. */
  reconciliationReport: ReconciliationReport | null;
  auditPassed:      boolean | null;
  activeTab:        ActiveTab;
  error:            string | null;
}

// ── Factory ────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createFileRecord(
  fileName: string,
  rawData: Record<string, unknown>[],
  extras?: {
    workbook?: RawWorkbook | null;
    originalFileBase64?: string | null;
  }
): FileRecord {
  return {
    fileId:           generateId(),
    fileName,
    sessionId:        null,
    status:           'QUEUED',
    workbook:         extras?.workbook ?? null,
    manifest:         null,
    rawData,
    originalFileBase64: extras?.originalFileBase64 ?? null,
    cleanedData:      null,
    normalizedPreview: null,
    normalizedData:   null,
    schema:           null,
    schemaBlueprint:  null,
    draftBlueprint:   null,
    approvedBlueprint: null,
    statisticalProfile: null,
    validationReport: null,
    questions:        null,
    analysis:         null,
    analysisApproved: false,
    vizProposals:     null,
    reportConfig:     null,
    dataAnomalies:    [],
    issueReport:      null,
    reconciliationReport: null,
    auditPassed:      null,
    activeTab:        'original',
    error:            null,
  };
}

// ── Queue predicates ───────────────────────────────────────

/** Returns count of files occupying an active processing slot. */
export function getActiveProcessingCount(files: Map<string, FileRecord>): number {
  let count = 0;
  for (const record of files.values()) {
    if (ACTIVE_STATES.includes(record.status)) count++;
  }
  return count;
}

/** Returns true if a new file can start processing (< 2 active). */
export function canStartProcessing(files: Map<string, FileRecord>): boolean {
  return getActiveProcessingCount(files) < 2;
}

/** Returns all files in READY state. */
export function getReadyFiles(files: Map<string, FileRecord>): FileRecord[] {
  return Array.from(files.values()).filter((r) => r.status === 'READY');
}

/** Returns the next QUEUED file by insertion order, or null. */
export function getNextQueued(files: Map<string, FileRecord>): FileRecord | null {
  for (const record of files.values()) {
    if (record.status === 'QUEUED') return record;
  }
  return null;
}
